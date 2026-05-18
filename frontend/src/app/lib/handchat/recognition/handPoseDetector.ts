import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";

export type HandDetector = handPoseDetection.HandDetector;

export interface CreateHandDetectorOptions {
  maxHands?: number;
}

async function ensureBackendReady() {
  try {
    await tf.setBackend("webgl");
    await tf.ready();
    return;
  } catch (_) {}

  await tf.setBackend("cpu");
  await tf.ready();
}

export async function createHandDetector(
  options: CreateHandDetectorOptions = {}
): Promise<HandDetector> {
  await ensureBackendReady();

  return handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
    runtime: "tfjs",
    modelType: "lite",
    maxHands: options.maxHands ?? 2,
  });
}

