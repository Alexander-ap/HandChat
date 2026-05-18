export interface HandDetector {
  estimateHands: (
    video: HTMLVideoElement,
    options?: { flipHorizontal?: boolean }
  ) => Promise<Array<{
    handedness: "Left" | "Right";
    score: number;
    keypoints: Array<{ x: number; y: number; z: number }>;
    keypoints3D: Array<{ x: number; y: number; z: number }>;
  }>>;
  dispose?: () => void;
}

export interface CreateHandDetectorOptions {
  maxHands?: number;
}

export async function createHandDetector(
  _options: CreateHandDetectorOptions = {}
): Promise<HandDetector> {
  throw new Error(
    "手部检测模型尚未集成。请接入 @mediapipe/tasks-vision 或替换实现。"
  );
}
