import { WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { logger } from './logger';
import { createSession, endSession, saveTranslation, getSession } from './services/sessionService';
import { validateSessionStart, validateFrameMessage, validateKeypointsMessage, validateTranslationMessage, sendError } from './validators';
import { startFakeTranslation } from './fakeTranslator';
import { CeCslInferenceClient } from './services/ceCslInferenceClient';
import { ServerTranslationStream, type TranslationPayload } from './services/serverTranslationStream';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
const ceCslClient = new CeCslInferenceClient({
  baseUrl: config.ceCsl.inferenceUrl,
  timeoutMs: config.ceCsl.inferenceTimeoutMs,
});

type WSMessage = {
  type: string;
  payload: Record<string, unknown>;
  trace_id: string;
  timestamp_ms: number;
};

type FramePayload = {
  session_id: string;
  frame_id: number;
  image: {
    data: string;
  };
  client_metadata?: {
    mirror?: boolean;
  };
};

export function handleConnection(ws: WebSocket & { isAlive?: boolean }) {
  let sessionId: string | null = null;
  let cleanup: (() => void) | null = null;
  let lastInferenceErrorAt = 0;
  let frameInferenceInFlight = false;
  let currentSessionActive = false;
  const translationStream = new ServerTranslationStream({
    confidenceThreshold: config.ceCsl.confidenceThreshold,
    finalConfidenceThreshold: config.ceCsl.finalConfidenceThreshold,
    stableCount: config.ceCsl.stableCount,
    sentencePauseMs: config.ceCsl.sentencePauseMs,
  });

  logger.info('WebSocket client connected');

  function safeSend(msg: object) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        cleanup?.();
        cleanup = null;
      }
    }
  }

  async function emitTranslation(payload: TranslationPayload, traceId: string) {
    safeSend({
      type: 'translation',
      payload,
      trace_id: traceId,
      timestamp_ms: Date.now(),
    });

    if (payload.type === 'final' || payload.type === 'sentence_final') {
      await saveTranslation(
        payload.session_id,
        payload.frame_id,
        payload.text,
        payload.confidence,
        payload.type,
        payload.gesture_label,
      );
    }
  }

  function sendInferenceError(traceId: string, message: string) {
    const now = Date.now();
    if (now - lastInferenceErrorAt < 5000) {
      return;
    }

    lastInferenceErrorAt = now;
    sendError(ws, traceId, 5030, message);
  }

  async function releaseCeCslSession(activeSessionId: string) {
    if (!config.ceCsl.enabled) {
      return;
    }

    try {
      await ceCslClient.deleteSession(activeSessionId);
    } catch (error) {
      logger.debug('CE-CSL session release failed', {
        sessionId: activeSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  ws.on('message', async (data: Buffer) => {
    ws.isAlive = true;

    let msg: WSMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendError(ws, 'unknown', 4001, 'Invalid JSON');
      return;
    }

    const { type, payload, trace_id } = msg;

    switch (type) {
      case 'session_start': {
        const err = validateSessionStart(payload);
        if (err) { sendError(ws, trace_id, 4001, err); return; }

        const token = payload.token as string | undefined;
        if (!token) { sendError(ws, trace_id, 4003, '缺少认证 token'); return; }

        let userId: string;
        try {
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !user) {
            sendError(ws, trace_id, 4003, 'token 无效或已过期');
            return;
          }
          userId = user.id;
        } catch {
          sendError(ws, trace_id, 4003, '认证服务不可用');
          return;
        }

        const resumeId = payload.resume_session_id as string | undefined;
        if (resumeId) {
          const existingSession = await getSession(resumeId);
          if (existingSession && existingSession.status === 'active' && existingSession.userId === userId) {
            sessionId = resumeId;
            logger.info('Session resumed', { sessionId, userId });
          } else {
            const newSession = await createSession(userId);
            sessionId = newSession.id;
          }
        } else {
          const newSession = await createSession(userId);
          sessionId = newSession.id;
        }

        currentSessionActive = true;
        safeSend({
          type: 'session_created',
          payload: { id: sessionId, status: 'active' },
          trace_id: crypto.randomUUID(),
          timestamp_ms: Date.now(),
        });

        if (process.env.FAKE_TRANSLATION === 'true') {
          cleanup = startFakeTranslation(safeSend, sessionId);
        }
        break;
      }

      case 'frame': {
        if (!sessionId) { sendError(ws, trace_id, 4002, 'No active session'); return; }
        const err = validateFrameMessage(payload);
        if (err) {
          sendError(ws, trace_id, 4001, err);
          logger.warn('Invalid frame', { sessionId, error: err });
          return;
        }

        const framePayload = payload as unknown as FramePayload;
        if (framePayload.session_id !== sessionId) {
          sendError(ws, trace_id, 4004, 'session_id 不匹配');
          return;
        }

        logger.debug('Frame received', { sessionId, frameId: framePayload.frame_id });
        if (!config.ceCsl.enabled || frameInferenceInFlight) {
          break;
        }

        const activeSessionId = sessionId;
        frameInferenceInFlight = true;
        void (async () => {
          try {
            const prediction = await ceCslClient.predictFrame({
              sessionId: activeSessionId,
              frameId: framePayload.frame_id,
              imageBase64Jpeg: framePayload.image.data,
              mirror: framePayload.client_metadata?.mirror ?? true,
            });
            if (!currentSessionActive || sessionId !== activeSessionId || ws.readyState !== WebSocket.OPEN) {
              return;
            }

            const messages = translationStream.update({
              sessionId: activeSessionId,
              frameId: framePayload.frame_id,
              timestampMs: Date.now(),
              prediction: prediction.ready === false ? null : prediction,
            });

            for (const message of messages) {
              await emitTranslation(message, trace_id);
            }
          } catch (error) {
            logger.warn('CE-CSL frame inference failed', {
              sessionId: activeSessionId,
              frameId: framePayload.frame_id,
              error: error instanceof Error ? error.message : String(error),
            });
            sendInferenceError(trace_id, 'CE-CSL 推理超时或繁忙，系统会继续重试；如果长时间无结果，请重启 Python 模型服务。');
          } finally {
            frameInferenceInFlight = false;
          }
        })();
        break;
      }

      case 'keypoints': {
        if (!sessionId) { sendError(ws, trace_id, 4002, 'No active session'); return; }
        const err = validateKeypointsMessage(payload);
        if (err) {
          sendError(ws, trace_id, 4001, err);
          logger.warn('Invalid keypoints', { sessionId, error: err });
          return;
        }

        if (payload.session_id !== sessionId) {
          sendError(ws, trace_id, 4004, 'session_id 不匹配');
          return;
        }

        logger.debug('Keypoints received for preview', {
          sessionId,
          frameId: payload.frame_id,
          handsCount: Array.isArray(payload.hands) ? payload.hands.length : 0,
        });
        break;
      }

      case 'translation': {
        if (!sessionId) { sendError(ws, trace_id, 4002, 'No active session'); return; }
        const err = validateTranslationMessage(payload);
        if (err) {
          sendError(ws, trace_id, 4001, err);
          logger.warn('Invalid translation', { sessionId, error: err });
          return;
        }
        await saveTranslation(
          sessionId,
          (payload.frame_id as number) ?? 0,
          payload.text as string,
          (payload.confidence as number) ?? 0,
          (payload.type as string) ?? 'final',
          payload.gesture_label as string | undefined,
        );
        logger.debug('Translation saved', { sessionId, text: (payload.text as string).slice(0, 20) });
        break;
      }

      case 'session_end': {
        if (!sessionId || payload.session_id !== sessionId) {
          sendError(ws, trace_id, 4004, 'session_id 不匹配');
          return;
        }
        cleanup?.();
        cleanup = null;
        currentSessionActive = false;
        await releaseCeCslSession(sessionId);
        await endSession(sessionId);
        ws.close(1000, 'Session ended');
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          trace_id,
          timestamp_ms: Date.now(),
        }));
        break;

      default:
        sendError(ws, trace_id, 4001, `Unknown message type: ${type}`);
    }
  });

  ws.on('close', async () => {
    cleanup?.();
    cleanup = null;
    currentSessionActive = false;
    if (sessionId) {
      await releaseCeCslSession(sessionId);
      await endSession(sessionId);
    }
    logger.info('WebSocket client disconnected', { sessionId });
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { sessionId, error: err.message });
  });
}
