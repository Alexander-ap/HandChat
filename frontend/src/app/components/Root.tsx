import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import BottomNav from "./BottomNav";
import WelcomeScreen from "./WelcomeScreen";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import { syncAuthToken } from "../lib/api";

export interface PageStateContext {
  getPageState: (key: string) => any;
  setPageState: (key: string, state: any) => void;
}

/** 主页面路径集合 - 这些是底部导航栏对应的页面 */
const MAIN_PAGES = new Set(["/", "/sign-language", "/sound", "/community", "/profile"]);

function RootContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNav =
    location.pathname === "/login" ||
    location.pathname.startsWith("/sign-language/history") ||
    location.pathname.startsWith("/profile/") ||
    location.pathname === "/help" ||
    location.pathname === "/privacy" ||
    location.pathname === "/agreement" ||
    location.pathname === "/points" ||
    location.pathname === "/achievements" ||
    location.pathname === "/usage" ||
    location.pathname === "/change-password";
  const [showWelcome, setShowWelcome] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pageStateRef = useRef<Record<string, any>>({});
  const { currentTheme } = useTheme();
  const historyStackRef = useRef<string[]>([]);

  const contextValue: PageStateContext = {
    getPageState: (key) => pageStateRef.current[key],
    setPageState: (key, state) => {
      pageStateRef.current[key] = state;
    },
  };

  // 跟踪导航历史，用于处理侧滑返回
  useEffect(() => {
    const stack = historyStackRef.current;
    const current = location.pathname;
    // 避免连续重复记录同一路径
    if (stack[stack.length - 1] !== current) {
      stack.push(current);
      // 限制历史栈深度
      if (stack.length > 50) stack.shift();
    }
  }, [location.pathname]);

  // 确保每次路由切换都有浏览器历史条目（防止侧滑直接退出）
  useEffect(() => {
    // 在 APK 环境下，确保至少有一个历史条目防止首次侧滑就退出
    if (window.history.length <= 1 && location.pathname === "/") {
      window.history.pushState(null, "", "/");
    }
  }, [location.pathname]);

  // 认证守卫：使用 onAuthStateChange 事件驱动模式，避免竞态条件
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      // 同步 token 到 api
      syncAuthToken(session?.access_token || null);

      if (event === 'INITIAL_SESSION') {
        // 初始会话事件：立即确定登录状态
        setIsLoggedIn(!!session);
        setAuthChecked(true);
        if (!session) {
          navigate("/login", { replace: true });
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // 登录成功或 token 刷新：更新为已登录状态
        setIsLoggedIn(true);
        setAuthChecked(true);
      } else if (event === 'SIGNED_OUT') {
        // 明确退出：跳转到登录页
        setIsLoggedIn(false);
        navigate("/login", { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    // 检查是否是首次访问
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcome");
    if (!hasSeenWelcome && location.pathname === "/" && isLoggedIn) {
      setShowWelcome(true);
    }
  }, [location.pathname, isLoggedIn]);

  const handleWelcomeComplete = () => {
    localStorage.setItem("hasSeenWelcome", "true");
    setShowWelcome(false);
  };

  // 未完成认证检查时显示加载
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: currentTheme.background }}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <p className="text-sm text-gray-400">正在检查登录状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-16 transition-colors duration-500"
      style={{ background: currentTheme.background }}
    >
      {showWelcome && <WelcomeScreen onComplete={handleWelcomeComplete} />}
      <Outlet context={contextValue} />
      {!hideNav && <BottomNav />}
    </div>
  );
}

export default function Root() {
  return <RootContent />;
}
