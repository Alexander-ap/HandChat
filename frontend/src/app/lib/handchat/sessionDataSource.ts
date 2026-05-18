import { browserSessionApi } from "./browserSessionApi";
import { mockSessionApi } from "./mockSessionApi";
import { HandChatSessionApi } from "./sessionApi";
import {
  HANDCHAT_DEFAULT_API_URL,
  type HandChatHistoryMode,
} from "./runtime";

export function createSessionDataSource(mode: HandChatHistoryMode) {
  switch (mode) {
    case "mock":
      return mockSessionApi;
    case "server":
      return new HandChatSessionApi({
        baseUrl: HANDCHAT_DEFAULT_API_URL,
      });
    case "browser":
    default:
      return browserSessionApi;
  }
}
