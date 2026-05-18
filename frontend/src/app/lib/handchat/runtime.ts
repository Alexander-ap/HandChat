import { projectId } from "/utils/supabase/info";

export type HandChatLiveMode = "browser" | "server";
export type HandChatHistoryMode = "browser" | "mock" | "server";

const LIVE_MODE_KEY = "handchat.live-mode.v1";
const HISTORY_MODE_KEY = "handchat.history-mode.v1";

export const HANDCHAT_DEFAULT_WS_URL =
  import.meta.env.VITE_HANDCHAT_WS_URL || "ws://localhost:3001";
export const HANDCHAT_DEFAULT_API_URL =
  import.meta.env.VITE_HANDCHAT_API_URL ||
  `https://${projectId}.supabase.co/functions/v1/api`;

function readStorageValue<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  return (value as T) || fallback;
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

export function getStoredHandChatLiveMode(): HandChatLiveMode {
  return readStorageValue<HandChatLiveMode>(LIVE_MODE_KEY, "browser");
}

export function setStoredHandChatLiveMode(mode: HandChatLiveMode) {
  writeStorageValue(LIVE_MODE_KEY, mode);
}

export function getStoredHandChatHistoryMode(): HandChatHistoryMode {
  return readStorageValue<HandChatHistoryMode>(HISTORY_MODE_KEY, "browser");
}

export function setStoredHandChatHistoryMode(mode: HandChatHistoryMode) {
  writeStorageValue(HISTORY_MODE_KEY, mode);
}
