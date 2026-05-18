import { logger } from './logger';
import { saveTranslation } from './services/sessionService';

const CYCLE = [
  { text: "你好", label: "hello" },
  { text: "我", label: "me" },
  { text: "我叫", label: "me" },
  { text: "我叫李明", label: "name" },
  { text: "很高兴认识你", label: "nice" },
];

export function startFakeTranslation(
  send: (msg: object) => void,
  sessionId: string
): () => void {
  let i = 0;
  let frameId = 0;
  logger.info('Fake translation started', { sessionId });

  const timer = setInterval(() => {
    const item = CYCLE[i % CYCLE.length];
    const type = (i + 1) % 4 === 0 ? 'sentence_end' : 'final';
    const confidence = 0.9 + Math.random() * 0.1;

    const msg = {
      type: 'translation',
      payload: {
        session_id: sessionId,
        frame_id: frameId,
        type,
        text: item.text,
        confidence,
        gesture_label: item.label,
        timestamp_ms: Date.now(),
      },
      trace_id: crypto.randomUUID(),
      timestamp_ms: Date.now(),
    };

    send(msg);
    saveTranslation(sessionId, frameId, item.text, confidence, type, item.label);

    frameId++;
    i++;
  }, 1800);

  return () => {
    clearInterval(timer);
    logger.info('Fake translation stopped', { sessionId });
  };
}
