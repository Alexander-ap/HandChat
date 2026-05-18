import type {
  DetectedHandPayload,
  FrameCrop,
  HandLandmark2D,
  HandLandmark3D,
  KeypointsPayload,
} from "../types";

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeLandmarks2D(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  width: number,
  height: number
): HandLandmark2D[] {
  return landmarks.map((p) => ({
    x: clamp01(p.x / width),
    y: clamp01(p.y / height),
    z: typeof p.z === "number" ? p.z : 0,
  }));
}

function mapLandmarks3D(landmarks: Array<{ x: number; y: number; z: number }>): HandLandmark3D[] {
  return landmarks.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
  }));
}

export function projectLandmarksToFrame(params: {
  landmarks: Array<{ x: number; y: number; z?: number }>;
  crop: Required<Pick<FrameCrop, "x" | "y" | "width" | "height">>;
  outputWidth: number;
  outputHeight: number;
}) {
  return params.landmarks.map((point) => ({
    x: ((point.x - params.crop.x) / params.crop.width) * params.outputWidth,
    y: ((point.y - params.crop.y) / params.crop.height) * params.outputHeight,
    z: point.z,
  }));
}

export function buildKeypointsPayload(params: {
  sessionId: string;
  frameId: number;
  hands: Array<{
    handedness: "Left" | "Right";
    score: number;
    keypoints: Array<{ x: number; y: number; z?: number }>;
    keypoints3D?: Array<{ x: number; y: number; z: number }>;
  }>;
  imageWidth: number;
  imageHeight: number;
}): KeypointsPayload {
  const mappedHands: DetectedHandPayload[] = params.hands.map((hand) => ({
    handedness: hand.handedness,
    score: hand.score,
    keypoints: normalizeLandmarks2D(hand.keypoints, params.imageWidth, params.imageHeight),
    keypoints_3d: hand.keypoints3D ? mapLandmarks3D(hand.keypoints3D) : [],
  }));

  return {
    session_id: params.sessionId,
    frame_id: params.frameId,
    hands: mappedHands,
  };
}
