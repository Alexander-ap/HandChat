export interface CeCslInferenceClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface CeCslPredictionItem {
  label: string;
  confidence: number;
}

export type CeCslPredictionSource = 'ce-csl' | 'ai' | 'rule' | 'mediapipe' | 'none';

export interface CeCslPrediction {
  label: string;
  confidence: number;
  source: CeCslPredictionSource;
  topK?: CeCslPredictionItem[];
  displayText?: string;
  ready?: boolean;
  frameId?: number;
  handsCount?: number;
  nnLabel?: string;
  nnConfidence?: number;
  rawRuleSign?: string;
}

interface PredictResponseBody {
  label?: unknown;
  confidence?: unknown;
  source?: unknown;
  top_k?: unknown;
}

interface FrameResponseBody {
  frame_id?: unknown;
  label?: unknown;
  display_text?: unknown;
  confidence?: unknown;
  source?: unknown;
  ready?: unknown;
  hands_count?: unknown;
  nn_label?: unknown;
  nn_confidence?: unknown;
  raw_rule_sign?: unknown;
}

export interface CeCslFrameRequest {
  sessionId: string;
  frameId: number;
  imageBase64Jpeg: string;
  mirror?: boolean;
}

export class CeCslInferenceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CeCslInferenceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async predict(frames: number[][]): Promise<CeCslPrediction> {
    const response = await this.postJson<PredictResponseBody>('/predict', { frames, top_k: 3 });
    if (typeof response.label !== 'string' || typeof response.confidence !== 'number') {
      throw new Error('CE-CSL inference response is invalid');
    }

    return {
      label: response.label,
      confidence: response.confidence,
      source: 'ce-csl',
      topK: parseTopK(response.top_k),
    };
  }

  async predictFrame(request: CeCslFrameRequest): Promise<CeCslPrediction> {
    const response = await this.postJson<FrameResponseBody>(`/sessions/${encodeURIComponent(request.sessionId)}/frame`, {
      frame_id: request.frameId,
      image_base64_jpeg: request.imageBase64Jpeg,
      mirror: request.mirror ?? true,
    });

    if (
      typeof response.label !== 'string' ||
      typeof response.confidence !== 'number' ||
      !isNativeSource(response.source)
    ) {
      throw new Error('CE-CSL frame inference response is invalid');
    }

    return {
      label: response.label,
      confidence: response.confidence,
      source: response.source,
      displayText: typeof response.display_text === 'string' ? response.display_text : undefined,
      ready: typeof response.ready === 'boolean' ? response.ready : undefined,
      frameId: typeof response.frame_id === 'number' ? response.frame_id : undefined,
      handsCount: typeof response.hands_count === 'number' ? response.hands_count : undefined,
      nnLabel: typeof response.nn_label === 'string' ? response.nn_label : undefined,
      nnConfidence: typeof response.nn_confidence === 'number' ? response.nn_confidence : undefined,
      rawRuleSign: typeof response.raw_rule_sign === 'string' ? response.raw_rule_sign : undefined,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        signal: controller.signal,
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`CE-CSL session delete failed with HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(path: string, payload: object): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`CE-CSL inference failed with HTTP ${response.status}`);
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isNativeSource(value: unknown): value is CeCslPredictionSource {
  return value === 'ai' || value === 'rule' || value === 'mediapipe' || value === 'none';
}

function parseTopK(value: unknown): CeCslPredictionItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      if (typeof candidate.label !== 'string' || typeof candidate.confidence !== 'number') {
        return null;
      }

      return {
        label: candidate.label,
        confidence: candidate.confidence,
      };
    })
    .filter((item): item is CeCslPredictionItem => item !== null);
}
