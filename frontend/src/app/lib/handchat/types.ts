export type Handedness = "Left" | "Right";

export type TranslationResultType =
  | "partial"
  | "final"
  | "sentence_end"
  | "sentence_final";

export interface MessageEnvelope<TType extends string, TPayload> {
  type: TType;
  payload: TPayload;
  trace_id: string;
  timestamp_ms: number;
}

export interface FrameCrop {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FrameImagePayload {
  data: string;
  width: number;
  height: number;
  colorspace: "RGB";
  crop?: FrameCrop;
}

export interface FrameClientMetadata {
  fps_actual?: number;
  device_pixel_ratio?: number;
}

export interface FramePayload {
  session_id: string;
  frame_id: number;
  timestamp_ms: number;
  image: FrameImagePayload;
  client_metadata?: FrameClientMetadata;
}

export type FrameMessage = MessageEnvelope<"frame", FramePayload>;

export interface HandLandmark2D {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmark3D {
  x: number;
  y: number;
  z: number;
}

export interface DetectedHandPayload {
  handedness: Handedness;
  score: number;
  keypoints: HandLandmark2D[];
  keypoints_3d: HandLandmark3D[];
}

export interface KeypointsPayload {
  session_id: string;
  frame_id: number;
  hands: DetectedHandPayload[];
}

export type KeypointsMessage = MessageEnvelope<"keypoints", KeypointsPayload>;

export interface TranslationPayload {
  session_id: string;
  frame_id: number;
  type: TranslationResultType;
  text: string;
  confidence: number;
  gesture_label?: string;
}

export type TranslationMessage = MessageEnvelope<"translation", TranslationPayload>;

export interface SessionStartPayload {
  token: string;
  resume_session_id?: string;
}

export type SessionStartMessage = MessageEnvelope<"session_start", SessionStartPayload>;

export interface SessionCreatedPayload {
  id: string;
  status: "active" | "ended";
}

export type SessionCreatedMessage = MessageEnvelope<"session_created", SessionCreatedPayload>;

export interface SessionEndPayload {
  session_id: string;
}

export type SessionEndMessage = MessageEnvelope<"session_end", SessionEndPayload>;

export interface PingPayload {
  session_id?: string;
}

export type PingMessage = MessageEnvelope<"ping", PingPayload>;
export type PongMessage = MessageEnvelope<"pong", Record<string, never>>;

export interface ErrorPayload {
  error: string;
  code?: number;
}

export type ErrorMessage = MessageEnvelope<"error", ErrorPayload>;

export type HandChatServerMessage =
  | SessionCreatedMessage
  | TranslationMessage
  | PongMessage
  | ErrorMessage;

export type HandChatClientMessage =
  | SessionStartMessage
  | FrameMessage
  | KeypointsMessage
  | TranslationMessage
  | SessionEndMessage
  | PingMessage;

export interface SessionSummary {
  id: string;
  status: "active" | "ended";
  startedAt: string;
  endedAt: string | null;
  translationCount: number;
  lastTranslation: string | null;
}

export interface SessionDetail {
  id: string;
  status: "active" | "ended";
  startedAt: string;
  endedAt: string | null;
  translationCount: number;
}

export interface SessionHistoryItem {
  text: string;
  confidence: number;
  type: TranslationResultType;
  gestureLabel: string | null;
  frameId: number;
  createdAt: string;
}

export interface ApiErrorResponse {
  error: string;
  code?: number;
}
