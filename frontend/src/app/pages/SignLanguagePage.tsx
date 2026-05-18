import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useOutletContext } from "react-router";
import {
  Hand, ArrowRight, Camera, Type, Image as ImageIcon,
  Settings2, Play, Pause, AlertCircle, History, Server, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import { motion, AnimatePresence } from "motion/react";
import SignLibraryManager from "../components/SignLibraryManager";
import {
  createHandDetector,
  guessSign,
  type HandDetector,
  SignConfirmationTracker,
  appendRecognizedWord,
} from "../lib/handchat/recognition";
import {
  HANDCHAT_FRAME_SIZE,
  HANDCHAT_DEFAULT_WS_URL,
  HandChatWsClient,
  LocalTranslationStream,
  appendBrowserSessionHistory,
  buildFramePayload,
  buildKeypointsPayload,
  createSessionDataSource,
  canvasToJpegBase64,
  drawVideoFrameToSquareCanvas,
  endBrowserSession,
  getActiveBrowserSessionId,
  getBrowserSessionHistory,
  getStoredHandChatLiveMode,
  listBrowserSessions,
  mapHandChatError,
  mapWsCloseReason,
  projectLandmarksToFrame,
  setStoredHandChatLiveMode,
  upsertBrowserSession,
  type HandChatLiveMode,
  type SessionHistoryItem,
  type SessionSummary,
  type TranslationResultType,
} from "../lib/handchat";
import {
  SIGN_WORDS,
  tokenizeText,
  loadSignLibrary,
  getUploadedCount,
  type TokenResult,
} from "../lib/signLanguageStore";
import { supabase } from "../lib/supabase";

interface ProtocolPreviewState {
  frameId: number;
  handsCount: number;
  imageSize: string;
  jpegBase64Length: number;
}

const PLACEHOLDER_TEXT = "请在摄像头前做出手势...";

function buildCommittedText(history: SessionHistoryItem[]) {
  const ordered = [...history].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return ordered.reduce((result, item) => {
    if (item.type === "final" || item.type === "sentence_final") {
      return appendRecognizedWord({
        prevText: result,
        newWord: item.text,
        placeholderText: PLACEHOLDER_TEXT,
      });
    }

    if (item.type === "sentence_end" && result && !result.endsWith("。")) {
      return `${result}。`;
    }

    return result;
  }, "");
}

function getTranslationTypeLabel(type: TranslationResultType | null) {
  switch (type) {
    case "partial":
      return "实时猜测";
    case "final":
      return "稳定结果";
    case "sentence_end":
      return "句子结束";
    case "sentence_final":
      return "句子整合";
    default:
      return "等待识别";
  }
}

function getLiveModeLabel(mode: HandChatLiveMode) {
  return mode === "server" ? "真实服务" : "浏览器本地";
}

function getWsStatusLabel(status: "idle" | "connecting" | "connected" | "reconnecting" | "error") {
  switch (status) {
    case "connecting":
      return "连接中";
    case "connected":
      return "已连接";
    case "reconnecting":
      return "重连中";
    case "error":
      return "连接异常";
    default:
      return "未连接";
  }
}

export default function SignLanguagePage() {
  const navigate = useNavigate();
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const savedState = getPageState("signLanguage") || {};

  const [textInput, setTextInput] = useState(savedState.textInput || "");
  const [recognizing, setRecognizing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [tokenResults, setTokenResults] = useState<TokenResult[]>(savedState.tokenResults || []);
  const [textResult, setTextResult] = useState(savedState.textResult || "");
  const [partialResult, setPartialResult] = useState(savedState.partialResult || "");
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<HandDetector | null>(null);
  const wsClientRef = useRef<HandChatWsClient | null>(null);
  const signTrackerRef = useRef(new SignConfirmationTracker());
  const translationStreamRef = useRef(new LocalTranslationStream());
  const requestRef = useRef<number | null>(null);
  const recognizingRef = useRef(false);
  const frameIdRef = useRef(0);
  const [modelLoading, setModelLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(savedState.uploadedImage || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [liveCurrentSign, setLiveCurrentSign] = useState(""); // 实时当前帧识别结果
  const [engineStatus, setEngineStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [detectionFps, setDetectionFps] = useState(0);
  const [liveMode, setLiveMode] = useState<HandChatLiveMode>(
    savedState.liveMode || getStoredHandChatLiveMode()
  );
  const [activeSessionId, setActiveSessionId] = useState(savedState.activeSessionId || "");
  const [resumableSessionId, setResumableSessionId] = useState<string | null>(
    savedState.resumableSessionId || getActiveBrowserSessionId()
  );
  const [translationType, setTranslationType] = useState<TranslationResultType | null>(
    savedState.translationType || null
  );
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(
    savedState.sessionHistory || []
  );
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>(() =>
    listBrowserSessions(3)
  );
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "connected" | "reconnecting" | "error">("idle");
  const [serviceNotice, setServiceNotice] = useState(savedState.serviceNotice || "");
  const [protocolPreview, setProtocolPreview] = useState<ProtocolPreviewState>(
    savedState.protocolPreview || {
      frameId: -1,
      handsCount: 0,
      imageSize: `${HANDCHAT_FRAME_SIZE}x${HANDCHAT_FRAME_SIZE}`,
      jpegBase64Length: 0,
    }
  );

  // 播放动画相关
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setUploadedCount(getUploadedCount());
  }, [showLibraryManager]);

  useEffect(() => {
    setPageState("signLanguage", {
      textInput,
      tokenResults,
      textResult,
      partialResult,
      uploadedImage,
      liveMode,
      activeSessionId,
      resumableSessionId,
      serviceNotice,
      translationType,
      sessionHistory,
      protocolPreview,
    });
  }, [
    textInput,
    tokenResults,
    textResult,
    partialResult,
    uploadedImage,
    liveMode,
    activeSessionId,
    resumableSessionId,
    serviceNotice,
    translationType,
    sessionHistory,
    protocolPreview,
    setPageState,
  ]);

  // 清理
  const stopCamera = useCallback(() => {
    recognizingRef.current = false;
    setEngineStatus("idle");
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  useEffect(() => {
    setStoredHandChatLiveMode(liveMode);
  }, [liveMode]);

  useEffect(() => {
    return () => {
      stopCamera();
      wsClientRef.current?.disconnect();
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [stopCamera]);

  useEffect(() => {
    const handleOffline = () => {
      if (liveMode === "server") {
        setServiceNotice("网络已断开，实时服务会暂停并尝试在恢复后重连。");
      }
    };

    const handleOnline = () => {
      if (liveMode === "server") {
        setServiceNotice(`网络已恢复，可继续连接实时服务：${HANDCHAT_DEFAULT_WS_URL}`);
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [liveMode]);

  const refreshSessionViews = useCallback(async (sessionId?: string) => {
    const targetSessionId = sessionId ?? activeSessionId;
    const sourceMode = liveMode === "server" ? "server" : "browser";

    try {
      const source = createSessionDataSource(sourceMode);
      const sessions = await source.getSessions(3, 0);
      setRecentSessions(sessions);
      setResumableSessionId(
        sourceMode === "browser"
          ? getActiveBrowserSessionId()
          : sessions.find((item) => item.status === "active")?.id ?? null
      );

      if (targetSessionId) {
        const history = await source.getSessionHistory(targetSessionId, 50);
        setSessionHistory(history);
        setTextResult(buildCommittedText(history) || PLACEHOLDER_TEXT);
      }
    } catch (error) {
      if (sourceMode === "server") {
        const descriptor = mapHandChatError(error);
        setServiceNotice(descriptor.message);
        setRecentSessions([]);
        setResumableSessionId(null);
      }
    }
  }, [activeSessionId, liveMode]);

  useEffect(() => {
    void refreshSessionViews();
  }, [refreshSessionViews]);

  const beginBrowserSession = useCallback((resumeSessionId?: string) => {
    const summary = upsertBrowserSession(resumeSessionId);
    const history = getBrowserSessionHistory(summary.id);
    const nextFrameId = history[0]?.frameId != null ? history[0].frameId + 1 : 0;

    frameIdRef.current = nextFrameId;
    setActiveSessionId(summary.id);
    setSessionHistory(history);
    setTextResult(buildCommittedText(history) || PLACEHOLDER_TEXT);
    setPartialResult("");
    setTranslationType(null);
    setRecentSessions(listBrowserSessions(3));
    setResumableSessionId(getActiveBrowserSessionId());
    setServiceNotice("当前使用浏览器本地模式，不依赖后端网络。");

    return summary.id;
  }, []);

  const pushTranslationPayload = useCallback((payload: {
    session_id: string;
    frame_id: number;
    type: TranslationResultType;
    text: string;
    confidence: number;
    gesture_label?: string;
  }) => {
    const historyItem: SessionHistoryItem = {
      text: payload.text,
      confidence: payload.confidence,
      type: payload.type,
      gestureLabel: payload.gesture_label ?? null,
      frameId: payload.frame_id,
      createdAt: new Date().toISOString(),
    };

    setTranslationType(payload.type);

    if (liveMode === "browser") {
      appendBrowserSessionHistory(payload);
      setRecentSessions(listBrowserSessions(3));
    }

    if (payload.type === "partial") {
      setPartialResult(payload.text);
      return;
    }

    if (payload.type === "final" || payload.type === "sentence_final" || payload.type === "sentence_end") {
      setPartialResult("");
    }

    setSessionHistory((prev) => {
      const next = [historyItem, ...prev];
      setTextResult(buildCommittedText(next) || PLACEHOLDER_TEXT);
      return next;
    });
  }, [liveMode]);

  const createRealtimeClient = useCallback(() => {
    return new HandChatWsClient(
      {
        url: HANDCHAT_DEFAULT_WS_URL,
        getAccessToken: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          return session?.access_token ?? null;
        },
      },
      {
        onOpen: () => {
          setWsStatus("connected");
          setServiceNotice(`实时服务已连接：${HANDCHAT_DEFAULT_WS_URL}`);
        },
        onClose: (event) => {
          const descriptor = mapWsCloseReason(event.code);
          setWsStatus(event.code === 1000 ? "idle" : "error");
          if (event.code !== 1000) {
            setServiceNotice(descriptor.message);
          }
        },
        onError: () => {
          setWsStatus("error");
          setServiceNotice("实时服务连接异常，请检查服务端或网络状态。");
        },
        onReconnectAttempt: (attempt, maxAttempts) => {
          setWsStatus("reconnecting");
          setServiceNotice(`实时服务已断开，正在重连 (${attempt}/${maxAttempts})...`);
        },
        onReconnectExhausted: () => {
          setWsStatus("error");
          setServiceNotice("多次重连失败，建议切回浏览器本地模式继续识别。");
        },
        onMessage: (message) => {
          if (message.type === "translation" && message.payload.type === "sentence_final") {
            pushTranslationPayload(message.payload);
          }

          if (message.type === "error") {
            const descriptor = mapHandChatError(message.payload);
            setServiceNotice(descriptor.message);
            toast.error(descriptor.message);
          }
        },
      }
    );
  }, [pushTranslationPayload]);

  const closeCurrentSession = useCallback((showToast = true) => {
    if (!activeSessionId) {
      return;
    }

    if (liveMode === "server") {
      try {
        wsClientRef.current?.endSession(activeSessionId);
      } catch (error) {
        console.warn("[HandChat] 结束实时会话失败", error);
      }
      wsClientRef.current?.disconnect();
      wsClientRef.current = null;
      setWsStatus("idle");
    } else {
      endBrowserSession(activeSessionId);
    }

    setTranslationType("sentence_end");
    setPartialResult("");
    setLiveCurrentSign("");
    window.setTimeout(() => {
      void refreshSessionViews(activeSessionId);
    }, liveMode === "server" ? 300 : 0);
    setActiveSessionId("");

    if (showToast) {
      toast("已停止摄像，会话已结束");
    }
  }, [activeSessionId, liveMode, refreshSessionViews]);

  const handleChangeLiveMode = (mode: HandChatLiveMode) => {
    if (recognizing) {
      toast.info("请先停止当前识别，再切换运行模式。");
      return;
    }

    setLiveMode(mode);
    setWsStatus("idle");
    setServiceNotice(
      mode === "server"
        ? `将使用实时服务：${HANDCHAT_DEFAULT_WS_URL}`
        : "已切回浏览器本地模式。"
    );
  };

  // ── 文字转手语 ──
  const handleTextToSign = () => {
    if (!textInput.trim()) {
      toast.error("请输入要转换的文字");
      return;
    }

    if (uploadedCount === 0) {
      toast.error("请先在图库管理中上传手语片");
      setShowLibraryManager(true);
      return;
    }

    setTranslating(true);
    setIsPlaying(false);
    if (playTimerRef.current) clearInterval(playTimerRef.current);

    // 模拟短暂处理延迟
    setTimeout(() => {
      const results = tokenizeText(textInput);
      setTokenResults(results);
      setCurrentPlayIndex(0);
      setTranslating(false);

      const matchedCount = results.filter((r) => r.matched).length;
      const unmatchedChars = results.filter((r) => !r.matched).map((r) => r.word);
      const noImageWords = results.filter((r) => r.matched && !r.imageDataUrl).map((r) => r.word);

      if (matchedCount === 0) {
        toast.error("输入的内容中没有匹配到任何手语词条");
      } else if (noImageWords.length > 0) {
        toast(
          `转换完成，但 "${noImageWords.join("、")}" 尚未上传图片`,
          { duration: 4000 }
        );
      } else if (unmatchedChars.length > 0) {
        toast.success(
          `已匹配 ${matchedCount} 个手语词，"${unmatchedChars.join("")}" 不在词典中`
        );
      } else {
        toast.success("转换完成");
      }
    }, 600);
  };

  // ── 播放动画 ──
  const handleTogglePlay = () => {
    const matchedResults = tokenResults.filter((r) => r.matched && r.imageDataUrl);
    if (matchedResults.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    setIsPlaying(true);
    setCurrentPlayIndex(0);
    let idx = 0;
    playTimerRef.current = setInterval(() => {
      idx++;
      if (idx >= matchedResults.length) {
        setIsPlaying(false);
        if (playTimerRef.current) clearInterval(playTimerRef.current);
        return;
      }
      setCurrentPlayIndex(idx);
    }, 1500);
  };

  // ── 手语转文字 (静态图片识别) ──
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (recognizing) {
        setRecognizing(false);
        stopCamera();
        closeCurrentSession(false);
      }

      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);
      setModelLoading(true);
      toast("正在分析图片中的手势...");

      if (!detectorRef.current) {
        try {
          detectorRef.current = await createHandDetector({ maxHands: 1 });
        } catch (err: any) {
          toast.error("加载手势识别AI模型失败：" + err.message);
          setModelLoading(false);
          return;
        }
      }

      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      const hands = await detectorRef.current.estimateHands(img, { flipHorizontal: false });

      if (hands && hands.length > 0) {
        const hand = hands[0];
        
        if (canvas) {
           const ctx = canvas.getContext("2d");
           if (ctx) {
              ctx.fillStyle = "#00FF00";
              ctx.strokeStyle = "#00FF00";
              ctx.lineWidth = Math.max(2, img.width / 150);
              
              const connections = [
                [0,1],[1,2],[2,3],[3,4],
                [0,5],[5,6],[6,7],[7,8],
                [0,9],[9,10],[10,11],[11,12],
                [0,13],[13,14],[14,15],[15,16],
                [0,17],[17,18],[18,19],[19,20]
              ];

              connections.forEach(([i, j]) => {
                const kp1 = hand.keypoints[i];
                const kp2 = hand.keypoints[j];
                if (kp1 && kp2) {
                  ctx.beginPath();
                  ctx.moveTo(kp1.x, kp1.y);
                  ctx.lineTo(kp2.x, kp2.y);
                  ctx.stroke();
                }
              });

              hand.keypoints.forEach((kp, idx) => {
                let depthScale = 1;
                if (hand.keypoints3D && hand.keypoints3D[idx]) {
                  const z = hand.keypoints3D[idx].z;
                  depthScale = Math.max(0.4, 1 - z * 8);
                }
                const baseRadius = Math.max(3, img.width / 100);
                
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, baseRadius * depthScale, 0, 2 * Math.PI);
                ctx.fill();
              });
           }
        }

        const sign = guessSign(hand);
        if (sign) {
          setTextResult((prev) => {
            return appendRecognizedWord({ prevText: prev, newWord: sign });
          });
          toast.success(`成功识别手势: ${sign}`);
        } else {
          toast.error("未能识别出已知手势");
        }
      } else {
        toast.error("图片中未检测到清晰的手部");
      }
    } catch (err: any) {
      console.error("图片识别失败:", err);
      toast.error("图片识别失败: " + err.message);
    } finally {
      setModelLoading(false);
      if (e.target) e.target.value = "";
    }
  };

  // ── 手语转文字 (摄像头识别) ──
  const handleStartRecognition = async (resumeSessionId?: string) => {
    try {
      if (recognizing) {
        setRecognizing(false);
        stopCamera();
        closeCurrentSession();
        return;
      }

      setUploadedImage(null);
      setModelLoading(true);
      captureCanvasRef.current ??= document.createElement("canvas");
      toast("正在加载 AI 模型，请稍候...");

      if (!detectorRef.current) {
        try {
          detectorRef.current = await createHandDetector({ maxHands: 1 });
        } catch (e: any) {
          throw new Error("加载手势模型失败 (请检查网络/跨域限制): " + e.message);
        }
      }

      let stream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("当前环境不支持摄像头(可能需要HTTPS或授权)");
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          });
        } catch (e) {
          console.warn("前置/特定分辨率请求失败，尝试基础视频流...", e);
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      } catch (err: any) {
        console.warn("无法访问真实摄像头:", err);

        if (err.name === "NotAllowedError") {
          toast.error("摄像头权限被拒绝，请在浏览器中允许访问");
        } else if (err.name === "NotFoundError") {
          toast.error("未找到摄像头设备");
        } else {
          toast.error(`无法访问摄像头: ${err.message || err.name || "未知错误"}`);
        }

        toast.info("已启用模拟画面进行演示 (提示：真实AI模型无法识别此模拟画面中的卡通手势)");
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          let angle = 0;
          window.setInterval(() => {
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = "#ffffff";
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("模拟摄像头画面 (无真实摄像头权限)", 320, 200);
            ctx.fillStyle = "#f87171";
            ctx.font = "16px sans-serif";
            ctx.fillText("注意: MediaPipe AI 无法识别此模拟画面中的卡通手势", 320, 240);
            ctx.save();
            ctx.translate(320, 320);
            ctx.rotate(angle);
            ctx.fillStyle = "#3b82f6";
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "28px sans-serif";
            ctx.fillText("HAND", 0, 10);
            ctx.restore();
            angle += 0.05;
          }, 1000 / 30);
        }
        if ("captureStream" in canvas) {
          stream = (canvas as HTMLCanvasElement).captureStream(30);
        }
      }

      if (!stream) {
        setModelLoading(false);
        return;
      }

      const selectedResumeSessionId =
        resumeSessionId ??
        (liveMode === "server" ? resumableSessionId ?? undefined : getActiveBrowserSessionId() ?? undefined);
      let sessionId = "";

      if (liveMode === "server") {
        setWsStatus("connecting");
        setServiceNotice(`正在连接实时服务：${HANDCHAT_DEFAULT_WS_URL}`);
        const client = createRealtimeClient();
        wsClientRef.current = client;
        sessionId = await client.connect(selectedResumeSessionId);

        const source = createSessionDataSource("server");
        const history = await source.getSessionHistory(sessionId, 50).catch(() => []);
        frameIdRef.current = history[0]?.frameId != null ? history[0].frameId + 1 : 0;
        setActiveSessionId(sessionId);
        setSessionHistory(history);
        setTextResult(buildCommittedText(history) || PLACEHOLDER_TEXT);
        setPartialResult("");
        setTranslationType(null);
        setResumableSessionId(sessionId);
        const sessions = await source.getSessions(3, 0).catch(() => []);
        setRecentSessions(sessions);
      } else {
        sessionId = beginBrowserSession(selectedResumeSessionId);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          void videoRef.current?.play();

          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
          }
        };
      }

      setModelLoading(false);
      setRecognizing(true);
      recognizingRef.current = true;
      setLiveCurrentSign("");
      setDetectionFps(0);
      setProtocolPreview({
        frameId: frameIdRef.current - 1,
        handsCount: 0,
        imageSize: `${HANDCHAT_FRAME_SIZE}x${HANDCHAT_FRAME_SIZE}`,
        jpegBase64Length: 0,
      });
      toast.success(
        selectedResumeSessionId
          ? `已恢复${liveMode === "server" ? "服务端" : "本地"}会话`
          : liveMode === "server"
          ? "已连接实时服务并开始识别"
          : "摄像头已开启，开始实时 AI 识别"
      );

      signTrackerRef.current.reset();
      translationStreamRef.current.reset();

      let lastTime = performance.now();
      let fpsCount = 0;
      let consecutiveErrors = 0;

      setEngineStatus("running");

      const detectFrame = async () => {
        if (
          !recognizingRef.current ||
          !videoRef.current ||
          !detectorRef.current ||
          !canvasRef.current ||
          !captureCanvasRef.current
        ) {
          return;
        }

        try {
          if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;

            if (canvasRef.current.width !== vw || canvasRef.current.height !== vh) {
              canvasRef.current.width = vw;
              canvasRef.current.height = vh;
            }

            let hands: any[] = [];
            try {
              hands = await detectorRef.current.estimateHands(videoRef.current, { flipHorizontal: false });
              consecutiveErrors = 0;
            } catch (detectErr: any) {
              consecutiveErrors++;
              console.warn(`检测错误 (${consecutiveErrors}):`, detectErr);

              if (consecutiveErrors > 10) {
                try {
                  (detectorRef.current as { dispose?: () => void } | null)?.dispose?.();
                } catch (_error) {
                  console.warn("释放旧模型失败", _error);
                }

                detectorRef.current = await createHandDetector({ maxHands: 1 });
                consecutiveErrors = 0;
                toast.info("AI引擎已自动重建");
              }

              if (recognizingRef.current) {
                requestRef.current = requestAnimationFrame(detectFrame);
              }
              return;
            }

            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              ctx.save();
              ctx.translate(vw, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(videoRef.current, 0, 0, vw, vh);
              ctx.restore();

              fpsCount++;
              const now = performance.now();
              if (now - lastTime >= 1000) {
                setDetectionFps(fpsCount);
                fpsCount = 0;
                lastTime = now;
              }

              const breathAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 500);
              ctx.fillStyle = `rgba(0, 255, 0, ${breathAlpha})`;
              ctx.beginPath();
              ctx.arc(20, 20, 8, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,0.9)";
              ctx.font = `${Math.max(12, vw / 50)}px sans-serif`;
              ctx.fillText(`${detectionFps} FPS`, 35, 25);

              if (hands.length > 0) {
                const hand = hands[0];
                const mirrorX = (x: number) => vw - x;
                const lineWidth = Math.max(3, vw / 160);
                const pointRadius = Math.max(5, vw / 120);
                const connections = [
                  [0, 1], [1, 2], [2, 3], [3, 4],
                  [0, 5], [5, 6], [6, 7], [7, 8],
                  [0, 9], [9, 10], [10, 11], [11, 12],
                  [0, 13], [13, 14], [14, 15], [15, 16],
                  [0, 17], [17, 18], [18, 19], [19, 20],
                  [5, 9], [9, 13], [13, 17],
                ];

                connections.forEach(([i, j]) => {
                  const kp1 = hand.keypoints[i];
                  const kp2 = hand.keypoints[j];
                  if (kp1 && kp2) {
                    const x1 = mirrorX(kp1.x);
                    const x2 = mirrorX(kp2.x);
                    ctx.beginPath();
                    ctx.moveTo(x1, kp1.y);
                    ctx.lineTo(x2, kp2.y);
                    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
                    ctx.lineWidth = lineWidth + 2;
                    ctx.lineCap = "round";
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(x1, kp1.y);
                    ctx.lineTo(x2, kp2.y);
                    ctx.strokeStyle = "#00FF66";
                    ctx.lineWidth = lineWidth;
                    ctx.lineCap = "round";
                    ctx.stroke();
                  }
                });

                hand.keypoints.forEach((kp: { x: number; y: number }, idx: number) => {
                  const isTip = [4, 8, 12, 16, 20].includes(idx);
                  const mx = mirrorX(kp.x);
                  let depthScale = 1;

                  if (hand.keypoints3D && hand.keypoints3D[idx]) {
                    depthScale = Math.max(0.4, 1 - hand.keypoints3D[idx].z * 8);
                  }

                  const currentRadius = pointRadius * depthScale;
                  ctx.beginPath();
                  ctx.arc(mx, kp.y, currentRadius + 1, 0, 2 * Math.PI);
                  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                  ctx.fill();

                  ctx.beginPath();
                  ctx.arc(mx, kp.y, currentRadius, 0, 2 * Math.PI);
                  ctx.fillStyle = isTip ? "#FF4444" : "#00FF66";
                  ctx.fill();

                  ctx.beginPath();
                  ctx.arc(mx, kp.y, currentRadius * 0.4, 0, 2 * Math.PI);
                  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                  ctx.fill();
                });
              }
            }

            const capture = drawVideoFrameToSquareCanvas({
              video: videoRef.current,
              canvas: captureCanvasRef.current,
            });
            const crop = {
              x: capture.crop.x ?? 0,
              y: capture.crop.y ?? 0,
              width: capture.crop.width ?? capture.width,
              height: capture.crop.height ?? capture.height,
            };
            const frameId = frameIdRef.current++;
            const timestampMs = Date.now();
            const imageBase64Jpeg = await canvasToJpegBase64(captureCanvasRef.current, 0.85);
            const framePayload = buildFramePayload({
              sessionId,
              frameId,
              timestampMs,
              imageBase64Jpeg,
              width: capture.width,
              height: capture.height,
              crop,
              fpsActual: detectionFps || undefined,
              devicePixelRatio: window.devicePixelRatio,
            });
            const keypointsPayload = buildKeypointsPayload({
              sessionId,
              frameId,
              hands: hands.map((hand) => ({
                handedness: String(hand.handedness).includes("Left") ? "Left" : "Right",
                score: typeof hand.score === "number" ? hand.score : 1,
                keypoints: projectLandmarksToFrame({
                  landmarks: hand.keypoints ?? [],
                  crop,
                  outputWidth: capture.width,
                  outputHeight: capture.height,
                }),
                keypoints3D: (hand.keypoints3D ?? []).map((point: { x: number; y: number; z: number }) => ({
                  x: point.x,
                  y: point.y,
                  z: point.z,
                })),
              })),
              imageWidth: capture.width,
              imageHeight: capture.height,
            });

            if (liveMode === "server") {
              wsClientRef.current?.sendFrame(framePayload);
              if (keypointsPayload.hands.length > 0) {
                wsClientRef.current?.sendKeypoints(keypointsPayload);
              }
            }

            if (frameId % 5 === 0) {
              setProtocolPreview({
                frameId: framePayload.frame_id,
                handsCount: keypointsPayload.hands.length,
                imageSize: `${framePayload.image.width}x${framePayload.image.height}`,
                jpegBase64Length: framePayload.image.data.length,
              });
            }

            const currentSign = hands.length > 0 ? guessSign(hands[0]) : "";
            const result = signTrackerRef.current.update(currentSign);
            setLiveCurrentSign((prev) => (prev !== result.liveSign ? result.liveSign : prev));

            const messages = translationStreamRef.current.update({
              sessionId,
              frameId,
              timestampMs,
              liveSign: result.liveSign,
              confirmedSign: result.confirmedSign,
            });

            messages.forEach((payload) => {
              pushTranslationPayload(payload);
              if (liveMode === "server") {
                wsClientRef.current?.sendTranslation(payload);
              }
            });

            if (!hands.length) {
              setLiveCurrentSign((prev) => (prev !== "" ? "" : prev));
            }
          }
        } catch (e) {
          console.error("检测帧发生错误: ", e);
        }

        if (recognizingRef.current) {
          requestRef.current = requestAnimationFrame(detectFrame);
        }
      };

      detectFrame();
    } catch (err: any) {
      setModelLoading(false);
      wsClientRef.current?.disconnect();
      wsClientRef.current = null;
      setWsStatus("error");
      const descriptor = mapHandChatError(err);
      setServiceNotice(descriptor.message);
      console.error("启动识别失败:", err);
      toast.error("启动失败，请检查环境或模型网络连接: " + descriptor.message);
    }
  };

  // 常用短语 - 只包含词典中已有的词
  const popularPhrases = [
    "你好", "谢谢", "抱歉", "再见",
    "请", "是", "不是", "帮助",
    "称赞", "等候", "麻烦",
  ];

  // 有效的匹配结果 (有图片的)
  const matchedWithImages = tokenResults.filter((r) => r.matched && r.imageDataUrl);
  const recentHistoryItems = sessionHistory.slice(0, 5);

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: "var(--app-background, #F2F2F7)" }}
    >
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-12 pb-3 shadow-sm sticky top-0 z-10 border-b border-gray-100 flex justify-center">
        <div className="w-full max-w-2xl flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-gray-900 mb-0.5 tracking-tight">
              手语交互
            </h1>
            <p className="text-[13px] text-gray-500">手语与文字的双向转换</p>
          </div>
          <button
            onClick={() => setShowLibraryManager(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <Settings2 className="w-4 h-4 text-gray-600" />
            <span className="text-[12px] font-medium text-gray-600">图库</span>
            <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 border-2 border-white ${
              uploadedCount === SIGN_WORDS.length
                ? "bg-green-500 text-white"
                : "bg-orange-500 text-white"
            }`}>
              {uploadedCount}
            </span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 w-full max-w-2xl mx-auto">
        <Tabs defaultValue="text-to-sign" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-10 bg-gray-100/80 rounded-[12px] p-0.5 mb-3">
            <TabsTrigger
              value="text-to-sign"
              className="rounded-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm text-[14px] font-medium transition-all"
            >
              <Type className="w-4 h-4 mr-1.5" />
              文字转手语
            </TabsTrigger>
            <TabsTrigger
              value="sign-to-text"
              className="rounded-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm text-[14px] font-medium transition-all"
            >
              <Hand className="w-4 h-4 mr-1.5" />
              手语转文字
            </TabsTrigger>
          </TabsList>

          {/* ══════════ 文字转手语 ══════════ */}
          <TabsContent value="text-to-sign" className="mt-0 space-y-3">
            {/* 输入区 */}
            <div className="bg-white rounded-[16px] p-4 shadow-[0_1px_3px_rgb(0,0,0,0.04)]">
              <label className="block text-[14px] font-medium text-gray-700 mb-2">
                输入文字
              </label>
              <Input
                placeholder="请输入要转换为手语的文字..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextToSign()}
                className="h-11 rounded-[12px] border-gray-200 mb-3 text-[15px] placeholder:text-gray-400"
              />
              <Button
                onClick={handleTextToSign}
                disabled={translating}
                className="w-full h-11 bg-blue-500 hover:bg-blue-600 rounded-[12px] text-[15px] font-medium shadow-[0_4px_14px_0_rgb(59,130,246,0.25)] active:scale-[0.98] transition-all"
              >
                {translating ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    分析中...
                  </div>
                ) : (
                  <>
                    转换为手语
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>

            {/* 提示：图库未就绪 */}
            {uploadedCount === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200/60 rounded-[14px] p-3.5 flex items-start gap-2.5"
              >
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] text-amber-800 font-medium mb-1">
                    手语图库为空
                  </p>
                  <p className="text-[12px] text-amber-600 leading-relaxed">
                    请先点击右上角「图库」按钮，上传手语图片后即可使用文字转手语功能。
                    支持批量导入，文件名需与词条一致（如 你好.png）。
                  </p>
                </div>
              </motion.div>
            )}

            {/* 常用短语 */}
            <div>
              <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                常用短语
              </h3>
              <div className="flex flex-wrap gap-2">
                {popularPhrases.map((phrase) => {
                  const lib = loadSignLibrary();
                  const hasImage = lib[phrase] !== null && lib[phrase] !== undefined;
                  return (
                    <button
                      key={phrase}
                      onClick={() => {
                        setTextInput(phrase);
                      }}
                      className={`relative px-3.5 py-2 rounded-full text-[13px] font-medium transition-all active:scale-95 ${
                        hasImage
                          ? "bg-blue-50 text-blue-600 border border-blue-200/60 shadow-sm"
                          : "bg-white text-gray-600 border border-gray-100 shadow-[0_1px_2px_rgb(0,0,0,0.04)]"
                      }`}
                    >
                      {phrase}
                      {hasImage && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 手语演示结果 ── */}
            {tokenResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[16px] shadow-[0_1px_3px_rgb(0,0,0,0.04)] overflow-hidden"
              >
                {/* 头部 */}
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                    <Hand className="w-5 h-5 text-blue-500" />
                    手语演示
                  </h3>
                  <span className="text-[12px] text-gray-400">
                    {matchedWithImages.length} 个手语词
                  </span>
                </div>

                {/* 分词标签展示 */}
                <div className="px-4 pb-2 flex flex-wrap gap-1">
                  {tokenResults.map((token, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium ${
                        token.matched && token.imageDataUrl
                          ? "bg-blue-100 text-blue-700"
                          : token.matched
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {token.word}
                      {token.matched && !token.imageDataUrl && (
                        <AlertCircle className="w-3 h-3 ml-0.5" />
                      )}
                    </span>
                  ))}
                </div>

                {/* 手语图片网格 */}
                {matchedWithImages.length > 0 ? (
                  <>
                    <div className="px-4 pb-3">
                      <div className={`grid gap-2 ${
                        matchedWithImages.length === 1
                          ? "grid-cols-1"
                          : matchedWithImages.length === 2
                          ? "grid-cols-2"
                          : "grid-cols-3"
                      }`}>
                        {matchedWithImages.map((token, index) => (
                          <motion.div
                            key={`${token.word}-${index}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.08 }}
                            className={`relative rounded-[14px] overflow-hidden bg-gray-50 border-2 transition-all duration-300 ${
                              isPlaying && currentPlayIndex === index
                                ? "border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.2)] scale-[1.03]"
                                : "border-transparent"
                            }`}
                          >
                            {/* 图片 */}
                            <div className="aspect-square relative">
                              <img
                                src={token.imageDataUrl!}
                                alt={`${token.word}的手语`}
                                className="w-full h-full object-contain bg-white p-1"
                              />
                              {/* 播放时高亮遮罩 */}
                              <AnimatePresence>
                                {isPlaying && currentPlayIndex === index && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-blue-500/10 flex items-center justify-center"
                                  >
                                    <motion.div
                                      animate={{ scale: [1, 1.2, 1] }}
                                      transition={{ duration: 1, repeat: Infinity }}
                                      className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center"
                                    >
                                      <Play className="w-4 h-4 text-blue-600 fill-blue-600" />
                                    </motion.div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                            {/* 词条标签 */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                              <span className="text-white text-[13px] font-semibold drop-shadow-sm">
                                {token.word}
                              </span>
                            </div>
                            {/* 序号 */}
                            <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/40 text-white text-[10px] font-bold flex items-center justify-center backdrop-blur-sm">
                              {index + 1}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="px-4 pb-4 flex gap-2">
                      <Button
                        onClick={handleTogglePlay}
                        className={`flex-1 h-10 rounded-[12px] text-[14px] font-medium shadow-sm ${
                          isPlaying
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-blue-500 hover:bg-blue-600"
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-4 h-4 mr-1.5" />
                            停止播放
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1.5 fill-current" />
                            逐帧播放
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-10 rounded-[12px] text-[14px]"
                        onClick={() => {
                          toast.success("图片已保存到相册");
                        }}
                      >
                        <ImageIcon className="w-4 h-4 mr-1.5" />
                        保存图片
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="px-4 pb-4">
                    <div className="bg-gray-50 rounded-[12px] py-8 flex flex-col items-center text-center">
                      <ImageIcon className="w-10 h-10 text-gray-300 mb-2" />
                      <p className="text-[14px] text-gray-500 mb-1">
                        匹配到的词条尚未上传图片
                      </p>
                      <button
                        onClick={() => setShowLibraryManager(true)}
                        className="text-[13px] text-blue-500 font-medium hover:text-blue-600"
                      >
                        前往上传 →
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </TabsContent>

          {/* ══════════ 手语转文字 ══════════ */}
          <TabsContent value="sign-to-text" className="mt-0 space-y-3">
            <div className="bg-white rounded-[16px] p-4 shadow-[0_1px_3px_rgb(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">
                    实时识别
                  </h3>
                  <p className="text-[12px] text-gray-500 mt-1">
                    P1.5 运行模式: {getLiveModeLabel(liveMode)}
                    {liveMode === "server" ? ` · ${getWsStatusLabel(wsStatus)}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-8 rounded-[10px] text-[12px]"
                  onClick={() => navigate("/sign-language/history")}
                >
                  <History className="w-3.5 h-3.5 mr-1.5" />
                  会话历史
                </Button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChangeLiveMode("browser")}
                  className={`rounded-[12px] border px-3 py-3 text-left transition-all ${
                    liveMode === "browser"
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <WifiOff className={`w-4 h-4 mb-2 ${liveMode === "browser" ? "text-blue-600" : "text-gray-500"}`} />
                  <p className={`text-[13px] font-medium ${liveMode === "browser" ? "text-blue-700" : "text-gray-700"}`}>
                    浏览器本地
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">零网络依赖，适合本机预联调。</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeLiveMode("server")}
                  className={`rounded-[12px] border px-3 py-3 text-left transition-all ${
                    liveMode === "server"
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <Server className={`w-4 h-4 mb-2 ${liveMode === "server" ? "text-blue-600" : "text-gray-500"}`} />
                  <p className={`text-[13px] font-medium ${liveMode === "server" ? "text-blue-700" : "text-gray-700"}`}>
                    真实服务
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">发送 Frame/Keypoints/Translation 到 WS 服务。</p>
                </button>
              </div>

              {serviceNotice && (
                <div className={`mb-3 rounded-[12px] px-3 py-2 text-[12px] ${
                  liveMode === "server" && wsStatus !== "connected"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-slate-50 text-slate-600 border border-slate-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {liveMode === "server" && wsStatus === "connected" ? (
                      <Wifi className="w-4 h-4" />
                    ) : (
                      <WifiOff className="w-4 h-4" />
                    )}
                    <span>{serviceNotice}</span>
                  </div>
                </div>
              )}

              <div className="mb-3 rounded-[14px] border border-blue-100 bg-blue-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-900">
                      会话 {activeSessionId || resumableSessionId || "未创建"}
                    </p>
                    <p className="text-[12px] text-gray-600 mt-1">
                      状态 {recognizing ? "active" : resumableSessionId ? "paused" : "idle"} · {getTranslationTypeLabel(translationType)} · {liveMode === "server" ? getWsStatusLabel(wsStatus) : "本地模式"}
                    </p>
                  </div>
                  {resumableSessionId && !recognizing && (
                    <Button
                      onClick={() => void handleStartRecognition(resumableSessionId)}
                      variant="outline"
                      className="h-8 rounded-[10px] border-blue-200 bg-white text-[12px] text-blue-600 hover:text-blue-700"
                    >
                      恢复会话
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
                  <div className="rounded-[10px] bg-white/80 px-2.5 py-2">
                    <p className="text-gray-400">帧尺寸</p>
                    <p className="text-gray-800 font-medium">{protocolPreview.imageSize}</p>
                  </div>
                  <div className="rounded-[10px] bg-white/80 px-2.5 py-2">
                    <p className="text-gray-400">最新帧</p>
                    <p className="text-gray-800 font-medium">{protocolPreview.frameId >= 0 ? protocolPreview.frameId : "--"}</p>
                  </div>
                  <div className="rounded-[10px] bg-white/80 px-2.5 py-2">
                    <p className="text-gray-400">手数</p>
                    <p className="text-gray-800 font-medium">{protocolPreview.handsCount}</p>
                  </div>
                </div>
              </div>

              {/* 相机预览 / 图片预览 */}
              <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-[14px] mb-3 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
                {/* video 元素作为数据源，必须保持非零尺寸以确保浏览器持续解码，但使用 opacity-0 隐藏 */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute w-full h-full opacity-0 pointer-events-none -z-10"
                />
                
                {!recognizing && uploadedImage && (
                  <img 
                    src={uploadedImage} 
                    alt="Uploaded" 
                    className="absolute inset-0 w-full h-full object-contain bg-black/80 z-0"
                  />
                )}

                {/* canvas 是唯一的可见画面：绘制镜像视频帧 + 骨骼叠加 */}
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 w-full h-full z-[2] ${!recognizing && uploadedImage ? "object-contain" : "object-cover"}`}
                />

                {modelLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-3" />
                    <p className="text-white text-[14px] font-medium">正在加载 AI 模型...</p>
                  </div>
                ) : recognizing ? (
                  <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full z-20 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-white text-[12px]">AI 识别中</span>
                  </div>
                ) : !uploadedImage ? (
                  <div className="z-20 flex flex-col items-center justify-center">
                    <Hand className="w-16 h-16 text-white/50 mb-2" />
                    <p className="text-white/50 text-[14px]">
                      点击下方按钮开始识别或上传图片
                    </p>
                  </div>
                ) : null}

                {/* 实时悬浮显示当前手势 */}
                <AnimatePresence>
                  {recognizing && liveCurrentSign && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-lg font-medium px-6 py-2.5 rounded-full border border-white/20 shadow-lg whitespace-nowrap z-30"
                    >
                      {liveCurrentSign}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex gap-2.5">
                <Button
                  onClick={() => void handleStartRecognition()}
                  disabled={modelLoading}
                  variant={recognizing ? "destructive" : "default"}
                  className={`flex-1 h-12 rounded-[14px] text-[15px] font-medium shadow-md active:scale-[0.98] transition-all ${
                    !recognizing ? "bg-blue-500 hover:bg-blue-600 text-white" : ""
                  }`}
                >
                  <Camera className="w-4 h-4 mr-1.5" />
                  {recognizing ? "停止摄像" : "实时识别"}
                </Button>

                <Button
                  onClick={handleUploadClick}
                  disabled={modelLoading}
                  variant="outline"
                  className="flex-1 h-12 rounded-[14px] text-[15px] font-medium shadow-sm transition-all bg-white"
                >
                  <ImageIcon className="w-4 h-4 mr-1.5 text-blue-500" />
                  拍照/相册
                </Button>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
              </div>
            </div>

            {/* 识别结果 */}
            {(textResult || partialResult) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[16px] p-4 shadow-[0_1px_3px_rgb(0,0,0,0.04)]"
              >
                <h3 className="text-[15px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Type className="w-5 h-5 text-green-500" />
                  识别结果
                </h3>
                <div className="p-4 bg-green-50 rounded-[12px] mb-3 space-y-2">
                  {partialResult && (
                    <p className="text-[13px] italic text-gray-500">
                      partial: {partialResult}
                    </p>
                  )}
                  <p className="text-gray-800 text-[15px] leading-relaxed">
                    {textResult}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(textResult);
                      toast.success("已复制到剪贴板");
                    }}
                    variant="outline"
                    className="flex-1 h-10 rounded-[12px] text-[14px]"
                  >
                    复制文字
                  </Button>
                  <Button
                    onClick={() => {
                      setTextResult("");
                      setPartialResult("");
                      setSessionHistory([]);
                      setTranslationType(null);
                      toast.success("已清除");
                    }}
                    variant="outline"
                    className="flex-1 h-10 rounded-[12px] text-[14px] text-red-500 hover:text-red-600"
                  >
                    清除记录
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 使用提示 */}
            <div className="bg-blue-50 rounded-[14px] p-3.5">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-2">
                使用提示
              </h3>
              <ul className="text-[13px] text-gray-600 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>确保手部在摄像头范围内</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>保持光线充足，背景简洁</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>动作清晰，速度适中</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>支持连续手语动作识别</span>
                </li>
              </ul>
            </div>

            {/* 识别历史 */}
            <div>
              <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                识别历史
              </h3>
              <div className="space-y-2">
                {recentHistoryItems.length > 0 ? (
                  recentHistoryItems.map((item, index) => (
                    <div
                      key={`${item.frameId}-${item.type}-${index}`}
                      className="bg-white rounded-[14px] p-3.5 shadow-[0_1px_2px_rgb(0,0,0,0.04)]"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-[14px] font-medium text-gray-800">
                          {item.text || "句子结束"}
                        </p>
                        <span className="text-[11px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-400">
                        frame #{item.frameId} · {new Date(item.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="bg-white rounded-[14px] p-4 text-[13px] text-gray-400 shadow-[0_1px_2px_rgb(0,0,0,0.04)]">
                    当前还没有会话历史，开始识别后会按 `partial / final / sentence_end` 记录。
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                最近会话
              </h3>
              <div className="space-y-2">
                {recentSessions.length > 0 ? (
                  recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white rounded-[14px] p-3.5 shadow-[0_1px_2px_rgb(0,0,0,0.04)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-gray-800">{session.id}</p>
                          <p className="text-[12px] text-gray-400 mt-1">
                            {session.status} · {session.translationCount} 条稳定结果 · {liveMode === "server" ? "server" : "browser"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => navigate(`/sign-language/history/${session.id}?mode=${liveMode === "server" ? "server" : "browser"}`)}
                            variant="outline"
                            className="h-8 rounded-[10px] text-[12px]"
                          >
                            详情
                          </Button>
                          {session.status === "active" && !recognizing && (
                            <Button
                              onClick={() => void handleStartRecognition(session.id)}
                              variant="outline"
                              className="h-8 rounded-[10px] text-[12px]"
                            >
                              继续
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-white rounded-[14px] p-4 text-[13px] text-gray-400 shadow-[0_1px_2px_rgb(0,0,0,0.04)]">
                    当前模式下还没有会话记录。
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 手语图库管理弹窗 */}
      <SignLibraryManager
        open={showLibraryManager}
        onClose={() => setShowLibraryManager(false)}
        onUpdate={() => setUploadedCount(getUploadedCount())}
      />
    </div>
  );
}
