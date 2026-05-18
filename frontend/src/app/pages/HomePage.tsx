import React, { useState, useRef, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { Camera, ScanText, Image, X, ZoomIn, Copy, Share2, Trash2, History, ChevronRight, Video, Hand } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { motion, AnimatePresence } from "motion/react";
import Tesseract from "tesseract.js";
import { createHandDetector, guessSign, type HandDetector } from "../lib/handchat/recognition";
import { useLanguage } from "../contexts/LanguageContext";

interface HistoryRecord {
  id: string;
  image: string;
  text: string;
  timestamp: number;
}

export default function HomePage() {
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const navigate = useNavigate();
  const { text } = useLanguage();
  const savedState = getPageState('home') || {};

  const [cameraActive, setCameraActive] = useState(savedState.cameraActive || false);
  const [capturedImage, setCapturedImage] = useState<string | null>(savedState.capturedImage || null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState<"text" | "sign">("text");
  const [ocrResult, setOcrResult] = useState<string>(savedState.ocrResult || "");
  const [isProcessing, setIsProcessing] = useState(savedState.isProcessing || false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(savedState.historyRecords || []);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryRecord | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<HandDetector | null>(null);

  // 实时识别相关
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const [isLiveRecognizing, setIsLiveRecognizing] = useState(false);
  const [liveResult, setLiveResult] = useState("");

  useEffect(() => {
    setPageState('home', {
      cameraActive,
      capturedImage,
      ocrResult,
      isProcessing,
      historyRecords,
      isLiveRecognizing
    });
  }, [cameraActive, capturedImage, ocrResult, isProcessing, historyRecords, isLiveRecognizing, setPageState]);

  const stopCamera = React.useCallback(() => {
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
    setIsLiveRecognizing(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleOpenCamera = () => {
    // 使用 file input capture 调用设备相机
    cameraInputRef.current?.click();
  };

  const handleUploadImage = () => {
    fileInputRef.current?.click();
  };



  const performOCR = async (imageUrl: string) => {
    setIsProcessing(true);
    setOcrProgress(0);
    setOcrResult(""); // 清空上次结果
    setRecognitionMode("text");
    try {
      toast("正在分析图片文字，请稍候...");
      // 使用 Tesseract.js 进行真实 OCR 识别，支持中英文
      const result = await Tesseract.recognize(
        imageUrl,
        'chi_sim+eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.floor(m.progress * 100));
            }
          }
        }
      );
      
      const text = result.data.text.trim();
      if (text) {
        setOcrResult(text);
        toast.success("文字识别完成");
      } else {
        setOcrResult("未识别到明显的文字，请尝试重新拍摄。");
        toast.error("未识别到文字");
      }
    } catch (error) {
      console.error("OCR Error:", error);
      toast.error("识别失败，请检查网络或重试");
      setOcrResult("识别遇到问题，请重试。");
    } finally {
      setIsProcessing(false);
      setOcrProgress(0);
    }
  };

  const performSignRecognition = async (imageUrl: string) => {
    setIsProcessing(true);
    setOcrProgress(50);
    setOcrResult("");
    setRecognitionMode("sign");
    try {
      toast("正在分析图片中的手语姿势...");
      
      if (!detectorRef.current) {
        try {
          detectorRef.current = await createHandDetector({ maxHands: 1 });
        } catch (e: any) {
          console.error("加载手势模型失败", e);
        }
      }

      const img = new window.Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const hands = await detectorRef.current.estimateHands(img, { flipHorizontal: false });

      if (hands && hands.length > 0) {
        const hand = hands[0];
        const sign = guessSign(hand);
        if (sign) {
          setOcrResult(`识别出的手语：${sign}`);
          toast.success("手语识别成功");
        } else {
          setOcrResult("未能识别出已知的手语，请尝试换一个角度或手势。");
          toast.error("未识别到已知手势");
        }
      } else {
        // Fallback to OCR since MediaPipe struggles with line drawings
        toast("未检测到真实手势，尝试分析附带文字...");
        try {
          const result = await Tesseract.recognize(imageUrl, 'chi_sim+eng');
          const text = result.data.text.trim();
          if (text) {
            setOcrResult(`这是简笔画/图文手语，系统解析其含义为：\n${text}`);
            toast.success("通过文字辅助分析成功");
          } else {
            setOcrResult("图片中未检测到清晰的真实手部。注意：当前AI主要针对真实手势训练，手绘或卡通图片可能难以识别。");
            toast.error("未检测到真实手部");
          }
        } catch (e) {
          setOcrResult("图片中未检测到清晰的真实手部。注意：当前AI主要针对真实手势训练，手绘或卡通图片可能难以识别。");
          toast.error("未检测到手部");
        }
      }
    } catch (error) {
      console.error("Sign Recognition Error:", error);
      toast.error("手语识别失败");
      setOcrResult("识别遇到问题，请重试。");
    } finally {
      setIsProcessing(false);
      setOcrProgress(100);
      setTimeout(() => setOcrProgress(0), 500);
    }
  };

  const confirmRecognition = (mode: "text" | "sign") => {
    if (pendingImage) {
      setCapturedImage(pendingImage);
      if (mode === "text") {
        performOCR(pendingImage);
      } else {
        performSignRecognition(pendingImage);
      }
    }
    setShowModeDialog(false);
    setPendingImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        setPendingImage(imageUrl);
        setShowModeDialog(true);
      };
      reader.readAsDataURL(file);
    }
    // 清空 input 值以便重复选择同一文件
    e.target.value = "";
  };

  const handleSaveResult = () => {
    if (capturedImage && ocrResult) {
      const newRecord: HistoryRecord = {
        id: Date.now().toString(),
        image: capturedImage,
        text: ocrResult,
        timestamp: Date.now()
      };
      setHistoryRecords([newRecord, ...historyRecords]);
      setCapturedImage(null);
      setOcrResult("");
      toast.success("已保存到历史记录");
    }
  };

  const startLiveRecognition = async () => {
    try {
      if (isLiveRecognizing) {
        stopCamera();
        toast("已停止实时识别");
        return;
      }

      setIsLiveRecognizing(true);
      setLiveResult("");
      toast("正在加载 AI 模型，请稍候...");

      if (!detectorRef.current) {
        try {
          detectorRef.current = await createHandDetector({ maxHands: 1 });
        } catch (e: any) {
          console.error("加载手势模型失败", e);
        }
      }

      let stream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("当前环境不支持摄像头");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        });
      } catch (e) {
        console.warn("无法获取摄像头权限:", e);
        toast.info("已启用模拟画面进行演示");
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          let angle = 0;
          setInterval(() => {
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = "#ffffff";
            ctx.font = "24px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("模拟摄像头画面 (无真实摄像头权限)", 320, 200);
            ctx.fillStyle = "#f87171";
            ctx.font = "16px sans-serif";
            ctx.fillText("⚠️ 注意: MediaPipe AI 无法识别此模拟画面中的卡通手势", 320, 240);
            ctx.save();
            ctx.translate(320, 320);
            ctx.rotate(angle);
            ctx.fillStyle = "#3b82f6";
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "28px sans-serif";
            ctx.fillText("✋", 0, 10);
            ctx.restore();
            angle += 0.05;
          }, 1000 / 30);
        }
        if ("captureStream" in canvas) {
          stream = (canvas as any).captureStream(30);
        } else {
          setIsLiveRecognizing(false);
          return;
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
          }
          detectFrame();
        };
      }
    } catch (error) {
      console.error(error);
      toast.error("启动识别失败");
      setIsLiveRecognizing(false);
    }
  };

  const detectFrame = async () => {
    if (!detectorRef.current || !videoRef.current || !canvasRef.current || !streamRef.current) return;
    
    try {
      if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
        if (canvasRef.current.width !== videoRef.current.videoWidth || canvasRef.current.height !== videoRef.current.videoHeight) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }

        const hands = await detectorRef.current.estimateHands(videoRef.current, { flipHorizontal: false });
        const ctx = canvasRef.current.getContext("2d");
        
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          
          // 测试点：证明画布和引擎正常运转
          ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
          ctx.beginPath();
          ctx.arc(20, 20, 5, 0, 2 * Math.PI);
          ctx.fill();
          
          if (hands && hands.length > 0) {
            const hand = hands[0];
            
            ctx.fillStyle = "#00FF00";
            ctx.strokeStyle = "#00FF00";
            ctx.lineWidth = 2;

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
              ctx.beginPath();
              ctx.arc(kp.x, kp.y, 4 * depthScale, 0, 2 * Math.PI);
              ctx.fill();
            });

            const sign = guessSign(hand);
            if (sign) {
              setLiveResult(sign);
            }
          }
        }
      }
    } catch (e) {
      console.error("检测帧遇到错误", e);
    }
    
    if (isLiveRecognizing) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
  };

  const handleDeleteHistory = (id: string) => {
    setHistoryRecords(historyRecords.filter(record => record.id !== id));
    toast.success("已删除记录");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(ocrResult);
    toast.success("已复制到剪贴板");
  };

  const handleShare = () => {
    toast.success("分享功能已触发");
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return text("刚刚", "Just now");
    if (minutes < 60) return `${minutes}${text("分钟前", "m ago")}`;
    if (hours < 24) return `${hours}${text("小时前", "h ago")}`;
    return `${days}${text("天前", "d ago")}`;
  };

  const featureHighlights = [
    { label: text("识别方式", "Modes"), value: text("实时 / 拍照 / 相册", "Live / Camera / Album") },
    { label: text("最近记录", "Records"), value: `${historyRecords.length} ${text("条", "items")}` },
    { label: text("适用场景", "Scenes"), value: text("书籍 / 海报 / 屏幕", "Books / Posters / Screens") },
  ];

  const actionCards = [
    {
      key: "live",
      title: text("实时识别", "Live Scan"),
      description: text("即时捕捉镜头内容，适合快速扫读", "Capture content instantly for quick reading"),
      icon: Video,
      accentClass: "bg-purple-500/[0.08] text-purple-500",
      onClick: startLiveRecognition,
    },
    {
      key: "camera",
      title: text("拍照识别", "Photo Scan"),
      description: text("定格当前画面，提取更稳定的文字内容", "Freeze the current frame for more stable text extraction"),
      icon: Camera,
      accentClass: "bg-blue-500/[0.08] text-blue-500",
      onClick: handleOpenCamera,
    },
    {
      key: "album",
      title: text("相册选择", "Choose from Album"),
      description: text("导入现有图片，快速提取与放大文字", "Import an existing image to extract and enlarge text"),
      icon: Image,
      accentClass: "bg-emerald-500/[0.08] text-emerald-500",
      onClick: handleUploadImage,
    },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* Header */}
      <div className="app-topbar sticky top-0 z-10 flex justify-center px-4 pt-10 pb-4">
        <div className="w-full max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-[30px] font-bold text-slate-900 mb-1 tracking-[-0.03em]">{text("视觉辅助", "Vision Assistance")}</h1>
              <p className="text-[13px] text-slate-500">{text("通过相机识别、提取与放大文字内容", "Recognize, extract, and enlarge text through the camera")}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex rounded-2xl border border-white/70 bg-white/60 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <div className="pr-3">
                  <p className="text-[11px] text-slate-400">{text("识别记录", "Records")}</p>
                  <p className="text-[16px] font-semibold text-slate-900">{historyRecords.length}</p>
                </div>
                <div className="border-l border-slate-200/70 pl-3">
                  <p className="text-[11px] text-slate-400">{text("当前能力", "Capabilities")}</p>
                  <p className="text-[13px] font-medium text-slate-700">{text("文字识别与智能分析", "OCR + AI")}</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <div>
                  <p className="text-[11px] text-slate-400">{text("快速入口", "Quick Access")}</p>
                  <p className="text-[13px] font-medium text-slate-700">{text("查看识别历史", "View History")}</p>
                </div>
              </div>
              <Button
                onClick={() => setShowHistory(true)}
                variant="ghost"
                size="icon"
                className="relative h-11 w-11 rounded-2xl bg-white/72 shadow-[0_12px_30px_rgba(15,23,42,0.08)] hover:bg-white"
              >
                <History className="w-5 h-5 text-slate-700" />
                {historyRecords.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-[10px] font-bold text-white">
                    {historyRecords.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {featureHighlights.map((item) => (
              <div
                key={item.label}
                className="rounded-[18px] border border-white/70 bg-white/56 px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl"
              >
                <p className="text-[11px] tracking-[0.12em] text-slate-400">{item.label}</p>
                <p className="mt-1 text-[13px] font-medium leading-5 text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        {isLiveRecognizing ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="app-panel-strong app-grid-glow overflow-hidden rounded-[28px] p-4 flex flex-col items-center"
          >
            <div className="relative w-full aspect-video bg-black rounded-[16px] overflow-hidden">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
              />
              <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {text("实时手势识别中...", "Live gesture recognition...")}
              </div>
              
              {/* Overlay UI for recognized text over video */}
              <AnimatePresence>
                {liveResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white text-lg font-medium px-6 py-2.5 rounded-full border border-white/20 shadow-lg whitespace-nowrap"
                  >
                    {liveResult}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="w-full mt-4 rounded-[20px] border border-white/70 bg-white/72 p-4 min-h-[96px] flex items-center justify-center text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
              {liveResult ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-gray-500">{text("识别结果：", "Result:")}</span>
                  <span className="text-[24px] font-bold text-gray-900 leading-tight">{liveResult}</span>
                </div>
              ) : (
                <span className="text-[14px] text-gray-400">{text("请在镜头前展示手势...", "Show a gesture in front of the camera...")}</span>
              )}
            </div>

            <Button
              onClick={stopCamera}
              className="mt-4 w-full h-12 rounded-[16px] bg-red-50 text-red-600 hover:bg-red-100"
            >
              <X className="w-4 h-4 mr-2" />
              {text("停止识别", "Stop Scanning")}
            </Button>
          </motion.div>
        ) : !capturedImage ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="app-panel-strong app-grid-glow overflow-hidden rounded-[28px] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-[70%]">
                  <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("聚焦识别", "FOCUS MODE")}</p>
                  <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">
                    {text("更快找到文字，更轻松看清内容", "Find text faster and read content more clearly")}
                  </h2>
                  <p className="mt-2 text-[13px] leading-6 text-slate-500">
                    {text("将实时识别、拍照提取与相册导入整合在一个入口中，让高频使用更直接，也让页面内容更充实。", "Combine live scan, photo capture, and album import in one place for a richer and more direct workflow.")}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/70 bg-white/70 px-4 py-3 text-right shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] tracking-[0.12em] text-slate-400">{text("智能提取", "SMART OCR")}</p>
                  <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-slate-900">{text("文字识别", "OCR")}</p>
                  <p className="text-[12px] text-slate-500">{text("支持复制与放大", "Supports copy and zoom")}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[18px] border border-blue-100/80 bg-blue-500/[0.06] px-3 py-3">
                  <p className="text-[11px] text-slate-400">{text("推荐方式", "Recommended")}</p>
                  <p className="mt-1 text-[13px] font-medium text-slate-800">{text("优先拍照识别", "Try photo scan first")}</p>
                </div>
                <div className="rounded-[18px] border border-purple-100/80 bg-purple-500/[0.05] px-3 py-3">
                  <p className="text-[11px] text-slate-400">{text("适用内容", "Suitable For")}</p>
                  <p className="mt-1 text-[13px] font-medium text-slate-800">{text("长文、海报、屏幕", "Long text, posters, screens")}</p>
                </div>
                <div className="rounded-[18px] border border-emerald-100/80 bg-emerald-500/[0.05] px-3 py-3">
                  <p className="text-[11px] text-slate-400">{text("快捷操作", "Quick Actions")}</p>
                  <p className="mt-1 text-[13px] font-medium text-slate-800">{text("保存、复制、分享", "Save, copy, share")}</p>
                </div>
              </div>
            </motion.div>

            {/* 功能按钮 */}
            <div className="grid grid-cols-3 gap-3">
              {actionCards.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.button
                    key={card.key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={card.onClick}
                    className="app-panel app-grid-glow rounded-[24px] p-4 text-left transition-all hover:-translate-y-1"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${card.accentClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="mt-4">
                      <p className="text-[14px] font-semibold text-slate-900">{card.title}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{card.description}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* 使用说明 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="app-panel rounded-[24px] p-5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-500/[0.08]">
                  <ScanText className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="mb-1 text-[15px] font-semibold text-slate-900">{text("使用说明", "How It Works")}</h3>
                      <p className="text-[12px] text-slate-500">{text("更适合高频操作的紧凑型识别工作区", "A compact recognition workspace designed for frequent use")}</p>
                    </div>
                    <div className="rounded-full bg-blue-500/[0.08] px-3 py-1 text-[11px] font-medium text-blue-600">
                      {text("4 步完成识别", "4 steps")}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[12px] font-medium text-slate-900">{text("1. 导入图片", "1. Import an image")}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{text("拍照或从相册选择包含文字的图片", "Take a photo or choose an image that contains text")}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[12px] font-medium text-slate-900">{text("2. 自动提取", "2. Extract automatically")}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{text("系统自动识别并提取清晰的文字内容", "The app recognizes and extracts clear text automatically")}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[12px] font-medium text-slate-900">{text("3. 快速处理", "3. Process quickly")}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{text("支持文字放大、复制与分享操作", "Zoom, copy, and share the extracted result")}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[12px] font-medium text-slate-900">{text("4. 场景覆盖", "4. Flexible scenes")}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{text("适用于书籍、海报、屏幕等内容读取", "Works well for books, posters, and screens")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 快速访问历史 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="mb-2.5 flex items-center justify-between px-1">
                <div>
                  <h2 className="text-[16px] font-bold tracking-tight text-slate-900">{text("最近记录", "Recent Records")}</h2>
                  <p className="mt-0.5 text-[12px] text-slate-400">{text("最近提取的内容会在这里快速查看", "Recently extracted content appears here for quick review")}</p>
                </div>
                <button
                  onClick={() => setShowHistory(true)}
                  className="rounded-full bg-blue-500/[0.08] px-3 py-1.5 text-[13px] font-medium text-blue-500 transition-colors hover:bg-blue-500/[0.12] hover:text-blue-600"
                >
                  {text("查看全部", "View All")}
                </button>
              </div>
              {historyRecords.length > 0 ? (
                <div className="space-y-2">
                  {historyRecords.slice(0, 3).map((record) => (
                    <motion.div
                      key={record.id}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedHistory(record)}
                      className="app-panel rounded-[20px] p-3.5 flex items-center gap-3 cursor-pointer transition-all hover:-translate-y-0.5"
                    >
                      <img
                        src={record.image}
                        alt="历史记录"
                        className="h-14 w-14 flex-shrink-0 rounded-[14px] border border-gray-100/50 bg-gray-50 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-slate-500">
                            {text("文字识别", "OCR")}
                          </span>
                          <span className="text-[11px] text-slate-400">{formatTime(record.timestamp)}</span>
                        </div>
                        <p className="mt-2 truncate text-[14px] font-medium leading-snug text-slate-900">
                          {record.text.split('\n')[0] || text("已识别的文字内容...", "Recognized text content...")}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="app-panel-strong app-grid-glow overflow-hidden rounded-[24px] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-blue-500/[0.08] text-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <History className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold text-slate-900">{text("还没有识别记录", "No records yet")}</h3>
                        <p className="mt-1 max-w-md text-[12px] leading-6 text-slate-500">
                          {text("完成一次拍照识别、实时识别或相册导入后，结果会自动沉淀到这里，方便你快速回看与继续处理。", "After your first scan, results will appear here so you can revisit and continue processing them quickly.")}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-[132px] flex-col items-center justify-center rounded-[18px] border border-white/70 bg-white/72 px-3 py-2 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <p className="text-[11px] text-slate-400">{text("当前状态", "Status")}</p>
                      <p className="mt-1 text-[14px] font-semibold text-slate-800">{text("等待首次识别", "Waiting for your first scan")}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[11px] text-slate-400">{text("推荐", "Recommended")}</p>
                      <p className="mt-1 text-[13px] font-medium text-slate-800">{text("先试拍照识别", "Start with photo scan")}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[11px] text-slate-400">优势</p>
                      <p className="mt-1 text-[13px] font-medium text-slate-800">结果更稳定清晰</p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/72 p-3">
                      <p className="text-[11px] text-slate-400">后续</p>
                      <p className="mt-1 text-[13px] font-medium text-slate-800">支持复制与分享</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        ) : (
          <>
            {/* 识别结果 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="app-panel-strong rounded-[30px] overflow-hidden"
            >
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-56 object-cover"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="app-panel-strong rounded-[30px] p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <ScanText className="w-6 h-6 text-blue-500" />
                  识别结果
                </h2>
                <div className="flex gap-3">
                  <Button
                    onClick={handleCopy}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 hover:bg-blue-50 rounded-[14px]"
                  >
                    <Copy className="w-5 h-5" />
                  </Button>
                  <Button
                    onClick={handleShare}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 hover:bg-blue-50 rounded-[14px]"
                  >
                    <Share2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="relative flex items-center justify-center w-16 h-16">
                    <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                    <div 
                      className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"
                    ></div>
                    <span className="text-blue-600 font-medium text-[13px] z-10">{ocrProgress}%</span>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">正在进行 AI 文字提取...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[22px] border border-blue-100/80 bg-blue-500/[0.06] p-6">
                    <p className="text-gray-800 text-base whitespace-pre-line leading-relaxed">
                      {ocrResult}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-blue-500 hover:bg-blue-50 h-12 rounded-[16px] text-base"
                  >
                    <ZoomIn className="w-5 h-5 mr-2" />
                    放大查看
                  </Button>
                </div>
              )}
            </motion.div>

            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setCapturedImage(null);
                  setOcrResult("");
                }}
                variant="outline"
                className="flex-1 h-14 rounded-[20px] bg-white/80 text-base font-medium"
              >
                重新识别
              </Button>
              <Button
                onClick={handleSaveResult}
                className="flex-1 h-14 rounded-[20px] text-base font-medium"
              >
                保存结果
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 识别模式选择对话框 */}
      <Dialog open={showModeDialog} onOpenChange={setShowModeDialog}>
        <DialogContent className="max-w-xs rounded-[30px] border-white/70 bg-white/88 p-6 text-center shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold mb-2">选择识别模式</DialogTitle>
            <DialogDescription className="text-[14px] text-gray-500 mb-6">
              请选择您希望如何分析这张图片
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button 
              onClick={() => confirmRecognition("text")}
              className="h-14 bg-blue-500 hover:bg-blue-600 rounded-[16px] text-[16px] font-medium w-full flex items-center justify-center gap-2"
            >
              <ScanText className="w-5 h-5" />
              提取图片文字 (OCR)
            </Button>
            <Button 
              onClick={() => confirmRecognition("sign")}
              className="h-14 bg-purple-500 hover:bg-purple-600 rounded-[16px] text-[16px] font-medium w-full flex items-center justify-center gap-2 text-white"
            >
              <Hand className="w-5 h-5" />
              识别手语姿势 (AI)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 历史记录对话框 */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg rounded-[32px] border-white/70 bg-white/88 p-8 max-h-[80vh] overflow-y-auto shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">识别历史</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">查看您之前的文字识别记录</DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-4">
            {historyRecords.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <History className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p className="text-base">暂无历史记录</p>
              </div>
            ) : (
              historyRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-[22px] border border-white/70 bg-slate-50/80 p-5 flex gap-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                >
                  <img
                    src={record.image}
                    alt="历史"
                    className="w-20 h-20 rounded-[16px] object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900 line-clamp-2 mb-2">
                      {record.text}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatTime(record.timestamp)}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleDeleteHistory(record.id)}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 text-red-500 hover:bg-red-50 rounded-[14px]"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 历史详情对话框 */}
      <Dialog open={selectedHistory !== null} onOpenChange={() => setSelectedHistory(null)}>
        <DialogContent className="max-w-lg rounded-[32px] border-white/70 bg-white/88 p-8 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">识别详情</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">查看完整的识别内容</DialogDescription>
          </DialogHeader>
          {selectedHistory && (
            <div className="mt-6 space-y-5">
              <img
                src={selectedHistory.image}
                alt="详情"
                className="w-full h-56 rounded-[20px] object-cover"
              />
              <div className="rounded-[22px] border border-white/70 bg-slate-50/80 p-6">
                <p className="text-gray-800 text-base whitespace-pre-line leading-relaxed">
                  {selectedHistory.text}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedHistory.text);
                    toast.success("已复制");
                  }}
                  variant="outline"
                  className="flex-1 h-12 rounded-[16px] text-base"
                >
                  <Copy className="w-5 h-5 mr-2" />
                  复制
                </Button>
                <Button
                  onClick={() => {
                    handleDeleteHistory(selectedHistory.id);
                    setSelectedHistory(null);
                  }}
                  variant="outline"
                  className="flex-1 text-red-500 hover:bg-red-50 h-12 rounded-[16px] text-base"
                >
                  <Trash2 className="w-5 h-5 mr-2" />
                  删除
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
