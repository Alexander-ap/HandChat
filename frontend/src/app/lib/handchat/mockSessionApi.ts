import type {
  SessionDetail,
  SessionHistoryItem,
  SessionSummary,
  TranslationResultType,
} from "./types";

export interface MockSessionApiOptions {
  delayMs?: number;
}

function wait(delayMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function buildHistoryItem(
  text: string,
  type: TranslationResultType,
  frameId: number,
  confidence: number,
  createdAt: string
): SessionHistoryItem {
  return {
    text,
    confidence,
    type,
    gestureLabel: text || null,
    frameId,
    createdAt,
  };
}

export class MockHandChatSessionApi {
  private readonly delayMs: number;

  constructor(options: MockSessionApiOptions = {}) {
    this.delayMs = options.delayMs ?? 250;
  }

  async getSessions(): Promise<SessionSummary[]> {
    await wait(this.delayMs);

    return [
      {
        id: "demo-session-001",
        status: "ended",
        startedAt: nowIso(-1000 * 60 * 15),
        endedAt: nowIso(-1000 * 60 * 10),
        translationCount: 5,
        lastTranslation: "很高兴认识你",
      },
      {
        id: "demo-session-002",
        status: "active",
        startedAt: nowIso(-1000 * 60 * 3),
        endedAt: null,
        translationCount: 2,
        lastTranslation: "你好",
      },
    ];
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    await wait(this.delayMs);

    return {
      id: sessionId,
      status: sessionId === "demo-session-002" ? "active" : "ended",
      startedAt: nowIso(-1000 * 60 * 15),
      endedAt: sessionId === "demo-session-002" ? null : nowIso(-1000 * 60 * 10),
      translationCount: 5,
    };
  }

  async getSessionHistory(sessionId?: string): Promise<SessionHistoryItem[]> {
    await wait(this.delayMs);

    const prefix = sessionId === "demo-session-002" ? "当前会话" : "历史会话";

    return [
      buildHistoryItem(`${prefix} partial`, "partial", 10, 0.82, nowIso(-1000 * 60 * 14)),
      buildHistoryItem("你好", "final", 12, 0.94, nowIso(-1000 * 60 * 14 + 800)),
      buildHistoryItem("", "sentence_end", 30, 1, nowIso(-1000 * 60 * 13)),
      buildHistoryItem("很高兴认识你", "sentence_final", 32, 0.98, nowIso(-1000 * 60 * 13 + 500)),
    ];
  }
}

export const mockSessionApi = new MockHandChatSessionApi();
