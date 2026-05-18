/**
 * 成就徽章页面
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Award, Trophy, Target, Star, MessageCircle, Volume2, Hand } from "lucide-react";
import { Button } from "../components/ui/button";
import { userApi } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

export default function AchievementsPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
  const [totalAchievements, setTotalAchievements] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await userApi.getStats();
        if (data.stats) setTotalAchievements(data.stats.achievements || 0);
      } catch (e) {
        console.warn("[成就页面] 获取数据失败(可能未登录):", e);
        setTotalAchievements(3);
      }
    };
    fetchStats();
  }, []);

  const achievements = [
    { title: "初识手语", desc: "完成第一次手语识别", icon: Hand, color: "text-blue-500", bg: "bg-blue-50", unlocked: true },
    { title: "交流达人", desc: "在社区发布10条动态", icon: MessageCircle, color: "text-pink-500", bg: "bg-pink-50", unlocked: totalAchievements >= 2 },
    { title: "坚持不懈", desc: "连续登录7天", icon: Target, color: "text-green-500", bg: "bg-green-50", unlocked: totalAchievements >= 3 },
    { title: "聆听者", desc: "使用声音检测功能50次", icon: Volume2, color: "text-indigo-500", bg: "bg-indigo-50", unlocked: totalAchievements >= 4 },
    { title: "社区明星", desc: "获得100个赞", icon: Star, color: "text-yellow-500", bg: "bg-yellow-50", unlocked: totalAchievements >= 5 },
    { title: "手语大师", desc: "完成所有基础课程", icon: Trophy, color: "text-purple-500", bg: "bg-purple-50", unlocked: totalAchievements >= 6 },
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;

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
              <div className="text-[30px] font-bold tracking-[-0.04em]">{unlockedCount} <span className="text-[14px] font-normal opacity-80">/ {achievements.length}</span></div>
            </div>
            <Award className="w-14 h-14 text-white/20" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-white/20 bg-white/12 px-3 py-3">
              <p className="text-[11px] text-white/70">{text("进度", "Progress")}</p>
              <p className="mt-1 text-[13px] font-medium text-white">{Math.round((unlockedCount / achievements.length) * 100)}%</p>
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
          {achievements.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx} 
                className={`app-panel rounded-[22px] p-4 flex items-center gap-3 transition-all ${!item.unlocked ? 'opacity-55 grayscale' : ''}`}
              >
                <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center flex-shrink-0 ${item.bg} ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-bold text-slate-900">{item.title}</h3>
                  <p className="text-[13px] text-slate-500 mt-0.5">{item.desc}</p>
                </div>
                {item.unlocked && (
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
