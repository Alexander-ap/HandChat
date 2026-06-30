import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import BottomNav from "./BottomNav";
import WelcomeScreen from "./WelcomeScreen";
import { useTheme } from "../contexts/ThemeContext";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { syncAuthToken, userApi } from "../lib/api";

export interface PageStateContext {
  getPageState: (key: string) => any;
  setPageState: (key: string, state: any) => void;
}

//#region debug-point follow-auth-after-login
const __ENABLE_DEBUG_REPORT__ = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_TELEMETRY === "true";
const __DBG_URL__ = "http://127.0.0.1:3939/log";
async function __dbgReport__(payload: Record<string, any>) {
  if (!__ENABLE_DEBUG_REPORT__) return;
  try {
    await fetch(__DBG_URL__, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "follow-auth-after-login",
        src: "frontend",
        ...payload,
      }),
    });
  } catch (_) {}
}
//#endregion debug-point follow-auth-after-login

/** 主页面路径集合 - 这些是底部导航栏对应的页面 */
const MAIN_PAGES = new Set(["/", "/sign-language", "/sound", "/community", "/profile"]);
const PUBLIC_ROOT_PATHS = new Set(["/help", "/privacy", "/agreement"]);

type AuthUserSnapshot = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

function buildAuthUserSnapshot(user: any): AuthUserSnapshot | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.user_metadata?.name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? null,
  };
}

function isPublicRootPath(pathname: string) {
  return PUBLIC_ROOT_PATHS.has(pathname);
}

function getWelcomeStorageKey(userId: string | null) {
  return userId ? `hasSeenWelcome:${userId}` : "hasSeenWelcome";
}

function hasLocalWelcomeFlag(userId: string | null) {
  return (
    localStorage.getItem(getWelcomeStorageKey(userId)) === "true" ||
    localStorage.getItem("hasSeenWelcome") === "true"
  );
}

function markLocalWelcomeSeen(userId: string | null) {
  localStorage.setItem("hasSeenWelcome", "true");
  if (userId) localStorage.setItem(getWelcomeStorageKey(userId), "true");
}

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
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const pageStateRef = useRef<Record<string, any>>({});
  const { currentTheme } = useTheme();
  const { text } = useLanguage();
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

    const bootstrapSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        syncAuthToken(session?.access_token || null);
        setIsLoggedIn(Boolean(session));
        setAuthUser(buildAuthUserSnapshot(session?.user));
        setAuthChecked(true);
        //#region debug-point follow-auth-after-login
        void __dbgReport__({
          evt: "auth.bootstrapSession",
          hasSession: Boolean(session),
          userId: session?.user?.id ?? null,
          expiresAt: session?.expires_at ?? null,
        });
        //#endregion debug-point follow-auth-after-login
      } catch (error) {
        if (!mounted) return;
        syncAuthToken(null);
        setIsLoggedIn(false);
        setAuthUser(null);
        setAuthChecked(true);
        //#region debug-point follow-auth-after-login
        void __dbgReport__({
          evt: "auth.bootstrapSession.error",
          message: (error as any)?.message ?? String(error),
        });
        //#endregion debug-point follow-auth-after-login
      }
    };

    void bootstrapSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      // 同步 token 到 api
      syncAuthToken(session?.access_token || null);
      setAuthUser(buildAuthUserSnapshot(session?.user));
      //#region debug-point follow-auth-after-login
      void __dbgReport__({
        evt: "auth.onAuthStateChange",
        event,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        expiresAt: session?.expires_at ?? null,
      });
      //#endregion debug-point follow-auth-after-login

      if (event === 'INITIAL_SESSION') {
        // 初始会话事件：立即确定登录状态
        setIsLoggedIn(!!session);
        setAuthChecked(true);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // 登录成功或 token 刷新：更新为已登录状态
        setIsLoggedIn(true);
        setAuthChecked(true);
      } else if (event === 'SIGNED_OUT') {
        // 明确退出：跳转到登录页
        setIsLoggedIn(false);
        if (location.pathname !== "/login") {
          navigate("/login", { replace: true });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  useEffect(() => {
    if (!authChecked) return;
    if (!isLoggedIn && !isPublicRootPath(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [authChecked, isLoggedIn, location.pathname, navigate]);

  useEffect(() => {
    // 检查是否是首次访问
    let cancelled = false;

    const checkWelcomeState = async () => {
      if (location.pathname !== "/" || !isLoggedIn) {
        setShowWelcome(false);
        return;
      }

      const userId = authUser?.id ?? null;
      if (hasLocalWelcomeFlag(userId)) {
        setShowWelcome(false);
        return;
      }

      try {
        const profile = await userApi.getProfile();
        if (cancelled) return;

        const profileExists = Boolean(
          profile?.profileExists ||
          profile?.nickname ||
          profile?.avatar ||
          profile?.bio
        );
        if (profileExists) {
          markLocalWelcomeSeen(userId);
          setShowWelcome(false);
          return;
        }
      } catch (error) {
        console.warn("[Root] Failed to check remote profile before welcome:", error);
        if (cancelled) return;
        setShowWelcome(false);
        return;
      }

      if (!cancelled) setShowWelcome(true);
    };

    void checkWelcomeState();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, isLoggedIn, authUser?.id]);

  const handleWelcomeComplete = () => {
    markLocalWelcomeSeen(authUser?.id ?? null);
    setShowWelcome(false);
    if (authUser) {
      const fallbackName = authUser.name || authUser.email?.split("@")[0] || undefined;
      void userApi.updateProfile({
        name: fallbackName,
        avatar_url: authUser.avatarUrl || undefined,
      }).catch((error) => {
        console.warn("[Root] Failed to mark welcome complete remotely:", error);
      });
    }
  };

  // 未完成认证检查时显示加载
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: currentTheme.background }}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <p className="text-sm text-gray-400">{text("正在检查登录状态...", "Checking sign-in status...")}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen pb-20 transition-colors duration-500"
      style={{ background: currentTheme.background }}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-[320px] max-w-5xl overflow-hidden">
        <div className="absolute left-[-6%] top-[-20%] h-56 w-56 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="absolute right-[-8%] top-8 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl" />
        <div className="absolute left-1/2 top-24 h-44 w-44 -translate-x-1/2 rounded-full bg-violet-200/20 blur-3xl" />
      </div>
      {showWelcome && <WelcomeScreen onComplete={handleWelcomeComplete} />}
      <div className="relative z-10">
        <Outlet context={contextValue} />
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}

export default function Root() {
  return <RootContent />;
}
