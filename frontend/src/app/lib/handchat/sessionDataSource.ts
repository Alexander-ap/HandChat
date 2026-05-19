import { browserSessionApi } from "./browserSessionApi";
import { HandChatSessionApi } from "./sessionApi";
import {
  HANDCHAT_DEFAULT_API_URL,
  type HandChatHistoryMode,
} from "./runtime";

export function createSessionDataSource(mode: HandChatHistoryMode) {
  switch (mode) {
    case "server":
      return new HandChatSessionApi({
        baseUrl: HANDCHAT_DEFAULT_API_URL,
      });
    case "browser":
    default:
      return browserSessionApi;
  }
}
