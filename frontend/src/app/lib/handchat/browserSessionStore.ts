import type { SessionHistoryItem, SessionSummary, TranslationPayload } from "./types";

interface StoredSessionRecord {
  summary: SessionSummary;
  history: SessionHistoryItem[];
}

const STORAGE_KEY = "handchat.browser-sessions.v1";
const ACTIVE_SESSION_KEY = "handchat.browser-active-session.v1";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-session-${Date.now()}`;
}

function readStore(): Record<string, StoredSessionRecord> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredSessionRecord>;
  } catch (error) {
    console.warn("[browserSessionStore] 读取会话失败", error);
    return {};
  }
}

function writeStore(store: Record<string, StoredSessionRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function toHistoryItem(payload: TranslationPayload): SessionHistoryItem {
  return {
    text: payload.text,
    confidence: payload.confidence,
    type: payload.type,
    gestureLabel: payload.gesture_label ?? null,
    frameId: payload.frame_id,
    createdAt: new Date().toISOString(),
  };
}

export function getActiveBrowserSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function upsertBrowserSession(sessionId?: string): SessionSummary {
  const store = readStore();
  const id = sessionId ?? createSessionId();
  const existing = store[id];

  if (existing) {
    existing.summary.status = "active";
    existing.summary.endedAt = null;
    store[id] = existing;
    writeStore(store);
    window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
    return existing.summary;
  }

  const summary: SessionSummary = {
    id,
    status: "active",
    startedAt: new Date().toISOString(),
    endedAt: null,
    translationCount: 0,
    lastTranslation: null,
  };

  store[id] = {
    summary,
    history: [],
  };
  writeStore(store);
  window.localStorage.setItem(ACTIVE_SESSION_KEY, id);

  return summary;
}

export function appendBrowserSessionHistory(payload: TranslationPayload) {
  const store = readStore();
  const record = store[payload.session_id];

  if (!record) {
    return;
  }

  const historyItem = toHistoryItem(payload);
  record.history.unshift(historyItem);

  if (payload.type === "final" || payload.type === "sentence_final") {
    record.summary.translationCount += 1;
    record.summary.lastTranslation = payload.text || record.summary.lastTranslation;
  }

  if (payload.type === "sentence_end") {
    record.summary.lastTranslation = record.summary.lastTranslation ?? "句子结束";
  }

  store[payload.session_id] = record;
  writeStore(store);
}

export function endBrowserSession(sessionId: string) {
  const store = readStore();
  const record = store[sessionId];

  if (!record) {
    return;
  }

  record.summary.status = "ended";
  record.summary.endedAt = new Date().toISOString();
  store[sessionId] = record;
  writeStore(store);

  if (getActiveBrowserSessionId() === sessionId) {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

export function listBrowserSessions(limit = 10): SessionSummary[] {
  return Object.values(readStore())
    .map((item) => item.summary)
    .sort((a, b) => {
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    })
    .slice(0, limit);
}

export function getBrowserSessionSummary(sessionId: string): SessionSummary | null {
  return readStore()[sessionId]?.summary ?? null;
}

export function getBrowserSessionHistory(sessionId: string): SessionHistoryItem[] {
  return readStore()[sessionId]?.history ?? [];
}
