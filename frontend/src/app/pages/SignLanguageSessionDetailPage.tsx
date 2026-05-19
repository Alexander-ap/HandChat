import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  createSessionDataSource,
  getStoredHandChatHistoryMode,
  mapHandChatError,
  type HandChatHistoryMode,
  type SessionDetail,
  type SessionHistoryItem,
} from "../lib/handchat";

function formatTime(value: string | null) {
  if (!value) {
    return "进行中";
  }

  return new Date(value).toLocaleString();
}

export default function SignLanguageSessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const initialMode = useMemo<HandChatHistoryMode>(() => {
    const queryMode = searchParams.get("mode");
    if (queryMode === "browser" || queryMode === "server") {
      return queryMode;
    }
    return getStoredHandChatHistoryMode();
  }, [searchParams]);

  const [mode] = useState<HandChatHistoryMode>(initialMode);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const loadDetail = useCallback(async () => {
    if (!sessionId) {
      setErrorText("会话 ID 缺失");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      const source = createSessionDataSource(mode);
      const [nextDetail, nextHistory] = await Promise.all([
        source.getSessionDetail(sessionId),
        source.getSessionHistory(sessionId, 100),
      ]);
      setDetail(nextDetail);
      setHistory(nextHistory);
    } catch (error) {
      const descriptor = mapHandChatError(error);
      setErrorText(descriptor.message);
      setDetail(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [mode, sessionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--app-background, #F2F2F7)" }}>
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-14 pb-4">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/sign-language/history")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-900">会话详情</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        <div className="app-panel app-grid-glow rounded-[24px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-gray-900 break-all">{sessionId}</p>
              <p className="text-[12px] text-gray-500 mt-1">当前数据源: {mode}</p>
            </div>
            <Button variant="outline" className="h-9 rounded-[10px]" onClick={() => void loadDetail()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="app-panel rounded-[20px] p-6 text-center text-[13px] text-gray-400">
            正在加载会话详情...
          </div>
        ) : errorText ? (
          <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
            {errorText}
          </div>
        ) : (
          <>
            {detail && (
              <div className="app-panel rounded-[22px] p-4">
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    <p className="text-gray-400">状态</p>
                    <p className="text-gray-800 font-medium mt-1">{detail.status}</p>
                  </div>
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    <p className="text-gray-400">稳定结果数</p>
                    <p className="text-gray-800 font-medium mt-1">{detail.translationCount}</p>
                  </div>
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    <p className="text-gray-400">开始时间</p>
                    <p className="text-gray-800 font-medium mt-1">{formatTime(detail.startedAt)}</p>
                  </div>
                  <div className="rounded-[14px] bg-white/80 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    <p className="text-gray-400">结束时间</p>
                    <p className="text-gray-800 font-medium mt-1">{formatTime(detail.endedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {history.length > 0 ? (
                history.map((item, index) => (
                  <div key={`${item.frameId}-${item.type}-${index}`} className="app-panel rounded-[22px] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-medium text-gray-900">{item.text || "句子结束"}</p>
                        <p className="text-[12px] text-gray-500 mt-1">
                          frame #{item.frameId} · {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-gray-500 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        {item.type}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-3">
                      confidence {item.confidence.toFixed(2)}
                      {item.gestureLabel ? ` · gesture ${item.gestureLabel}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <div className="app-panel rounded-[20px] p-6 text-center text-[13px] text-gray-400">
                  该会话暂时没有翻译记录。
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
