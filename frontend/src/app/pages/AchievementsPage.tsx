/**
 * 成就徽章页面
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Award, Trophy, Target, Star, MessageCircle, Volume2, Hand } from "lucide-react";
import { Button } from "../components/ui/button";
import { supabase } from "../lib/supabase";
import { achievementsApi } from "../lib/api";
import { syncAuthToken } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

interface AchievementItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  unlockedAt: string | null;
}

function resolveAchievementIcon(icon: string) {
  switch (icon) {
    case "hand":
      return { icon: Hand, color: "text-blue-500", bg: "bg-blue-50" };
    case "message_circle":
      return { icon: MessageCircle, color: "text-pink-500", bg: "bg-pink-50" };
    case "target":
      return { icon: Target, color: "text-green-500", bg: "bg-green-50" };
    case "volume2":
      return { icon: Volume2, color: "text-indigo-500", bg: "bg-indigo-50" };
    case "star":
      return { icon: Star, color: "text-yellow-500", bg: "bg-yellow-50" };
    case "trophy":
    default:
      return { icon: Trophy, color: "text-purple-500", bg: "bg-purple-50" };
  }
}

export default function AchievementsPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAchievements = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        syncAuthToken(session?.access_token ?? null);
        const data = await achievementsApi.getAll();
        setAchievements(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("[成就页面] 获取数据失败(可能未登录):", e);
        setAchievements([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAchievements();
  }, []);

  const unlockedCount = achievements.filter((item) => item.unlockedAt).length;
  const progressPercent = achievements.length > 0 ? Math.round((unlockedCount / achievements.length) * 100) : 0;

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-10 pb-4">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost" size="sm" onClick={() => navigate(-1)}
            className="absolute left-0 rounded-full px-0 text-[16px] font-medium text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />{text("返回", "Back")}
          </Button>
          <div className="text-center">
            <span className="mb-1 inline-flex rounded-full bg-indigo-500/[0.08] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-indigo-600">
              {text("我的成就", "ACHIEVEMENTS")}
            </span>
            <h1 className="text-[17px] font-semibold text-slate-900">{text("我的成就", "Achievements")}</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        <div className="app-panel-strong overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white shadow-[0_20px_42px_rgba(99,102,241,0.24)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white/80">{text("已解锁成就", "Unlocked")}</p>
              <div className="text-[30px] font-bold tracking-[-0.04em]">{loading ? "--" : unlockedCount} <span className="text-[14px] font-normal opacity-80">/ {achievements.length}</span></div>
            </div>
            <Award className="w-14 h-14 text-white/20" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3">
              <p className="text-[11px] text-white/70">{text("进度", "Progress")}</p>
              <p className="mt-1 text-[13px] font-medium text-white">{progressPercent}%</p>
            </div>
            <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3">
              <p className="text-[11px] text-white/70">{text("最近目标", "Next Goal")}</p>
              <p className="mt-1 text-[13px] font-medium text-white">{text("继续解锁", "Keep unlocking")}</p>
            </div>
            <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3">
              <p className="text-[11px] text-white/70">{text("成长方向", "Focus")}</p>
              <p className="mt-1 text-[13px] font-medium text-white">{text("活跃与练习", "Activity & practice")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {!loading && achievements.length === 0 && (
            <div className="app-panel rounded-[22px] p-6 text-center text-[14px] text-slate-400">
              {text("暂无成就数据", "No achievement data yet")}
            </div>
          )}
          {achievements.map((item) => {
            const meta = resolveAchievementIcon(item.icon);
            const Icon = meta.icon;
            const unlocked = Boolean(item.unlockedAt);
            return (
              <div 
                key={item.id}
                className={`app-panel rounded-[22px] p-4 flex items-center gap-3 transition-all ${!unlocked ? 'opacity-75' : ''}`}
              >
                <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center flex-shrink-0 ${meta.bg} ${meta.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-bold text-slate-900">{item.name}</h3>
                  <p className="text-[13px] text-slate-500 mt-0.5">{item.description}</p>
                  {!unlocked && (
                    <p className="mt-1 text-[12px] text-slate-400">
                      {text("当前进度", "Progress")}: {item.progress}%
                    </p>
                  )}
                </div>
                {unlocked && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-500">
                    {text("已解锁", "Unlocked")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
