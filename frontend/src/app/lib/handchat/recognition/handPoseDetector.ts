import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";

// #region debug-point D:browser-detector
const __DBG_URL__ = "http://127.0.0.1:7777/event";
async function __dbgReport__(payload: Record<string, unknown>) {
  if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_TELEMETRY === "true")) return;
  try {
    await fetch(__DBG_URL__, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "web-smoke-check",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "frontend/src/app/lib/handchat/recognition/handPoseDetector.ts",
        msg: "[DEBUG] Browser detector",
        ts: Date.now(),
        src: "frontend",
        ...payload,
      }),
    });
  } catch (_) {}
}
// #endregion

export type HandDetector = handPoseDetection.HandDetector;

export interface CreateHandDetectorOptions {
  maxHands?: number;
}

async function ensureBackendReady() {
  try {
    // #region debug-point D:backend-webgl
    void __dbgReport__({
      evt: "detector.backend.webgl.begin",
      backend: tf.getBackend?.() ?? null,
    });
    // #endregion
    await tf.setBackend("webgl");
    await tf.ready();
    // #region debug-point D:backend-webgl-ok
    void __dbgReport__({
      evt: "detector.backend.webgl.ready",
      backend: tf.getBackend?.() ?? null,
    });
    // #endregion
    return;
  } catch (error) {
    // #region debug-point D:backend-webgl-error
    void __dbgReport__({
      evt: "detector.backend.webgl.error",
      message: (error as any)?.message ?? String(error),
    });
    // #endregion
  }

  await tf.setBackend("cpu");
  await tf.ready();
  // #region debug-point D:backend-cpu-ready
  void __dbgReport__({
    evt: "detector.backend.cpu.ready",
    backend: tf.getBackend?.() ?? null,
  });
  // #endregion
}

export async function createHandDetector(
  options: CreateHandDetectorOptions = {}
): Promise<HandDetector> {
  await ensureBackendReady();
  // #region debug-point D:create-detector
  void __dbgReport__({
    evt: "detector.create.begin",
    maxHands: options.maxHands ?? 2,
  });
  // #endregion

  const detector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
    runtime: "tfjs",
    modelType: "lite",
    maxHands: options.maxHands ?? 2,
  });
  // #region debug-point D:create-detector-ok
  void __dbgReport__({
    evt: "detector.create.ready",
    runtime: "tfjs",
    modelType: "lite",
    maxHands: options.maxHands ?? 2,
  });
  // #endregion
  return detector;
}

