/**
 * 我的积分页面
 * 从后端获取真实积分数据和明细
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Star, Gift, ShoppingBag, Crown } from "lucide-react";
import { Button } from "../components/ui/button";
import { supabase } from "../lib/supabase";
import { syncAuthToken, userApi } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";

interface PointRecord {
  id: string;
  title: string;
  points: number;
  type: string;
  date: string;
}

function formatPointsRecord(reason: string) {
  switch (reason) {
    case "post":
      return { title: "发布帖子", type: "earn" };
    case "comment":
      return { title: "发表评论", type: "earn" };
    case "sound_detection":
      return { title: "声音检测", type: "earn" };
    case "sign_language":
      return { title: "手语识别", type: "earn" };
    case "ocr":
      return { title: "OCR 识别", type: "earn" };
    default:
      return { title: reason || "积分变动", type: "earn" };
  }
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PointsPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        syncAuthToken(session?.access_token ?? null);
        const [statsData, pointsData] = await Promise.allSettled([
          userApi.getStats(),
          userApi.getPointsHistory()
        ]);
        
        if (statsData.status === 'fulfilled' && statsData.value.stats) {
          setTotalPoints(statsData.value.stats.points || 0);
        } else {
          setTotalPoints(0);
        }
        
        if (pointsData.status === 'fulfilled' && Array.isArray(pointsData.value.records)) {
          setHistory(pointsData.value.records.map((item: any) => {
            const meta = formatPointsRecord(item.reason);
            return {
              id: item.id,
              title: meta.title,
              points: Number(item.amount || 0),
              type: meta.type,
              date: formatDateLabel(item.createdAt),
            };
          }));
        } else {
          setHistory([]);
        }
      } catch (e) {
        console.error("[积分页面] 获取数据失败:", e);
        setHistory([]);
        setTotalPoints(0);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <div className="app-topbar sticky top-0 z-50 flex justify-center px-4 pt-10 pb-4">
        <div className="relative w-full max-w-2xl">
          <div className="mb-4 flex items-center justify-center">
          <Button 
            variant="ghost" size="icon" onClick={() => navigate(-1)}
            className="absolute left-0 rounded-full text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
            <div className="text-center">
              <span className="mb-1 inline-flex rounded-full bg-amber-500/[0.10] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-amber-600">
                {text("积分中心", "POINTS BANK")}
              </span>
              <h1 className="text-[17px] font-semibold text-slate-900">{text("我的积分", "My Points")}</h1>
            </div>
          </div>
          <div className="app-panel-strong overflow-hidden rounded-[28px] bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 p-6 text-white shadow-[0_20px_40px_rgba(249,115,22,0.22)]">
            <p className="text-[13px] text-white/80">{text("可用积分", "Available Points")}</p>
            <div className="mt-2 flex items-center gap-2">
              <Star className="h-6 w-6 fill-current" />
              <span className="text-[38px] font-bold tracking-[-0.04em]">{loading ? "--" : totalPoints.toLocaleString()}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3 backdrop-blur">
                <p className="text-[11px] text-white/70">{text("累计记录", "Records")}</p>
                <p className="mt-1 text-[13px] font-medium text-white">{loading ? "--" : `${history.length} ${text("条", "items")}`}</p>
              </div>
              <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3 backdrop-blur">
                <p className="text-[11px] text-white/70">{text("积分状态", "Status")}</p>
                <p className="mt-1 text-[13px] font-medium text-white">{text("持续累积", "Accumulating")}</p>
              </div>
              <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3 backdrop-blur">
                <p className="text-[11px] text-white/70">{text("权益方向", "Benefits")}</p>
                <p className="mt-1 text-[13px] font-medium text-white">{text("兑换与激励", "Rewards & perks")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        <div className="app-panel rounded-[24px] p-4 flex justify-around">
          {[
            { icon: Gift, label: text("积分抽奖", "Lucky Draw"), color: "text-orange-500", bg: "bg-orange-50" },
            { icon: ShoppingBag, label: text("积分商城", "Points Store"), color: "text-blue-500", bg: "bg-blue-50" },
            { icon: Crown, label: text("会员特权", "Member Perks"), color: "text-purple-500", bg: "bg-purple-50" },
          ].map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toast.info(text(`${item.label}即将上线`, `${item.label} is coming soon`))}
                className="flex flex-col items-center gap-2 rounded-[18px] px-2 py-1.5 transition-colors hover:bg-white/50"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-[16px] ${item.bg} ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-[12px] font-medium text-slate-600">{item.label}</span>
              </button>
          ))}
        </div>

        <div>
          <h2 className="mb-2 px-1 text-[14px] font-bold text-slate-800">积分明细</h2>
          <div className="app-panel overflow-hidden rounded-[24px]">
            {history.length === 0 ? (
              <div className="py-10 text-center text-[14px] text-slate-400">{text("暂无积分记录", "No point records yet")}</div>
            ) : (
              history.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  className="flex items-center justify-between px-4 py-4"
                  style={idx < history.length - 1 ? { borderBottom: '0.5px solid rgba(0,0,0,0.06)' } : {}}
                >
                  <div>
                    <h3 className="text-[15px] font-medium text-slate-900">{item.title}</h3>
                    <p className="mt-0.5 text-[12px] text-slate-400">{item.date}</p>
                  </div>
                  <div className={`text-[16px] font-bold ${item.type === 'earn' ? 'text-orange-500' : 'text-slate-900'}`}>
                    {item.type === 'earn' ? '+' : ''}{item.points}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
