import { WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { logger } from './logger';
import { createSession, endSession, saveTranslation, getSession } from './services/sessionService';
import { validateSessionStart, validateFrameMessage, validateKeypointsMessage, validateTranslationMessage, sendError } from './validators';
import { startFakeTranslation } from './fakeTranslator';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

type WSMessage = {
  type: string;
  payload: Record<string, unknown>;
  trace_id: string;
  timestamp_ms: number;
};

export function handleConnection(ws: WebSocket & { isAlive?: boolean }) {
  let sessionId: string | null = null;
  let cleanup: (() => void) | null = null;

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

        safeSend({
          type: 'session_created',
          payload: { session_id: sessionId },
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
        logger.debug('Frame received', { sessionId, frameId: payload.frame_id });
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
        const hands = payload.hands as unknown[];
        logger.debug('Keypoints received', { sessionId, frameId: payload.frame_id, handsCount: hands.length });
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
    if (sessionId) {
      await endSession(sessionId);
    }
    logger.info('WebSocket client disconnected', { sessionId });
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { sessionId, error: err.message });
  });
}
