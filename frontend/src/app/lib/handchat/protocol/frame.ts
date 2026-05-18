import type { FrameCrop, FramePayload } from "../types";

function stripDataUrlPrefix(dataUrl: string) {
  const index = dataUrl.indexOf(",");
  if (index < 0) return dataUrl;
  return dataUrl.slice(index + 1);
}

export async function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  quality = 0.85
): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) reject(new Error("toBlob failed"));
        else resolve(result);
      },
      "image/jpeg",
      quality
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read blob failed"));
    reader.readAsDataURL(blob);
  });

  return stripDataUrlPrefix(dataUrl);
}

export function buildFramePayload(params: {
  sessionId: string;
  frameId: number;
  timestampMs: number;
  imageBase64Jpeg: string;
  width: number;
  height: number;
  crop?: FrameCrop;
  fpsActual?: number;
  devicePixelRatio?: number;
}): FramePayload {
  return {
    session_id: params.sessionId,
    frame_id: params.frameId,
    timestamp_ms: params.timestampMs,
    image: {
      data: params.imageBase64Jpeg,
      width: params.width,
      height: params.height,
      colorspace: "RGB",
      crop: params.crop,
    },
    client_metadata: {
      fps_actual: params.fpsActual,
      device_pixel_ratio: params.devicePixelRatio,
    },
  };
}

