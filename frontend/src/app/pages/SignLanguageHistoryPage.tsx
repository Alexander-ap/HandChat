import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, RefreshCw, Server, Smartphone } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  createSessionDataSource,
  getStoredHandChatHistoryMode,
  mapHandChatError,
  setStoredHandChatHistoryMode,
  type HandChatHistoryMode,
  type SessionSummary,
} from "../lib/handchat";

const MODE_OPTIONS: Array<{
  mode: HandChatHistoryMode;
  label: string;
  icon: typeof Smartphone;
}> = [
  { mode: "browser", label: "本地会话", icon: Smartphone },
  { mode: "server", label: "真实服务", icon: Server },
];

function formatTime(value: string | null) {
  if (!value) {
    return "进行中";
  }

  return new Date(value).toLocaleString();
}

export default function SignLanguageHistoryPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<HandChatHistoryMode>(getStoredHandChatHistoryMode());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const source = createSessionDataSource(mode);
      const nextSessions = await source.getSessions(20, 0);
      setSessions(nextSessions);
    } catch (error) {
      const descriptor = mapHandChatError(error);
      setErrorText(descriptor.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleChangeMode = (nextMode: HandChatHistoryMode) => {
    setMode(nextMode);
    setStoredHandChatHistoryMode(nextMode);
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--app-background, #F2F2F7)" }}>
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-14 pb-4">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/sign-language")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-900">手语会话历史</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        <div className="app-panel app-grid-glow rounded-[24px] p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[14px] font-semibold text-gray-900">数据源切换</p>
              <p className="text-[12px] text-gray-500 mt-1">支持在本地历史与真实服务间切换，旧版 Mock 模式会自动回退到本地历史。</p>
            </div>
            <Button variant="outline" className="h-9 rounded-[10px]" onClick={() => void loadSessions()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.mode === mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => handleChangeMode(option.mode)}
                  className={`rounded-[12px] border px-3 py-3 text-left transition-all ${
                    active
                      ? "border-blue-500 bg-blue-500/[0.08] shadow-[0_14px_28px_rgba(37,99,235,0.08)]"
                      : "border-white/70 bg-white/68 hover:bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-2 ${active ? "text-blue-600" : "text-gray-500"}`} />
                  <p className={`text-[13px] font-medium ${active ? "text-blue-700" : "text-gray-700"}`}>
                    {option.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {errorText && (
          <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
            {errorText}
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="app-panel rounded-[20px] p-6 text-center text-[13px] text-gray-400">
              正在加载会话列表...
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => (
              <div key={session.id} className="app-panel rounded-[22px] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900 break-all">{session.id}</p>
                    <p className="text-[12px] text-gray-500 mt-1">
                      {session.status} · {session.translationCount} 条稳定结果
                    </p>
                  </div>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-gray-500 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    {mode}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[12px] text-gray-500">
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    开始时间
                    <p className="text-gray-800 mt-1">{formatTime(session.startedAt)}</p>
                  </div>
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    结束时间
                    <p className="text-gray-800 mt-1">{formatTime(session.endedAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[13px] text-gray-600">
                    最近结果: {session.lastTranslation || "暂无"}
                  </p>
                  <Button
                    onClick={() => navigate(`/sign-language/history/${session.id}?mode=${mode}`)}
                    className="h-9 rounded-[12px]"
                  >
                    查看详情
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="app-panel rounded-[20px] p-6 text-center text-[13px] text-gray-400">
              当前数据源下还没有会话记录。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
