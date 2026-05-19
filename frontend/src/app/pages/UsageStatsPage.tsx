/**
 * 使用统计页面
 * 从后端获取真实统计数据
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, Calendar, Activity, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { userApi } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

interface DailyStatItem {
  date: string;
  count: number;
}

function getDailyLabel(date: string, locale: "zh" | "en") {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    weekday: "short",
  });
}

export default function UsageStatsPage() {
  const navigate = useNavigate();
  const { text, language } = useLanguage();
  const [stats, setStats] = useState({
    days: 0, points: 0, achievements: 0, loginStreak: 0,
    totalTranslations: 0, totalOcr: 0, totalSoundDetections: 0
  });
  const [dailyStats, setDailyStats] = useState<DailyStatItem[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsData, dailyData] = await Promise.all([
          userApi.getStats(),
          userApi.getDailyStats(7),
        ]);

        if (statsData.stats) {
          setStats(prev => ({ ...prev, ...statsData.stats }));
        }

        setDailyStats(Array.isArray(dailyData) ? dailyData : []);
      } catch (e) {
        console.warn("[使用统计] 获取数据失败(可能未登录):", e);
        setDailyStats([]);
      }
    };
    fetchStats();
  }, []);

  const totalFeatureUsage = (stats.totalOcr || 0) + (stats.totalTranslations || 0) + (stats.totalSoundDetections || 0);
  const maxDailyCount = Math.max(...dailyStats.map((item) => item.count), 1);

  const displayStats = [
    { label: text("累计使用天数", "Days Used"), value: String(stats.days || 0), unit: text("天", "d"), icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
    { label: text("连续打卡", "Streak"), value: String(stats.loginStreak || 0), unit: text("天", "d"), icon: Zap, color: "text-orange-500", bg: "bg-orange-50" },
    { label: text("累计翻译次数", "Translations"), value: String(stats.totalTranslations || 0), unit: text("次", ""), icon: Activity, color: "text-purple-500", bg: "bg-purple-50" },
    { label: text("声音检测次数", "Sound Alerts"), value: String(stats.totalSoundDetections || 0), unit: text("次", ""), icon: Clock, color: "text-green-500", bg: "bg-green-50" },
  ];

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
            <h1 className="text-[17px] font-semibold text-slate-900">{text("使用统计", "Usage Stats")}</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        <div className="app-panel-strong app-grid-glow rounded-[28px] p-5">
          <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("近期概览", "BEHAVIOR SNAPSHOT")}</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-bold tracking-[-0.03em] text-slate-900">{text("你的近期使用趋势", "Your Recent Usage Trends")}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                {text("聚合累计使用、连续活跃与核心功能频率，帮助快速了解近期习惯。", "See your usage days, activity streak, and feature frequency at a glance.")}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 text-right">
              <p className="text-[11px] text-slate-400">{text("累计积分", "Points")}</p>
              <p className="mt-1 text-[20px] font-bold text-slate-900">{stats.points || 0}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {displayStats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="app-panel rounded-[22px] p-4">
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-[12px] ${stat.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[24px] font-bold tracking-[-0.03em] text-slate-900">{stat.value}</span>
                  <span className="text-[12px] text-slate-500">{stat.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="app-panel rounded-[24px] p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-bold text-slate-900">{text("近 7 天会话次数", "Session Count in the Last 7 Days")}</h3>
            <span className="text-[12px] text-slate-400">
              {text("单位：次", "Unit: sessions")}
            </span>
          </div>
          {dailyStats.length > 0 ? (
            <div className="flex items-end justify-between h-36 gap-1.5">
              {dailyStats.map((item) => {
                const height = item.count > 0
                  ? Math.max(14, Math.round((item.count / maxDailyCount) * 100))
                  : 6;

                return (
                  <div key={item.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-500">{item.count}</span>
                    <div
                      className="w-full rounded-t-xl bg-gradient-to-t from-blue-500 to-blue-400 transition-all"
                      style={{ height: `${height}%`, opacity: item.count > 0 ? 1 : 0.2 }}
                    />
                    <span className="text-[10px] text-slate-400">
                      {getDailyLabel(item.date, language)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-[13px] text-slate-400">
              {text("最近 7 天还没有会话数据。", "No session data is available for the last 7 days.")}
            </div>
          )}
        </div>

        <div className="app-panel rounded-[24px] p-5">
          <h3 className="mb-3 text-[15px] font-bold text-slate-900">{text("功能使用占比", "Feature Usage Share")}</h3>
          <div className="space-y-2.5">
            {[
              { label: "OCR文字识别", count: stats.totalOcr || 0, color: "bg-blue-500" },
              { label: "手语转换", count: stats.totalTranslations || 0, color: "bg-green-500" },
              { label: "声音检测", count: stats.totalSoundDetections || 0, color: "bg-purple-500" },
            ].map((item, i) => {
              const pct = totalFeatureUsage > 0 ? Math.round((item.count / totalFeatureUsage) * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="text-slate-500">{item.count}次 ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
