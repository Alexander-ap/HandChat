/**
 * 使用统计页面
 * 从后端获取真实统计数据
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, Calendar, Activity, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { userApi } from "../lib/api";

export default function UsageStatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    days: 0, points: 0, achievements: 0, loginStreak: 0,
    totalTranslations: 0, totalOcr: 0, totalSoundDetections: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await userApi.getStats()
        if (data.stats) setStats(prev => ({ ...prev, ...data.stats }))
      } catch (e) {
        console.warn("[使用统计] 获取数据失败(可能未登录):", e)
      }
    }
    fetchStats()
  }, [])

  const displayStats = [
    { label: "累计使用天数", value: String(stats.days || 0), unit: "天", icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "连续打卡", value: String(stats.loginStreak || 0), unit: "天", icon: Zap, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "累计翻译次数", value: String(stats.totalTranslations || 0), unit: "次", icon: Activity, color: "text-purple-500", bg: "bg-purple-50" },
    { label: "声音检测次数", value: String(stats.totalSoundDetections || 0), unit: "次", icon: Clock, color: "text-green-500", bg: "bg-green-50" },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex items-center justify-center border-b border-black/5">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost" size="sm" onClick={() => navigate(-1)}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black">使用统计</h1>
        </div>
      </div>

      <div className="p-4 space-y-3 w-full max-w-2xl mx-auto">
        <div className="grid grid-cols-2 gap-2.5">
          {displayStats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="bg-white rounded-[14px] p-3.5 shadow-sm">
                <div className={`w-7 h-7 rounded-[7px] flex items-center justify-center mb-2 ${stat.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-[11px] text-gray-500 font-medium">{stat.label}</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-[22px] font-bold text-gray-900">{stat.value}</span>
                  <span className="text-[12px] text-gray-500">{stat.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* 使用时长概览 */}
        <div className="bg-white rounded-[14px] p-4 shadow-sm">
          <h3 className="text-[15px] font-bold text-gray-900 mb-3">近7天使用时长</h3>
          <div className="flex items-center justify-center py-10">
            <p className="text-[14px] text-gray-400">详细数据即将上线</p>
          </div>
        </div>

        <div className="bg-white rounded-[14px] p-4 shadow-sm">
          <h3 className="text-[15px] font-bold text-gray-900 mb-3">功能使用占比</h3>
          <div className="space-y-2.5">
            {[
              { label: "OCR文字识别", count: stats.totalOcr || 0, color: "bg-blue-500" },
              { label: "手语转换", count: stats.totalTranslations || 0, color: "bg-green-500" },
              { label: "声音检测", count: stats.totalSoundDetections || 0, color: "bg-purple-500" },
            ].map((item, i) => {
              const total = (stats.totalOcr || 0) + (stats.totalTranslations || 0) + (stats.totalSoundDetections || 0);
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 33;
              return (
                <div key={i}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="text-gray-500">{item.count}次 ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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