import {
  getBrowserSessionHistory,
  getBrowserSessionSummary,
  listBrowserSessions,
} from "./browserSessionStore";
import type { SessionDetail, SessionHistoryItem, SessionSummary } from "./types";

export class BrowserHandChatSessionApi {
  async getSessions(limit = 20, offset = 0): Promise<SessionSummary[]> {
    return listBrowserSessions(limit + offset).slice(offset, offset + limit);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const summary = getBrowserSessionSummary(sessionId);

    if (!summary) {
      throw new Error("本地会话不存在");
    }

    return {
      id: summary.id,
      status: summary.status,
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      translationCount: summary.translationCount,
    };
  }

  async getSessionHistory(sessionId: string, limit = 100): Promise<SessionHistoryItem[]> {
    return getBrowserSessionHistory(sessionId).slice(0, limit);
  }
}

export const browserSessionApi = new BrowserHandChatSessionApi();
