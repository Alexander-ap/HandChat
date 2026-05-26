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
      className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--md-sys-color-surface-container)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div className="mx-auto max-w-lg h-[64px] px-2 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleTap}
              className="flex min-w-[64px] flex-col items-center justify-center gap-1 py-1 transition-all duration-200 active:scale-95 tap-highlight-transparent"
            >
              <div 
                className={`relative px-4 py-1 rounded-full transition-colors duration-200 flex items-center justify-center ${
                  isActive ? "bg-[var(--md-sys-color-secondary-container)]" : "bg-transparent"
                }`}
              >
                <Icon
                  className={`h-6 w-6 transition-colors duration-200 ${
                    isActive ? "text-[var(--md-sys-color-on-secondary-container)] fill-[var(--md-sys-color-on-secondary-container)]" : "text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                  strokeWidth={isActive ? 2 : 1.5}
                />
              </div>
              <span 
                className={`text-[12px] tracking-[0.02em] transition-colors duration-200 ${
                  isActive 
                    ? "font-semibold text-[var(--md-sys-color-on-surface)]" 
                    : "font-medium text-[var(--md-sys-color-on-surface-variant)]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
