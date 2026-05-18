import { WebSocket } from 'ws';
import { logger } from './logger';

export function sendError(ws: WebSocket, traceId: string, code: number, message: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { code, message },
      trace_id: traceId,
      timestamp_ms: Date.now(),
    }));
  }
}

export function validateSessionStart(payload: Record<string, unknown>): string | null {
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return '缺少 session_id 字段';
  }
  return null;
}

export function validateFrameMessage(payload: Record<string, unknown>): string | null {
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return '缺少 session_id';
  }
  if (payload.frame_id === undefined || typeof payload.frame_id !== 'number') {
    return '缺少 frame_id';
  }
  if (!payload.image || typeof payload.image !== 'object') {
    return '缺少 image 字段';
  }
  const image = payload.image as Record<string, unknown>;
  if (!image.data || typeof image.data !== 'string' || image.data.length === 0) {
    return 'image.data 为空';
  }
  if (typeof image.width !== 'number' || typeof image.height !== 'number') {
    return 'image.width/height 无效';
  }
  if (image.colorspace !== 'RGB') {
    logger.warn(`Frame colorspace=${image.colorspace}, expected RGB`);
  }
  return null;
}

export function validateKeypointsMessage(payload: Record<string, unknown>): string | null {
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return '缺少 session_id';
  }
  if (payload.frame_id === undefined || typeof payload.frame_id !== 'number') {
    return '缺少 frame_id';
  }
  if (!Array.isArray(payload.hands)) {
    return 'hands 必须是数组';
  }
  if (payload.hands.length > 2) {
    return 'hands 数组长度不能超过 2';
  }

  for (let hi = 0; hi < payload.hands.length; hi++) {
    const hand = payload.hands[hi] as Record<string, unknown>;

    if (!hand.handedness || (hand.handedness !== 'Left' && hand.handedness !== 'Right')) {
      return `hands[${hi}].handedness 必须为 'Left' 或 'Right'`;
    }

    if (typeof hand.score !== 'number' || hand.score < 0 || hand.score > 1) {
      return `hands[${hi}].score 必须是 0-1 之间的数值`;
    }
    if (hand.score < 0.5) {
      logger.warn(`hand[${hi}] low confidence score=${hand.score}`);
    }

    if (!Array.isArray(hand.keypoints) || hand.keypoints.length !== 21) {
      return `hands[${hi}].keypoints 必须是长度为 21 的数组`;
    }
    for (let ki = 0; ki < (hand.keypoints as unknown[]).length; ki++) {
      const kp = (hand.keypoints as unknown[])[ki] as Record<string, unknown>;
      if (typeof kp.x !== 'number' || typeof kp.y !== 'number' || typeof kp.z !== 'number') {
        return `hands[${hi}].keypoints[${ki}] 缺少 x/y/z 坐标`;
      }
    }

    if (!Array.isArray(hand.keypoints_3d) || hand.keypoints_3d.length !== 21) {
      return `hands[${hi}].keypoints_3d 必须是长度为 21 的数组`;
    }
    for (let wi = 0; wi < (hand.keypoints_3d as unknown[]).length; wi++) {
      const wp = (hand.keypoints_3d as unknown[])[wi] as Record<string, unknown>;
      if (typeof wp.x !== 'number' || typeof wp.y !== 'number' || typeof wp.z !== 'number') {
        return `hands[${hi}].keypoints_3d[${wi}] 缺少 x/y/z 坐标`;
      }
    }
  }

  return null;
}

export function validateTranslationMessage(payload: Record<string, unknown>): string | null {
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return '缺少 session_id';
  }
  if (!payload.text || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    return 'translation 消息缺少 text 字段或 text 为空';
  }
  if (payload.frame_id !== undefined && typeof payload.frame_id !== 'number') {
    return 'frame_id 必须是数值';
  }
  if (payload.confidence !== undefined && (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1)) {
    return 'confidence 必须是 0-1 之间的数值';
  }
  if (payload.type && typeof payload.type !== 'string') {
    return 'type 必须是字符串';
  }
  return null;
}
