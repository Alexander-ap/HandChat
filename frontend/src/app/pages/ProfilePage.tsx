/**
 * 个人中心页面
 * 
 * 功能: 用户信息展示、统计数据、设置入口
 * 从后端实时获取用户统计数据
 */

import { useState, useEffect, useCallback } from "react";
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
import LanguageSelector from "../components/LanguageSelector";
import { supabase } from "../lib/supabase";
import { userApi } from "../lib/api";
import { PROFILE_STATS_REFRESH_EVENT } from "../lib/profileEvents";
import { useLanguage } from "../contexts/LanguageContext";

interface UserProfileState {
  name: string;
  email: string;
  id: string;
  avatarUrl: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const savedState = getPageState('profile') || {};

  const [notifications, setNotifications] = useState(savedState.notifications !== undefined ? savedState.notifications : true);
  const [vibration, setVibration] = useState(savedState.vibration !== undefined ? savedState.vibration : true);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileState | null>(savedState.userProfile || null);
  const [stats, setStats] = useState(savedState.stats || { days: 0, points: 0, achievements: 0, postCount: 0, followingCount: 0, followerCount: 0 });
  const { text, language } = useLanguage();

  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login");
        return;
      }

      const meta = session.user.user_metadata || {};
      const fallbackProfile: UserProfileState = {
        name: meta.name || text("用户", "User"),
        email: session.user.email || '',
        id: session.user.id.substring(0, 8).toUpperCase(),
        avatarUrl: meta.avatar_url || '',
      };

      setUserProfile(fallbackProfile);

      const [profileData, statsData, settingsData] = await Promise.all([
        userApi.getProfile().catch((e: any) => {
          console.warn("[个人中心] 获取资料失败:", e.message || e);
          return null;
        }),
        userApi.getStats().catch((e: any) => {
          console.warn("[个人中心] 获取统计失败:", e.message || e);
          return null;
        }),
        userApi.getSettings().catch((e: any) => {
          console.warn("[个人中心] 获取设置失败:", e.message || e);
          return null;
        }),
      ]);

      const nextProfile = {
        ...fallbackProfile,
        name: profileData?.nickname || fallbackProfile.name,
        avatarUrl: profileData?.avatar || fallbackProfile.avatarUrl,
      };
      setUserProfile(nextProfile);

      if (statsData?.stats) {
        setStats({
          days: statsData.stats.days || 0,
          points: statsData.stats.points || 0,
          achievements: statsData.stats.achievementCount || statsData.stats.achievements || 0,
          postCount: statsData.stats.postCount || 0,
          followingCount: statsData.stats.followingCount || 0,
          followerCount: statsData.stats.followerCount || 0,
        });
      }

      if (settingsData) {
        setNotifications(Boolean(settingsData.notification));
        setVibration(Boolean(settingsData.vibration));
      }
    } catch (error: any) {
      console.error("[个人中心] 获取会话失败:", error);
      setUserProfile({ name: text("用户", "User"), email: '', id: '--------', avatarUrl: '' });
    }
  }, [navigate, text]);

  /** 获取用户信息和统计数据 */
  useEffect(() => {
    fetchData();

    const handleProfileStatsRefresh = (event: Event) => {
      const customEvent = event as CustomEvent<{ postCount?: number }>;
      const delta = customEvent.detail?.postCount || 0;
      if (delta) {
        setStats((prev) => ({ ...prev, postCount: Math.max(0, (prev.postCount || 0) + delta) }));
      }
      void fetchData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };

    window.addEventListener(PROFILE_STATS_REFRESH_EVENT, handleProfileStatsRefresh as EventListener);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void fetchData();
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(PROFILE_STATS_REFRESH_EVENT, handleProfileStatsRefresh as EventListener);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData]);

  useEffect(() => {
    setPageState('profile', { notifications, vibration, userProfile, stats });
  }, [notifications, vibration, userProfile, stats, setPageState]);

  const handleNotificationsChange = async (checked: boolean) => {
    const previous = notifications;
    setNotifications(checked);

    try {
      await userApi.updateSettings({ notification: checked });
    } catch (error: any) {
      setNotifications(previous);
      toast.error(error.message || text("通知设置保存失败", "Failed to save notification settings"));
    }
  };

  const handleVibrationChange = async (checked: boolean) => {
    const previous = vibration;
    setVibration(checked);

    try {
      await userApi.updateSettings({ vibration: checked });
    } catch (error: any) {
      setVibration(previous);
      toast.error(error.message || text("震动设置保存失败", "Failed to save vibration settings"));
    }
  };

  const userStats = [
    { label: text("帖子", "Posts"), value: stats.postCount, icon: FileText },
    { label: text("关注", "Following"), value: stats.followingCount, icon: TrendingUp },
    { label: text("粉丝", "Followers"), value: stats.followerCount, icon: Award },
  ];

  const settingsGroups = [
    {
      title: text("账号与设置", "Account & Settings"),
      items: [
        { icon: User, label: text("个人资料", "Profile"), action: () => navigate("/profile/edit"), color: "text-blue-500", bg: "bg-blue-50" },
        { icon: Lock, label: text("修改密码", "Change Password"), action: () => navigate("/change-password"), color: "text-indigo-500", bg: "bg-indigo-50" },
        { icon: Palette, label: text("背景主题", "Theme Background"), action: () => setShowThemeSelector(true), color: "text-purple-500", bg: "bg-purple-50" },
        { icon: Settings, label: text("语言", "Language"), badge: language === "zh" ? "中文" : "English", action: () => setShowLanguageSelector(true), color: "text-cyan-500", bg: "bg-cyan-50" },
        { icon: Bell, label: text("通知设置", "Notifications"), hasSwitch: true, switchValue: notifications, onSwitchChange: handleNotificationsChange, color: "text-red-500", bg: "bg-red-50" },
        { icon: Settings, label: text("震动提醒", "Vibration"), hasSwitch: true, switchValue: vibration, onSwitchChange: handleVibrationChange, color: "text-gray-500", bg: "bg-gray-100" },
      ],
    },
    {
      title: text("数据与成就", "Data & Achievements"),
      items: [
        { icon: Calendar, label: text("使用统计", "Usage Stats"), badge: `${stats.days}${text("天", "d")}`, action: () => navigate("/usage"), color: "text-green-500", bg: "bg-green-50" },
        { icon: Star, label: text("我的积分", "My Points"), badge: `${stats.points.toLocaleString()}`, action: () => navigate("/points"), color: "text-orange-500", bg: "bg-orange-50" },
        { icon: Award, label: text("成就徽章", "Achievements"), badge: `${stats.achievements}${text("个", "")}`, action: () => navigate("/achievements"), color: "text-indigo-500", bg: "bg-indigo-50" },
      ],
    },
    {
      title: text("关于与支持", "About & Support"),
      items: [
        { icon: Shield, label: text("隐私与安全", "Privacy & Security"), action: () => navigate("/privacy"), color: "text-teal-500", bg: "bg-teal-50" },
        { icon: HelpCircle, label: text("帮助中心", "Help Center"), action: () => navigate("/help"), color: "text-yellow-500", bg: "bg-yellow-50" },
        { icon: FileText, label: text("用户协议", "User Agreement"), action: () => navigate("/agreement"), color: "text-cyan-500", bg: "bg-cyan-50" },
      ],
    },
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success(text("已退出登录", "Signed out"));
      navigate("/login");
    } catch (error) {
      console.error("[个人中心] 退出登录失败:", error);
      // 即使退出失败也跳转到登录页（清理本地状态）
      toast.success(text("已退出登录", "Signed out"));
      navigate("/login");
    }
  };

  if (!userProfile) return null;

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* 头部 */}
      <div className="app-topbar sticky top-0 z-50 flex flex-col items-center justify-end px-4 pt-11 pb-3">
        <div className="w-full max-w-2xl">
          <h1 className="text-[var(--md-sys-typescale-title-large-size)] font-medium leading-8 tracking-normal text-[var(--md-sys-color-on-surface)]">
            {text("个人中心", "Profile")}
          </h1>
          <p className="mt-1 text-[12px] leading-4 text-[var(--md-sys-color-on-surface-variant)]">
            {text("管理资料、偏好与账户设置", "Manage your profile, preferences, and account settings")}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        {/* 用户卡片 */}
        <div 
          onClick={() => navigate("/profile/edit")}
          className="app-panel app-grid-glow flex cursor-pointer items-center gap-4 rounded-[24px] p-4 transition-colors"
        >
          <Avatar className="h-16 w-16 border border-white/70 shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
            <AvatarImage src={userProfile.avatarUrl} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-blue-100 via-indigo-50 to-white text-[18px] font-medium text-blue-600">
              {userProfile.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-slate-900">{userProfile.name}</h2>
            <p className="truncate text-[14px] text-slate-500">{text("编号", "ID")}: {userProfile.id}</p>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-300" />
        </div>

        {/* 统计 */}
        <div className="app-panel grid grid-cols-3 overflow-hidden rounded-[24px] py-2">
          {userStats.map(stat => {
            const Icon = stat.icon;
            const handleClick = () => {
              if (stat.label === text("关注", "Following")) {
                navigate("/profile/follow?tab=following");
              } else if (stat.label === text("粉丝", "Followers")) {
                navigate("/profile/follow?tab=followers");
              } else {
                navigate("/community");
              }
            };
            return (
              <div 
                key={stat.label} 
                className="flex flex-col items-center justify-center gap-1 py-3 transition-colors hover:bg-white/45"
                onClick={handleClick}
              >
                <span className="text-[20px] font-bold tracking-[-0.03em] text-slate-900">{stat.value}</span>
                <div className="flex items-center gap-1 text-slate-500">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-medium">{stat.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 设置组 */}
        {settingsGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            <h3 className="mb-2 ml-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {group.title}
            </h3>
            <div className="app-panel overflow-hidden rounded-[24px]">
              {group.items.map((item, itemIndex) => {
                const Icon = item.icon;
                const isLast = itemIndex === group.items.length - 1;
                const Wrapper = item.hasSwitch ? 'div' : 'button';
                
                return (
                  <Wrapper
                    key={itemIndex}
                    onClick={item.hasSwitch ? undefined : item.action}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                      !item.hasSwitch ? 'cursor-pointer hover:bg-white/40 active:bg-white/55' : ''
                    }`}
                    style={!isLast ? { borderBottom: '1px solid rgba(148,163,184,0.10)' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 ${item.bg} rounded-[12px] flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]`}>
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                      <span className="text-[15px] text-slate-900">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="rounded-full bg-white/75 px-2.5 py-1 text-[12px] text-slate-500 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">{item.badge}</span>
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
            className="app-panel w-full h-12 rounded-[20px] text-[15px] font-medium text-[#FF3B30] hover:bg-white/85"
          >
            {text("退出登录", "Sign Out")}
          </Button>
          <div className="text-center space-y-1 mt-6">
            <p className="text-[12px] text-gray-400 font-medium">{text("无障碍助手 v2.0.0", "HandChat v2.0.0")}</p>
            <p className="text-[11px] text-gray-400/80">{text("© 2026 无障碍团队", "© 2026 HandChat Team")}</p>
          </div>
        </div>
      </div>

      <ThemeSelector open={showThemeSelector} onClose={() => setShowThemeSelector(false)} />
      <LanguageSelector open={showLanguageSelector} onClose={() => setShowLanguageSelector(false)} />
    </div>
  );
}
