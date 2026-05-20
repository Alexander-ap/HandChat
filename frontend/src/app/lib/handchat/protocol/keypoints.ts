import type {
  DetectedHandPayload,
  FrameCrop,
  HandLandmark2D,
  HandLandmark3D,
  KeypointsPayload,
} from "../types";

function finiteNumber(value: number | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: number, fallback = 1) {
  const finite = finiteNumber(value, fallback);
  return finite > 0 ? finite : fallback;
}

function clamp01(value: number) {
  const finite = finiteNumber(value);
  if (finite < 0) return 0;
  if (finite > 1) return 1;
  return finite;
}

function normalizeLandmarks2D(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  width: number,
  height: number
): HandLandmark2D[] {
  const safeWidth = positiveNumber(width);
  const safeHeight = positiveNumber(height);

  return landmarks.map((p) => ({
    x: clamp01(finiteNumber(p.x) / safeWidth),
    y: clamp01(finiteNumber(p.y) / safeHeight),
    z: finiteNumber(p.z),
  }));
}

function mapLandmarks3D(landmarks: Array<{ x: number; y: number; z: number }>): HandLandmark3D[] {
  return landmarks.map((p) => ({
    x: finiteNumber(p.x),
    y: finiteNumber(p.y),
    z: finiteNumber(p.z),
  }));
}

export function projectLandmarksToFrame(params: {
  landmarks: Array<{ x: number; y: number; z?: number }>;
  crop: Required<Pick<FrameCrop, "x" | "y" | "width" | "height">>;
  outputWidth: number;
  outputHeight: number;
}) {
  const cropX = finiteNumber(params.crop.x);
  const cropY = finiteNumber(params.crop.y);
  const cropWidth = positiveNumber(params.crop.width, positiveNumber(params.outputWidth));
  const cropHeight = positiveNumber(params.crop.height, positiveNumber(params.outputHeight));
  const outputWidth = positiveNumber(params.outputWidth);
  const outputHeight = positiveNumber(params.outputHeight);

  return params.landmarks.map((point) => ({
    x: finiteNumber(((finiteNumber(point.x) - cropX) / cropWidth) * outputWidth),
    y: finiteNumber(((finiteNumber(point.y) - cropY) / cropHeight) * outputHeight),
    z: finiteNumber(point.z),
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
    score: clamp01(hand.score),
    keypoints: normalizeLandmarks2D(hand.keypoints, params.imageWidth, params.imageHeight),
    keypoints_3d: hand.keypoints3D ? mapLandmarks3D(hand.keypoints3D) : [],
  }));

  return {
    session_id: params.sessionId,
    frame_id: params.frameId,
    hands: mappedHands,
  };
}
