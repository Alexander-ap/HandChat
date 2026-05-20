import type {
  FramePayload,
  HandChatClientMessage,
  HandChatServerMessage,
  KeypointsPayload,
  PingMessage,
  SessionCreatedPayload,
  SessionEndMessage,
  SessionStartMessage,
  TranslationPayload,
  TranslationMessage,
} from "./types";

export interface HandChatWsClientConfig {
  url: string;
  getAccessToken: () => Promise<string | null>;
  heartbeatIntervalMs?: number;
  reconnectIntervalMs?: number;
  reconnectMaxAttempts?: number;
  createTraceId?: () => string;
  WebSocketImpl?: typeof WebSocket;
}

export interface HandChatWsClientEvents {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: HandChatServerMessage) => void;
  onSessionCreated?: (payload: SessionCreatedPayload) => void;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
  onReconnectExhausted?: () => void;
}

function defaultTraceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `trace-${Date.now()}`;
}

export class HandChatWsClient {
  private readonly url: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly heartbeatIntervalMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly reconnectMaxAttempts: number;
  private readonly createTraceId: () => string;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly events: HandChatWsClientEvents;

  private socket: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private manualClose = false;
  private currentSessionId: string | null = null;
  private resumeSessionId: string | undefined;
  private pendingConnect:
    | {
        resolve: (sessionId: string) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  constructor(config: HandChatWsClientConfig, events: HandChatWsClientEvents = {}) {
    this.url = config.url;
    this.getAccessToken = config.getAccessToken;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30000;
    this.reconnectIntervalMs = config.reconnectIntervalMs ?? 2000;
    this.reconnectMaxAttempts = config.reconnectMaxAttempts ?? 3;
    this.createTraceId = config.createTraceId ?? defaultTraceId;
    this.WebSocketImpl = config.WebSocketImpl ?? WebSocket;
    this.events = events;
  }

  get isConnected() {
    return this.socket?.readyState === this.WebSocketImpl.OPEN;
  }

  async connect(resumeSessionId?: string) {
    this.manualClose = false;
    this.resumeSessionId = resumeSessionId;

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error("缺少登录态，无法启动手语会话");
    }

    this.socket = new this.WebSocketImpl(this.url);

    return new Promise<string>((resolve, reject) => {
      this.pendingConnect = { resolve, reject };

      this.socket!.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.events.onOpen?.();

        const message: SessionStartMessage = this.createMessage("session_start", {
          token,
          resume_session_id: this.resumeSessionId,
        });

        this.send(message);
      };

      this.socket!.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as HandChatServerMessage;

          if (parsed.type === "session_created") {
            this.currentSessionId = parsed.payload.id;
            this.pendingConnect?.resolve(parsed.payload.id);
            this.pendingConnect = null;
            this.events.onSessionCreated?.(parsed.payload);
          }

          if (parsed.type === "error" && this.pendingConnect) {
            const error = new Error(parsed.payload.error) as Error & { code?: number };
            error.code = parsed.payload.code;
            this.pendingConnect.reject(error);
            this.pendingConnect = null;
            this.manualClose = true;
            this.stopHeartbeat();
            this.socket?.close();
          }

          this.events.onMessage?.(parsed);
        } catch (error) {
          console.warn("[HandChatWsClient] 无法解析服务端消息", error);
        }
      };

      this.socket!.onerror = (event) => {
        this.events.onError?.(event);
      };

      this.socket!.onclose = (event) => {
        this.stopHeartbeat();
        this.events.onClose?.(event);

        if (this.pendingConnect) {
          this.pendingConnect.reject(new Error(`WebSocket closed before session created (${event.code})`));
          this.pendingConnect = null;
        }

        if (!this.manualClose) {
          this.scheduleReconnect();
        }
      };
    });
  }

  disconnect() {
    this.manualClose = true;
    this.stopHeartbeat();
    this.socket?.close(1000, "client_disconnect");
    this.socket = null;
    this.pendingConnect = null;
  }

  sendFrame(payload: FramePayload) {
    this.send(this.createMessage("frame", payload));
  }

  sendKeypoints(payload: KeypointsPayload) {
    this.send(this.createMessage("keypoints", payload));
  }

  sendTranslation(payload: TranslationPayload) {
    const message: TranslationMessage = this.createMessage("translation", payload);
    this.send(message);
  }

  endSession(sessionId = this.currentSessionId) {
    if (!sessionId) {
      return;
    }

    const message: SessionEndMessage = this.createMessage("session_end", {
      session_id: sessionId,
    });

    this.send(message);
    this.currentSessionId = null;
  }

  private startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = window.setInterval(() => {
      const message: PingMessage = this.createMessage("ping", {
        session_id: this.currentSessionId ?? undefined,
      });

      this.send(message);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.events.onReconnectExhausted?.();
      return;
    }

    this.reconnectAttempts += 1;
    this.events.onReconnectAttempt?.(this.reconnectAttempts, this.reconnectMaxAttempts);

    window.setTimeout(() => {
      void this.connect(this.currentSessionId ?? this.resumeSessionId);
    }, this.reconnectIntervalMs);
  }

  private createMessage<TType extends HandChatClientMessage["type"], TPayload>(
    type: TType,
    payload: TPayload
  ) {
    return {
      type,
      payload,
      trace_id: this.createTraceId(),
      timestamp_ms: Date.now(),
    };
  }

  private send(message: HandChatClientMessage) {
    if (!this.isConnected || !this.socket) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }
}
