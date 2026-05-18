import type { FrameCrop } from "../types";

export const HANDCHAT_FRAME_SIZE = 256;

export interface SquareCaptureResult {
  width: number;
  height: number;
  crop: FrameCrop;
}

export function drawVideoFrameToSquareCanvas(params: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  size?: number;
}): SquareCaptureResult {
  const { video, canvas, size = HANDCHAT_FRAME_SIZE } = params;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("视频尺寸不可用，无法采集帧");
  }

  const cropSize = Math.min(sourceWidth, sourceHeight);
  const cropX = Math.max(0, (sourceWidth - cropSize) / 2);
  const cropY = Math.max(0, (sourceHeight - cropSize) / 2);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("无法获取采集画布上下文");
  }

  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, size, size);

  return {
    width: size,
    height: size,
    crop: {
      x: cropX,
      y: cropY,
      width: cropSize,
      height: cropSize,
    },
  };
}
