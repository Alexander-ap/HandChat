import { Link, useLocation } from "react-router";
import { Camera, Hand, Volume2, MessageCircle, User } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

export default function BottomNav() {
  const location = useLocation();
  const { text } = useLanguage();

  const navItems = [
    { path: "/", icon: Camera, label: text("识别", "Vision") },
    { path: "/sign-language", icon: Hand, label: text("手语", "Sign") },
    { path: "/sound", icon: Volume2, label: text("声音", "Sound") },
    { path: "/community", icon: MessageCircle, label: text("社区", "Community") },
    { path: "/profile", icon: User, label: text("我的", "Profile") },
  ];

  const handleTap = () => {
    if (navigator.vibrate) navigator.vibrate(5);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-2"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="mx-auto max-w-lg rounded-[28px] border border-white/70 bg-white/72 px-2 py-2 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
        <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleTap}
              className={`flex min-w-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition-all duration-200 active:scale-95 ${
                isActive
                  ? "bg-blue-500/[0.08] text-blue-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <div className="relative p-1">
                <Icon
                  className={`h-[22px] w-[22px] transition-transform duration-200 ${
                    isActive ? "scale-110" : ""
                  }`}
                  strokeWidth={isActive ? 2 : 1.6}
                />
                {isActive && (
                  <div className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />
                )}
              </div>
              <span className={`text-[10px] tracking-[0.02em] transition-all ${isActive ? "font-semibold" : "font-medium"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
