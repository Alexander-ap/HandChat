/**
 * 我的积分页面
 * 从后端获取真实积分数据和明细
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Star, Gift, ShoppingBag, Crown } from "lucide-react";
import { Button } from "../components/ui/button";
import { userApi } from "../lib/api";

interface PointRecord {
  id: string
  reason: string
  amount: number
  createdAt: string
}

export default function PointsPage() {
  const navigate = useNavigate();
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<PointRecord[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, pointsData] = await Promise.allSettled([
          userApi.getStats(),
          userApi.getPointsHistory()
        ])
        
        if (statsData.status === 'fulfilled' && statsData.value.stats) {
          setTotalPoints(statsData.value.stats.points || 0)
        }
        
        if (pointsData.status === 'fulfilled' && pointsData.value.records) {
          setHistory(pointsData.value.records)
        }
      } catch (e) {
        console.error("[积分页面] 获取数据失败:", e)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* 头部 */}
      <div className="bg-gradient-to-br from-yellow-400 to-orange-500 px-4 pt-14 pb-6 rounded-b-[24px] shadow-sm relative z-10">
        <div className="flex items-center text-white mb-4">
          <Button 
            variant="ghost" size="icon" onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20 rounded-full absolute left-4"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-center text-[17px] font-semibold">我的积分</h1>
        </div>
        <div className="text-center text-white space-y-0.5">
          <p className="text-white/90 text-[13px]">可用积分</p>
          <div className="flex items-center justify-center gap-1">
            <Star className="w-6 h-6 fill-current" />
            <span className="text-[36px] font-bold">{totalPoints.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-3 w-full max-w-2xl mx-auto relative z-20">
        {/* 快捷入口 */}
        <div className="bg-white rounded-[18px] p-4 shadow-sm flex justify-around">
          {[
            { icon: Gift, label: "积分抽奖", color: "text-orange-500", bg: "bg-orange-50" },
            { icon: ShoppingBag, label: "积分商城", color: "text-blue-500", bg: "bg-blue-50" },
            { icon: Crown, label: "会员特权", color: "text-purple-500", bg: "bg-purple-50" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 ${item.bg} rounded-full flex items-center justify-center ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[12px] text-gray-600 font-medium">{item.label}</span>
            </div>
          ))}
        </div>

        {/* 积分明细 */}
        <div>
          <h2 className="text-[14px] font-bold text-gray-800 mb-2 px-1">积分明细</h2>
          <div className="bg-white rounded-[14px] shadow-sm overflow-hidden">
            {history.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-[14px]">暂无积分记录</div>
            ) : (
              history.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  className="flex items-center justify-between px-4 py-3"
                  style={idx < history.length - 1 ? { borderBottom: '0.5px solid rgba(0,0,0,0.06)' } : {}}
                >
                  <div>
                    <h3 className="text-[15px] font-medium text-gray-900">{item.reason}</h3>
                    <p className="text-[12px] text-gray-400 mt-0.5">{formatPointTime(item.createdAt)}</p>
                  </div>
                  <div className={`text-[16px] font-bold ${item.amount > 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                    {item.amount > 0 ? '+' : ''}{item.amount}
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

function formatPointTime(isoString: string): string {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const d = new Date(isoString)
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const days = Math.floor(hours / 24)
  if (days < 2) return '昨天'
  if (days < 7) return `${days}天前`
  return new Date(isoString).toLocaleDateString()
}