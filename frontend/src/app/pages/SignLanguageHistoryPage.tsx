import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Database, RefreshCw, Server, Smartphone } from "lucide-react";
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
  { mode: "mock", label: "Mock 数据", icon: Database },
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
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex items-center justify-center border-b border-black/5">
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
          <h1 className="text-[17px] font-semibold text-black">手语会话历史</h1>
        </div>
      </div>

      <div className="p-4 space-y-3 w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-[16px] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[14px] font-semibold text-gray-900">数据源切换</p>
              <p className="text-[12px] text-gray-500 mt-1">用于 P2 开发调试，可在本地/Mock/真实服务间切换。</p>
            </div>
            <Button variant="outline" className="h-9 rounded-[10px]" onClick={() => void loadSessions()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-gray-50 hover:bg-white"
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
            <div className="bg-white rounded-[14px] p-6 text-center text-[13px] text-gray-400 shadow-sm">
              正在加载会话列表...
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => (
              <div key={session.id} className="bg-white rounded-[14px] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900 break-all">{session.id}</p>
                    <p className="text-[12px] text-gray-500 mt-1">
                      {session.status} · {session.translationCount} 条稳定结果
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-500">
                    {mode}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[12px] text-gray-500">
                  <div className="rounded-[10px] bg-gray-50 px-3 py-2">
                    开始时间
                    <p className="text-gray-800 mt-1">{formatTime(session.startedAt)}</p>
                  </div>
                  <div className="rounded-[10px] bg-gray-50 px-3 py-2">
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
                    className="h-9 rounded-[10px] bg-blue-500 hover:bg-blue-600"
                  >
                    查看详情
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-[14px] p-6 text-center text-[13px] text-gray-400 shadow-sm">
              当前数据源下还没有会话记录。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
