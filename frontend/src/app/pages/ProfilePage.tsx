/**
 * 个人中心页面
 * 
 * 功能: 用户信息展示、统计数据、设置入口
 * 从后端实时获取用户统计数据
 */

import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router";
import {
  User, Settings, Bell, Shield, HelpCircle, FileText, ChevronRight,
  Star, Award, TrendingUp, Calendar, Palette, Lock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import ThemeSelector from "../components/ThemeSelector";
import { supabase } from "../lib/supabase";
import { userApi } from "../lib/api";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const savedState = getPageState('profile') || {};

  const [notifications, setNotifications] = useState(savedState.notifications !== undefined ? savedState.notifications : true);
  const [vibration, setVibration] = useState(savedState.vibration !== undefined ? savedState.vibration : true);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [userProfile, setUserProfile] = useState<{name: string; email: string; id: string; avatarUrl: string} | null>(null);
  const [stats, setStats] = useState({ days: 0, points: 0, achievements: 0, postCount: 0, followingCount: 0, followerCount: 0 });

  /** 获取用户信息和统计数据 */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          navigate("/login");
          return;
        }
        
        const meta = session.user.user_metadata || {};
        setUserProfile({
          name: meta.name || '用户',
          email: session.user.email || '',
          id: session.user.id.substring(0, 8).toUpperCase(),
          avatarUrl: meta.avatar_url || ''
        });

        // 获取用户统计
        try {
          const data = await userApi.getStats();
          if (data.stats) {
            setStats({
              days: data.stats.days || 0,
              points: data.stats.points || 0,
              achievements: data.stats.achievementCount || data.stats.achievements || 0,
              postCount: data.stats.postCount || 0,
              followingCount: data.stats.followingCount || 0,
              followerCount: data.stats.followerCount || 0,
            });
          }
        } catch (e: any) {
          console.warn("[个人中心] 获取统计失败 (使用默认值):", e.message || e);
        }

        // 加载服务端设置
        try {
          const settings = await userApi.getSettings()
          if (settings.notification !== undefined) setNotifications(settings.notification)
          if (settings.vibration !== undefined) setVibration(settings.vibration)
        } catch (e) {
          // 使用本地状态
        }
      } catch (error: any) {
        console.error("[个人中心] 获取会话失败:", error);
        // 网络错误时不转登录，显示离线状态
        setUserProfile({ name: '用户', email: '', id: '--------', avatarUrl: '' });
      }
    };
    fetchData();

    // 监听用户数据变化 (从编辑页面返回时)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'USER_UPDATED') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const meta = session.user.user_metadata || {};
            setUserProfile({
              name: meta.name || '用户',
              email: session.user.email || '',
              id: session.user.id.substring(0, 8).toUpperCase(),
              avatarUrl: meta.avatar_url || ''
            });
          }
        } catch (e) {
          console.warn('[个人中心] 更新用户信息失败:', e);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    setPageState('profile', { notifications, vibration });
    userApi.updateSettings({ notification: notifications, vibration }).catch(() => {})
  }, [notifications, vibration, setPageState]);

  const userStats = [
    { label: "帖子", value: stats.postCount, icon: FileText },
    { label: "关注", value: stats.followingCount, icon: TrendingUp },
    { label: "粉丝", value: stats.followerCount, icon: Award },
  ];

  const settingsGroups = [
    {
      title: "账号与设置",
      items: [
        { icon: User, label: "个人资料", action: () => navigate("/profile/edit"), color: "text-blue-500", bg: "bg-blue-50" },
        { icon: Lock, label: "修改密码", action: () => navigate("/change-password"), color: "text-indigo-500", bg: "bg-indigo-50" },
        { icon: Palette, label: "背景主题", action: () => setShowThemeSelector(true), color: "text-purple-500", bg: "bg-purple-50" },
        { icon: Bell, label: "通知设置", hasSwitch: true, switchValue: notifications, onSwitchChange: setNotifications, color: "text-red-500", bg: "bg-red-50" },
        { icon: Settings, label: "震动提醒", hasSwitch: true, switchValue: vibration, onSwitchChange: setVibration, color: "text-gray-500", bg: "bg-gray-100" },
      ],
    },
    {
      title: "数据与成就",
      items: [
        { icon: Calendar, label: "使用统计", badge: `${stats.days}天`, action: () => navigate("/usage"), color: "text-green-500", bg: "bg-green-50" },
        { icon: Star, label: "我的积分", badge: `${stats.points.toLocaleString()}`, action: () => navigate("/points"), color: "text-orange-500", bg: "bg-orange-50" },
        { icon: Award, label: "成就徽章", badge: `${stats.achievements}个`, action: () => navigate("/achievements"), color: "text-indigo-500", bg: "bg-indigo-50" },
      ],
    },
    {
      title: "关于与支持",
      items: [
        { icon: Shield, label: "隐私与安全", action: () => navigate("/privacy"), color: "text-teal-500", bg: "bg-teal-50" },
        { icon: HelpCircle, label: "帮助中心", action: () => navigate("/help"), color: "text-yellow-500", bg: "bg-yellow-50" },
        { icon: FileText, label: "用户协议", action: () => navigate("/agreement"), color: "text-cyan-500", bg: "bg-cyan-50" },
      ],
    },
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("已退出登录");
      navigate("/login");
    } catch (error) {
      console.error("[个人中心] 退出登录失败:", error);
      // 即使退出失败也跳转到登录页（清理本地状态）
      toast.success("已退出登录");
      navigate("/login");
    }
  };

  if (!userProfile) return null;

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* 头部 */}
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-12 pb-3 shadow-sm sticky top-0 z-50 flex flex-col justify-end items-center">
        <div className="w-full max-w-2xl">
          <h1 className="text-[28px] font-bold text-black leading-none">个人中心</h1>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2.5 w-full max-w-2xl mx-auto">
        {/* 用户卡片 */}
        <div 
          onClick={() => navigate("/profile/edit")}
          className="bg-white rounded-[14px] p-3.5 shadow-sm flex items-center gap-3.5 cursor-pointer active:bg-gray-50 transition-colors"
        >
          <Avatar className="w-14 h-14 shadow-sm">
            <AvatarImage src={userProfile.avatarUrl} className="object-cover" />
            <AvatarFallback className="bg-gray-100 text-gray-500 text-[18px] font-medium">
              {userProfile.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold text-black truncate">{userProfile.name}</h2>
            <p className="text-[14px] text-gray-500 truncate">ID: {userProfile.id}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
        </div>

        {/* 统计 */}
        <div className="bg-white rounded-[14px] shadow-sm overflow-hidden flex divide-x divide-gray-100 py-2">
          {userStats.map(stat => {
            const Icon = stat.icon;
            const handleClick = () => {
              if (stat.label === "关注") {
                navigate("/profile/follow?tab=following");
              } else if (stat.label === "粉丝") {
                navigate("/profile/follow?tab=followers");
              } else {
                toast.info(`${stat.label}功能开发中`);
              }
            };
            return (
              <div 
                key={stat.label} 
                className="flex-1 flex flex-col items-center justify-center py-1.5 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                onClick={handleClick}
              >
                <span className="text-[18px] font-bold text-black mb-0.5">{stat.value}</span>
                <div className="flex items-center gap-1 text-gray-500">
                  <Icon className="w-3 h-3" />
                  <span className="text-[12px] font-medium">{stat.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 设置组 */}
        {settingsGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-4">
              {group.title}
            </h3>
            <div className="bg-white rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              {group.items.map((item, itemIndex) => {
                const Icon = item.icon;
                const isLast = itemIndex === group.items.length - 1;
                const Wrapper = item.hasSwitch ? 'div' : 'button';
                
                return (
                  <Wrapper
                    key={itemIndex}
                    onClick={item.hasSwitch ? undefined : item.action}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors ${
                      !item.hasSwitch ? 'active:bg-gray-50 cursor-pointer' : ''
                    }`}
                    style={!isLast ? { borderBottom: '0.5px solid rgba(0,0,0,0.06)' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-[28px] h-[28px] ${item.bg} rounded-[7px] flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                      <span className="text-[15px] text-black">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="text-[14px] text-gray-400">{item.badge}</span>
                      )}
                      {item.hasSwitch ? (
                        <Switch
                          checked={item.switchValue}
                          onCheckedChange={item.onSwitchChange}
                          className="data-[state=checked]:bg-[#34C759] scale-90"
                        />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          </div>
        ))}

        {/* 退出登录 */}
        <div className="pt-1 pb-6">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full h-11 bg-white rounded-[14px] text-[#FF3B30] text-[15px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-gray-50"
          >
            退出登录
          </Button>
          <div className="text-center space-y-1 mt-6">
            <p className="text-[12px] text-gray-400 font-medium">无障碍助手 v2.0.0</p>
            <p className="text-[11px] text-gray-400/80">© 2026 无障碍团队</p>
          </div>
        </div>
      </div>

      <ThemeSelector open={showThemeSelector} onClose={() => setShowThemeSelector(false)} />
    </div>
  );
}
