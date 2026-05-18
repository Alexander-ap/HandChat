import type { TranslationPayload } from "./types";

export interface LocalTranslationStreamOptions {
  partialFrameStep?: number;
  sentencePauseMs?: number;
}

export class LocalTranslationStream {
  private readonly partialFrameStep: number;
  private readonly sentencePauseMs: number;
  private lastPartialFrameId = -1;
  private lastPartialText = "";
  private lastFinalText = "";
  private lastActivityAt = 0;
  private sentenceClosed = false;

  constructor(options: LocalTranslationStreamOptions = {}) {
    this.partialFrameStep = options.partialFrameStep ?? 3;
    this.sentencePauseMs = options.sentencePauseMs ?? 1500;
  }

  reset() {
    this.lastPartialFrameId = -1;
    this.lastPartialText = "";
    this.lastFinalText = "";
    this.lastActivityAt = 0;
    this.sentenceClosed = false;
  }

  update(params: {
    sessionId: string;
    frameId: number;
    timestampMs: number;
    liveSign: string;
    confirmedSign?: string | null;
    confidence?: number;
  }): TranslationPayload[] {
    const confidence = params.confidence ?? (params.confirmedSign ? 0.92 : 0.72);
    const messages: TranslationPayload[] = [];

    if (params.liveSign) {
      this.lastActivityAt = params.timestampMs;
      this.sentenceClosed = false;

      const shouldEmitPartial =
        this.lastPartialText !== params.liveSign ||
        this.lastPartialFrameId < 0 ||
        params.frameId - this.lastPartialFrameId >= this.partialFrameStep;

      if (shouldEmitPartial) {
        this.lastPartialFrameId = params.frameId;
        this.lastPartialText = params.liveSign;
        messages.push({
          session_id: params.sessionId,
          frame_id: params.frameId,
          type: "partial",
          text: params.liveSign,
          confidence,
          gesture_label: params.liveSign,
        });
      }
    }

    if (params.confirmedSign && params.confirmedSign !== this.lastFinalText) {
      this.lastFinalText = params.confirmedSign;
      this.lastPartialText = "";
      this.lastActivityAt = params.timestampMs;
      messages.push({
        session_id: params.sessionId,
        frame_id: params.frameId,
        type: "final",
        text: params.confirmedSign,
        confidence: Math.max(confidence, 0.9),
        gesture_label: params.confirmedSign,
      });
    }

    if (
      !params.liveSign &&
      !this.sentenceClosed &&
      this.lastActivityAt > 0 &&
      params.timestampMs - this.lastActivityAt >= this.sentencePauseMs
    ) {
      this.sentenceClosed = true;
      this.lastPartialText = "";
      this.lastFinalText = "";
      messages.push({
        session_id: params.sessionId,
        frame_id: params.frameId,
        type: "sentence_end",
        text: "",
        confidence: 1,
      });
    }

    return messages;
  }
}
