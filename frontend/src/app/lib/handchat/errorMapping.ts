export interface HandChatErrorDescriptor {
  title: string;
  message: string;
}

function fromCode(code?: number): HandChatErrorDescriptor | null {
  switch (code) {
    case 4001:
      return {
        title: "消息格式错误",
        message: "当前帧或关键点数据不符合冻结协议，已跳过本次发送。",
      };
    case 4002:
      return {
        title: "会话已失效",
        message: "当前没有活跃会话，请重新开始识别。",
      };
    case 4003:
      return {
        title: "认证失败",
        message: "登录态失效，请重新登录后再连接手语服务。",
      };
    case 4004:
      return {
        title: "会话不匹配",
        message: "本地会话和服务端会话不一致，请停止后重新开启。",
      };
    case 5001:
      return {
        title: "推理超时",
        message: "服务端处理超时，当前帧已跳过，识别会继续进行。",
      };
    case 5002:
      return {
        title: "服务器繁忙",
        message: "服务端过载，建议切回浏览器本地模式继续使用。",
      };
    case 5030:
      return {
        title: "模型推理繁忙",
        message: "CE-CSL 推理超时或繁忙，系统会继续重试；如果长时间无结果，请重启 Python 模型服务。",
      };
    default:
      return null;
  }
}

export function mapHandChatError(error: unknown): HandChatErrorDescriptor {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      title: "网络已断开",
      message: "当前设备离线，无法连接手语服务，请检查网络后重试。",
    };
  }

  if (typeof error === "object" && error && "code" in error) {
    const payload = error as { code?: number; error?: string; message?: string };
    const mapped = fromCode(Number(payload.code));
    const serverMessage = payload.error || payload.message;
    if (mapped) {
      if (payload.code === 4001 && serverMessage?.trim()) {
        return {
          title: mapped.title,
          message: serverMessage,
        };
      }

      return mapped;
    }
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "未知错误";

  if (message.includes("Failed to fetch") || message.includes("fetch")) {
    return {
      title: "网络请求失败",
      message: "无法访问会话接口，请检查服务端地址或稍后重试。",
    };
  }

  if (message.includes("WebSocket") || message.includes("close")) {
    return {
      title: "连接已中断",
      message: "实时连接已断开，系统会尝试自动重连。",
    };
  }

  return {
    title: "手语服务异常",
    message,
  };
}

export function mapWsCloseReason(code: number): HandChatErrorDescriptor {
  switch (code) {
    case 1000:
      return {
        title: "连接已关闭",
        message: "会话已正常结束。",
      };
    case 4001:
    case 4002:
    case 4003:
    case 4004:
    case 5001:
    case 5002:
      return fromCode(code) ?? {
        title: "连接已关闭",
        message: "服务端已关闭当前连接。",
      };
    default:
      return {
        title: "连接中断",
        message: "实时服务连接意外断开，系统会尝试自动恢复。",
      };
  }
}
