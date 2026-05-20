import { publicAnonKey } from "/utils/supabase/info";
import { getCurrentAuthToken } from "../api";
import type {
  ApiErrorResponse,
  SessionDetail,
  SessionHistoryItem,
  SessionSummary,
} from "./types";
import { HANDCHAT_DEFAULT_API_URL } from "./runtime";

export interface SessionApiConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

async function defaultGetAccessToken() {
  return getCurrentAuthToken();
}

export class HandChatSessionApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string | null>;

  constructor(config: SessionApiConfig = {}) {
    this.baseUrl = config.baseUrl ?? HANDCHAT_DEFAULT_API_URL;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.getAccessToken = config.getAccessToken ?? defaultGetAccessToken;
  }

  async getSessions(limit = 20, offset = 0): Promise<SessionSummary[]> {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    return this.request<SessionSummary[]>(`/sessions?${query.toString()}`);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    return this.request<SessionDetail>(`/sessions/${sessionId}`);
  }

  async getSessionHistory(sessionId: string, limit = 100): Promise<SessionHistoryItem[]> {
    const query = new URLSearchParams({
      limit: String(limit),
    });

    return this.request<SessionHistoryItem[]>(
      `/sessions/${sessionId}/history?${query.toString()}`
    );
  }

  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();

    if (!token) {
      throw new Error("未登录或登录已过期，请重新登录");
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({
        error: "请求失败",
      }))) as ApiErrorResponse;

      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}

export const sessionApi = new HandChatSessionApi();
