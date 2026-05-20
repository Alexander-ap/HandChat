import type { CeCslPrediction } from './ceCslInferenceClient';

export type TranslationResultType = 'partial' | 'final' | 'sentence_end' | 'sentence_final';

export interface TranslationPayload {
  session_id: string;
  frame_id: number;
  type: TranslationResultType;
  text: string;
  confidence: number;
  gesture_label?: string;
}

export interface ServerTranslationStreamOptions {
  confidenceThreshold?: number;
  finalConfidenceThreshold?: number;
  stableCount?: number;
  partialFrameStep?: number;
  sentencePauseMs?: number;
  noActionLabels?: string[];
}

export class ServerTranslationStream {
  private readonly confidenceThreshold: number;
  private readonly finalConfidenceThreshold: number;
  private readonly stableCountTarget: number;
  private readonly partialFrameStep: number;
  private readonly sentencePauseMs: number;
  private readonly noActionLabels: Set<string>;

  private lastPartialFrameId = -1;
  private lastPartialText = '';
  private lastFinalText = '';
  private stableLabel = '';
  private stableCount = 0;
  private lastActivityAt = 0;
  private sentenceClosed = false;

  constructor(options: ServerTranslationStreamOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.8;
    this.finalConfidenceThreshold = options.finalConfidenceThreshold ?? 0.85;
    this.stableCountTarget = Math.max(1, options.stableCount ?? 3);
    this.partialFrameStep = Math.max(1, options.partialFrameStep ?? 3);
    this.sentencePauseMs = options.sentencePauseMs ?? 1500;
    this.noActionLabels = new Set(options.noActionLabels ?? ['无动作', '等待输入...', '无']);
  }

  update(params: {
    sessionId: string;
    frameId: number;
    timestampMs: number;
    prediction?: CeCslPrediction | null;
  }): TranslationPayload[] {
    const messages: TranslationPayload[] = [];
    const prediction = params.prediction;
    const label = prediction?.label.trim() ?? '';
    const isActivePrediction = Boolean(
      prediction &&
      label &&
      prediction.confidence >= this.confidenceThreshold &&
      !this.noActionLabels.has(label)
    );

    if (!isActivePrediction || !prediction) {
      this.resetStableState();
      return this.maybeCloseSentence(params);
    }

    this.lastActivityAt = params.timestampMs;
    this.sentenceClosed = false;

    const shouldEmitPartial =
      this.lastPartialText !== label ||
      this.lastPartialFrameId < 0 ||
      params.frameId - this.lastPartialFrameId >= this.partialFrameStep;

    if (shouldEmitPartial) {
      this.lastPartialText = label;
      this.lastPartialFrameId = params.frameId;
      messages.push({
        session_id: params.sessionId,
        frame_id: params.frameId,
        type: 'partial',
        text: label,
        confidence: prediction.confidence,
        gesture_label: label,
      });
    }

    if (this.stableLabel === label) {
      this.stableCount += 1;
    } else {
      this.stableLabel = label;
      this.stableCount = 1;
    }

    if (
      this.stableCount >= this.stableCountTarget &&
      prediction.confidence >= this.finalConfidenceThreshold &&
      label !== this.lastFinalText
    ) {
      this.lastFinalText = label;
      this.lastPartialText = '';
      messages.push({
        session_id: params.sessionId,
        frame_id: params.frameId,
        type: 'final',
        text: label,
        confidence: prediction.confidence,
        gesture_label: label,
      });
    }

    return messages;
  }

  private maybeCloseSentence(params: { sessionId: string; frameId: number; timestampMs: number }) {
    if (
      !this.sentenceClosed &&
      this.lastActivityAt > 0 &&
      params.timestampMs - this.lastActivityAt >= this.sentencePauseMs
    ) {
      this.sentenceClosed = true;
      this.lastPartialText = '';
      this.lastFinalText = '';
      return [{
        session_id: params.sessionId,
        frame_id: params.frameId,
        type: 'sentence_end' as const,
        text: '',
        confidence: 1,
      }];
    }

    return [];
  }

  private resetStableState() {
    this.stableLabel = '';
    this.stableCount = 0;
  }
}
