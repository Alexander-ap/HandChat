/**
 * 环境音感知页面
 * 
 * 功能说明:
 * - 通过麦克风实时监听环境声音
 * - 集成科大讯飞声音事件检测API进行智能识别
 * - 当音量超过灵敏度阈值时，采集音频片段发送到后端分析
 * - 检测到特定声音类型时通过震动和视觉提示警告用户
 * - 支持自定义监听声音类型和灵敏度
 * 
 * 技术要点:
 * - Web Audio API: 实时音频采集与频谱分析
 * - MediaRecorder API: 录制音频片段用于AI识别
 * - AudioWorklet/AnalyserNode: 计算音量和频率特征
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext } from "react-router";
import { 
  Volume2, 
  Bell, 
  AlertTriangle, 
  Baby, 
  Dog, 
  Phone, 
  DoorOpen, 
  Clock,
  Mic,
  MicOff,
  Activity,
  Wifi,
  WifiOff,
  MessageSquare,
  User,
  Trash2
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Slider } from "../components/ui/slider";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import { soundApi, userApi } from "../lib/api";
import { motion } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";

/** 支持的声音类型定义 */
const soundTypes = [
  { id: "doorbell", icon: Bell, label: "门铃", color: "blue", bgClass: "bg-blue-100", textClass: "text-blue-500" },
  { id: "alarm", icon: AlertTriangle, label: "警报", color: "red", bgClass: "bg-red-100", textClass: "text-red-500" },
  { id: "baby", icon: Baby, label: "婴儿哭声", color: "pink", bgClass: "bg-pink-100", textClass: "text-pink-500" },
  { id: "dog", icon: Dog, label: "狗叫", color: "amber", bgClass: "bg-amber-100", textClass: "text-amber-500" },
  { id: "phone", icon: Phone, label: "电话铃声", color: "green", bgClass: "bg-green-100", textClass: "text-green-500" },
  { id: "knock", icon: DoorOpen, label: "敲门声", color: "purple", bgClass: "bg-purple-100", textClass: "text-purple-500" },
];

/** 检测记录接口 */
interface Detection {
  type: string;
  time: string;
  confidence: number;
  label?: string;
  mode?: string;
}

export default function SoundDetectionPage() {
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const { text } = useLanguage();
  const savedState = getPageState('soundDetection') || {};

  // 状态管理
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [sensitivity, setSensitivity] = useState(savedState.sensitivity || [70]);
  const [enabledSounds, setEnabledSounds] = useState<string[]>(savedState.enabledSounds || [
    "doorbell", "alarm", "phone",
  ]);
  const [recentDetections, setRecentDetections] = useState<Detection[]>(savedState.recentDetections || []);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [apiMode, setApiMode] = useState<string>("--");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Web Audio API 引用
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const demoIntervalRef = useRef<any>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // 语音转文字状态
  interface SpeechMessage {
    id: number;
    text: string;
    time: string;
    isFinal: boolean;
  }
  const [speechMessages, setSpeechMessages] = useState<SpeechMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const speechRecognitionRef = useRef<any>(null);
  const speechIdRef = useRef(0);
  const speechScrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (speechScrollRef.current) {
      speechScrollRef.current.scrollTop = speechScrollRef.current.scrollHeight;
    }
  }, [speechMessages, currentTranscript]);

  /** 启动语音转文字识别 */
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[语音转文字] 浏览器不支持 SpeechRecognition API");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          speechIdRef.current += 1;
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
          setSpeechMessages(prev => [...prev, {
            id: speechIdRef.current,
            text: transcript,
            time: timeStr,
            isFinal: true
          }].slice(-50));
          setCurrentTranscript("");

          // 震动提醒有人说话
          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }
          toast(
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p className="font-medium text-black">有人在说话</p>
                <p className="text-[13px] text-gray-500 line-clamp-1">{transcript}</p>
              </div>
            </div>,
            { duration: 3000, position: 'top-center' }
          );
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setIsSpeaking(true);
        setCurrentTranscript(interim);
      } else {
        setIsSpeaking(false);
      }
    };

    recognition.onspeechstart = () => setIsSpeaking(true);
    recognition.onspeechend = () => setIsSpeaking(false);

    recognition.onend = () => {
      // 自动重启以持续监听
      if (speechRecognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.warn("[语音转文字] 重启失败:", e);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("[语音转文字] 错误:", event.error);
      if (event.error === 'not-allowed') {
        toast.error("麦克风权限被拒绝，已自动关闭语音转文字功能");
        setSpeechEnabled(false);
        speechRecognitionRef.current = null; // 阻止自动重启
      }
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (e) {
      console.warn("[语音转文字] 启动失败:", e);
    }
  };

  /** 停止语音转文字识别 */
  const stopSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      const ref = speechRecognitionRef.current;
      speechRecognitionRef.current = null;
      try { ref.stop(); } catch (e) { /* ignore */ }
    }
    setIsSpeaking(false);
    setCurrentTranscript("");
  };

  // 保存页面状态
  useEffect(() => {
    setPageState('soundDetection', {
      sensitivity,
      enabledSounds,
      recentDetections
    });
  }, [sensitivity, enabledSounds, recentDetections, setPageState]);

  /**
   * 将 Blob 转换为 Base64 字符串
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * 发送音频到后端进行AI识别
   * 调用科大讯飞声音事件检测API (或本地分析降级方案)
   */
  const analyzeAudio = useCallback(async (audioBlob: Blob) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      
      const result = await soundApi.recognize({
        audio: audioBase64,
        format: "wav",
        sampleRate: 16000
      });
      
      if (result.success && result.result) {
        const { soundType, confidence, label } = result.result;
        setApiMode(result.mode === "xfyun" ? "讯飞API" : "本地分析");
        
        // 检查是否在已启用的声音类型中
        if (enabledSounds.includes(soundType) && confidence > 50) {
          triggerAlert(soundType, confidence, label || soundType);
        }
      }
    } catch (error) {
      console.error("[声音分析] 调用失败:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [enabledSounds, isAnalyzing]);

  /**
   * 触发声音警报
   * 包含视觉提示、震动反馈、检测记录保存
   */
  const triggerAlert = useCallback(async (soundType: string, confidence: number, label: string) => {
    const soundInfo = soundTypes.find(s => s.id === soundType);
    if (!soundInfo) return;
    const Icon = soundInfo.icon;

    // 强力震动反馈 - 确保手机上能明显感知
    // 模式: 长-短停-长-短停-长 (紧急警报模式)
    try {
      if (navigator.vibrate) {
        navigator.vibrate([300, 80, 300, 80, 500]);
      }
    } catch (e) {
      console.warn("[震动] vibrate 调用失败:", e);
    }

    // 对于高优先级声音(警报/婴儿哭声)，1.5秒后追加二次震动
    if ((soundType === 'alarm' || soundType === 'baby') && confidence > 70) {
      setTimeout(() => {
        try { navigator.vibrate?.([400, 100, 400]); } catch (_) {}
      }, 1500);
    }

    // 视觉提示 Toast
    toast(
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${soundInfo.bgClass} rounded-full flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${soundInfo.textClass}`} />
        </div>
        <div>
          <p className="font-medium text-black">⚠️ 检测到{label}</p>
          <p className="text-[13px] text-gray-500">置信度: {confidence}%</p>
        </div>
      </div>,
      { duration: 5000, position: 'top-center' }
    );

    // 添加到检测记录
    const newDetection: Detection = {
      type: soundType,
      time: "刚刚",
      confidence,
      label,
      mode: apiMode
    };
    setRecentDetections(prev => [newDetection, ...prev].slice(0, 20));

    // 保存到后端
    try {
      await soundApi.saveRecord({
        soundType,
        confidence,
        description: label
      });
      // 记录操作获取积分
      await userApi.recordAction('sound_detection');
    } catch (e: any) {
      // 保存失败不影响用户体验，静默处理
      // 未登录时保存和积分记录会自然失败，属于预期行为
      console.warn("[声音记录] 保存失败(可能未登录):", e.message);
    }
  }, [apiMode]);

  /**
   * 开始麦克风监听
   * 同启动实时音量分析和音频录制
   */
  const startMonitoring = async () => {
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true,
            noiseSuppression: false,
            sampleRate: 16000 
          } 
        });
      } catch (err) {
        console.warn("无法访问真实麦克风，使用模拟音频流", err);
        toast.info("已启用模拟麦克风进行演示");
        
        // 创建模拟音频流
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const mockCtx = new AudioContextClass();
        const dest = mockCtx.createMediaStreamDestination();
        const osc = mockCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, mockCtx.currentTime);
        
        const gainNode = mockCtx.createGain();
        gainNode.gain.value = 0.1;
        
        osc.connect(gainNode);
        gainNode.connect(dest);
        osc.start();
        
        // 随机改变音量模拟环境音
        setInterval(() => {
          if (mockCtx.state === 'running') {
            gainNode.gain.setTargetAtTime(Math.random() * 0.5, mockCtx.currentTime, 0.1);
          }
        }, 500);
        
        stream = dest.stream;
      }
      
      streamRef.current = stream;
      
      // 初始化 Web Audio API
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.fftSize = 512;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // 初始化 MediaRecorder 用于录制音频片段
      try {
        let options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };
        if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'audio/mp4' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
             options = { mimeType: '' }; // 让浏览器自己选默认格式
          }
        }
        mediaRecorderRef.current = new MediaRecorder(stream, options);
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorderRef.current.onstop = async () => {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            audioChunksRef.current = [];
            await analyzeAudio(audioBlob);
          }
        };
      } catch (e) {
        console.warn("[录音] MediaRecorder 不支持:", e);
      }

      // 实时音量监测循环
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        let max = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
          max = Math.max(max, dataArray[i]);
        }
        const average = sum / bufferLength;
        const volumePercentage = Math.min(100, Math.round((average / 128) * 100));
        
        setCurrentVolume(volumePercentage);

        // 阈值计算: sensitivity 0-100, 值越大越敏感
        const threshold = 100 - sensitivity[0];
        const now = Date.now();
        
        // 当音量超过阈值且距上次检测超过6秒时触发
        if (volumePercentage > threshold && now - lastDetectionTimeRef.current > 6000) {
          lastDetectionTimeRef.current = now;
          
          // 尝试录制3秒音频片段发送给AI分析
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
            audioChunksRef.current = [];
            mediaRecorderRef.current.start();
            setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
            }, 3000); // 录制3秒
          } else {
            // MediaRecorder 不可用时使用基于音量的快速检测
            handleQuickDetection(volumePercentage, max);
          }
        }

        requestFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
      setIsMonitoring(true);
      setIsDemoMode(false);
      // 同时启动语音转文字
      if (speechEnabled) startSpeechRecognition();
      toast.success("已开启环境音监听");
    } catch (err) {
      console.error("[监听] 启动失败:", err);
      toast.error("麦克风无权限，已为您开启「模拟体验模式」");
      
      // 降级到模拟模式
      setIsDemoMode(true);
      setIsMonitoring(true);
      
      // 模拟音量跳动
      demoIntervalRef.current = setInterval(() => {
        setCurrentVolume(Math.floor(Math.random() * 40) + 10);
      }, 200);
    }
  };

  /**
   * 快速声音检测 (基于音频频谱特征)
   * 当 MediaRecorder 不可用时的降级方案
   */
  const handleQuickDetection = (volume: number, maxFreq: number) => {
    const enabledTypes = soundTypes.filter(s => enabledSounds.includes(s.id));
    if (enabledTypes.length === 0) return;

    // 简单的频率特征分类
    let detectedType;
    if (maxFreq > 200) {
      detectedType = enabledTypes.find(s => s.id === 'alarm') || enabledTypes[0];
    } else if (maxFreq > 150) {
      detectedType = enabledTypes.find(s => s.id === 'doorbell') || enabledTypes[0];
    } else if (maxFreq > 100) {
      detectedType = enabledTypes.find(s => s.id === 'phone') || enabledTypes[0];
    } else {
      detectedType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    }

    const confidence = Math.min(95, volume + 15);
    triggerAlert(detectedType.id, confidence, detectedType.label);
  };

  /** 停止监听 */
  const stopMonitoring = () => {
    stopSpeechRecognition();
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    if (requestFrameRef.current) cancelAnimationFrame(requestFrameRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    setIsMonitoring(false);
    setIsDemoMode(false);
    setCurrentVolume(0);
    toast("已停止监听");
  };

  const toggleMonitoring = () => {
    isMonitoring ? stopMonitoring() : startMonitoring();
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopSpeechRecognition();
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      if (requestFrameRef.current) cancelAnimationFrame(requestFrameRef.current);
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    };
  }, []);

  const toggleSound = (soundId: string) => {
    setEnabledSounds(prev =>
      prev.includes(soundId)
        ? prev.filter(id => id !== soundId)
        : [...prev, soundId]
    );
  };

  // 音量级别指示器颜色
  const getVolumeColor = () => {
    if (currentVolume > 80) return "bg-red-500";
    if (currentVolume > 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* Header */}
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-12 pb-4">
        <div className="w-full max-w-2xl flex items-center">
          <div>
            <h1 className="mb-1 text-[30px] font-bold tracking-[-0.03em] text-slate-900">{text("环境音感知", "Sound Awareness")}</h1>
            <p className="text-[13px] text-slate-500">{text("实时监听环境声音并进行智能提醒", "Listen to surrounding sounds in real time and provide smart alerts")}</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-4">
        {/* 主监听卡片 */}
        <div className="app-panel-strong app-grid-glow overflow-hidden rounded-[28px] p-5 text-slate-900">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="mb-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">{text("环境音监听", "Sound Monitoring")}</h2>
              <p className="text-[13px] text-slate-500">
                {isMonitoring 
                  ? (isDemoMode ? text("模拟体验模式运行中...", "Demo mode is running...") : (isAnalyzing ? text("正在分析声音...", "Analyzing sound...") : text("正在实时监听...", "Listening in real time..."))) 
                  : text("点击开始检测", "Tap to start detection")}
              </p>
            </div>
            <motion.div 
              animate={isMonitoring ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={`flex h-14 w-14 items-center justify-center rounded-[20px] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${
                isMonitoring ? "bg-blue-500/[0.12] text-blue-600" : "bg-slate-100/80 text-slate-400"
              }`}
            >
              {isMonitoring ? (
                <Mic className="w-6 h-6" />
              ) : (
                <MicOff className="w-6 h-6" />
              )}
            </motion.div>
          </div>

          {/* 实时音量显示 */}
          {isMonitoring && (
            <div className="mb-4 rounded-[22px] border border-white/70 bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
              <div className="mb-2 flex justify-between text-[12px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  当前音量
                </span>
                <span>{currentVolume}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                <motion.div 
                  className={`h-full ${getVolumeColor()} rounded-full`}
                  animate={{ width: `${currentVolume}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              {/* API 模式指示 */}
              <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
                {apiMode !== "--" ? (
                  <><Wifi className="w-3 h-3" /> 识别引擎: {apiMode}</>
                ) : (
                  <><WifiOff className="w-3 h-3" /> 等待触发分析...</>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={toggleMonitoring}
            className={`w-full h-12 rounded-[16px] text-[15px] font-semibold ${
              isMonitoring
                ? "bg-red-50 text-red-600 hover:bg-red-100 shadow-none"
                : ""
            }`}
          >
            {isMonitoring ? "停止监听" : "开始监听"}
          </Button>

          {/* 模拟模式快捷触发 */}
          {isMonitoring && isDemoMode && (
            <div className="mt-4 border-t border-slate-200/70 pt-4">
              <p className="mb-2.5 flex items-center gap-1 text-[12px] text-slate-600">
                <Activity className="w-3.5 h-3.5" /> 
                请点击下方按钮测试警报效果：
              </p>
              <div className="flex flex-wrap gap-2">
                {soundTypes.filter(s => enabledSounds.includes(s.id)).map(sound => {
                  const Icon = sound.icon;
                  return (
                    <button
                      key={sound.id}
                      onClick={() => {
                        setCurrentVolume(85 + Math.random() * 10);
                        triggerAlert(sound.id, 85 + Math.floor(Math.random() * 15), sound.label);
                        setTimeout(() => setCurrentVolume(Math.floor(Math.random() * 40) + 10), 1500);
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/72 px-3 py-1.5 text-[13px] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:bg-white"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {sound.label}
                    </button>
                  );
                })}
                {soundTypes.filter(s => enabledSounds.includes(s.id)).length === 0 && (
                  <span className="text-[12px] text-slate-400">请先在下方开启监听的声音类型</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 功能说明 */}
        <div className="app-panel rounded-[22px] p-4">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-500/[0.08]">
              <Volume2 className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <h3 className="mb-1 text-[14px] font-semibold text-slate-900">使用说明</h3>
              <p className="text-[12px] leading-relaxed text-slate-500">
                开启监听后，当环境声音超过灵敏度阈值时，系统会自动采集音频片段并通过 AI 智能识别声音类型，如警报、门铃、哭声等；识别成功后会通过震动和弹窗提醒您。
              </p>
            </div>
          </div>
        </div>

        {/* 语音转文字实时显示 */}
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <MessageSquare className="w-3.5 h-3.5" />
              语音转文字
              {isSpeaking && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="inline-flex items-center gap-1 text-[11px] text-[#007AFF] font-medium normal-case tracking-normal"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF]" />
                  识别中
                </motion.span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {speechMessages.length > 0 && (
                <button
                  onClick={() => setSpeechMessages([])}
                  className="text-[12px] text-gray-400 hover:text-red-400 transition-colors flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                  清空
                </button>
              )}
              <Switch
                checked={speechEnabled}
                onCheckedChange={(checked) => {
                  setSpeechEnabled(checked);
                  if (isMonitoring && !isDemoMode) {
                    if (checked) startSpeechRecognition();
                    else stopSpeechRecognition();
                  }
                }}
                className="data-[state=checked]:bg-[#34C759] scale-75"
              />
            </div>
          </div>
          <div className="app-panel overflow-hidden rounded-[24px]">
            {!speechEnabled ? (
              <div className="py-8 text-center text-gray-400 text-[14px]">
                <MicOff className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
                语音转文字已关闭
              </div>
            ) : (
              <div
                ref={speechScrollRef}
                className="max-h-[240px] overflow-y-auto"
              >
                {speechMessages.length === 0 && !currentTranscript ? (
                  <div className="py-8 text-center text-gray-400 text-[14px]">
                    <MessageSquare className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
                    <p>{isMonitoring ? "等待检测到人声..." : "开始监听后将自动识别人声"}</p>
                    <p className="text-[11px] text-gray-300 mt-1">检测到说话时会提醒您并显示内容</p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {speechMessages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex gap-2.5"
                      >
                        <div className="w-[28px] h-[28px] rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-medium text-indigo-500">有人说话</span>
                            <span className="text-[11px] text-gray-300">{msg.time}</span>
                          </div>
                          <div className="rounded-[14px] rounded-tl-[4px] border border-white/70 bg-slate-50/80 px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                            <p className="text-[14px] text-gray-800 leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {currentTranscript && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-2.5"
                      >
                        <div className="w-[28px] h-[28px] rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          >
                            <Mic className="w-3.5 h-3.5 text-blue-500" />
                          </motion.div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-medium text-blue-500">正在说话...</span>
                          </div>
                          <div className="rounded-[14px] rounded-tl-[4px] border border-blue-100 bg-blue-50/80 px-3 py-2.5">
                            <p className="text-[14px] text-blue-700 leading-relaxed">{currentTranscript}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 灵敏度设置 */}
        <div>
          <h3 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            识别灵敏度
          </h3>
          <div className="app-panel rounded-[24px] p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[15px] text-slate-900">灵敏度</span>
              <span className="text-[15px] font-medium text-blue-500">
                {sensitivity[0]}%
              </span>
            </div>
            <Slider
              value={sensitivity}
              onValueChange={setSensitivity}
              max={100}
              step={1}
              className="my-3"
            />
            <div className="flex justify-between text-[11px] text-gray-400">
              <span>较低 (减少误报)</span>
              <span>较高 (更易触发)</span>
            </div>
          </div>
        </div>

        {/* 声音类型选择 */}
        <div>
          <h3 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            监听声音类型
          </h3>
          <div className="app-panel overflow-hidden rounded-[24px]">
            {soundTypes.map((sound, index) => {
              const Icon = sound.icon;
              const isEnabled = enabledSounds.includes(sound.id);
              const isLast = index === soundTypes.length - 1;
              return (
                <div key={sound.id} className="flex items-center gap-3 px-4 py-3" style={!isLast ? { borderBottom: '1px solid rgba(148,163,184,0.10)' } : {}}>
                  <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${sound.bgClass}`}>
                    <Icon className={`w-3.5 h-3.5 ${sound.textClass}`} />
                  </div>
                  <span className="flex-1 text-[15px] text-slate-900">{sound.label}</span>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleSound(sound.id)}
                    className="data-[state=checked]:bg-[#34C759] scale-90"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 检测记录 */}
        <div>
          <h3 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            最近检测记录 ({recentDetections.length})
          </h3>
          <div className="app-panel overflow-hidden rounded-[24px]">
            {recentDetections.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-[14px]">
                <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                暂无检测记录
              </div>
            ) : (
              recentDetections.slice(0, 10).map((detection, index) => {
                const soundType = soundTypes.find(s => s.id === detection.type);
                if (!soundType) return null;
                const Icon = soundType.icon;
                const isLast = index === Math.min(recentDetections.length, 10) - 1;

                return (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 px-4 py-3"
                    style={!isLast ? { borderBottom: '1px solid rgba(148,163,184,0.10)' } : {}}
                  >
                    <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${soundType.bgClass}`}>
                      <Icon className={`w-3.5 h-3.5 ${soundType.textClass}`} />
                    </div>
                    <div className="flex-1">
                      <span className="text-[15px] text-slate-900">{detection.label || soundType.label}</span>
                      <div className="flex items-center gap-1 text-[12px] text-gray-400 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {detection.time}
                        {detection.mode && (
                          <span className="ml-1 text-[11px] text-blue-400">· {detection.mode}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[14px] font-medium ${
                      detection.confidence >= 80 ? 'text-green-500' : 
                      detection.confidence >= 60 ? 'text-yellow-500' : 'text-gray-400'
                    }`}>
                      {detection.confidence}%
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 科大讯飞API配置说明 */}
        <div className="rounded-[20px] border border-blue-100/80 bg-blue-500/[0.06] p-4 shadow-[0_12px_28px_rgba(37,99,235,0.06)]">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-blue-500/[0.08]">
              <Mic className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <h3 className="mb-1 text-[14px] font-semibold text-slate-900">能力说明</h3>
              <p className="text-[12px] leading-relaxed text-slate-500">
                已集成<strong className="text-slate-700">科大讯飞声音事件检测API</strong>，支持智能识别门铃、警报、哭声等多种环境声音，语音转文字功能由浏览器语音识别引擎驱动。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
