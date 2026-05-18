import { Link, useLocation } from "react-router";
import { Camera, Hand, Volume2, MessageCircle, User } from "lucide-react";

const navItems = [
  { path: "/sign-language", icon: Hand, label: "手语" },
  { path: "/home", icon: Camera, label: "识别" },
  { path: "/sound", icon: Volume2, label: "声音" },
  { path: "/community", icon: MessageCircle, label: "社区" },
  { path: "/profile", icon: User, label: "我的" },
];

export default function BottomNav() {
  const location = useLocation();

  const handleTap = () => {
    if (navigator.vibrate) navigator.vibrate(5);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-black/[0.04] z-50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}>
      <div className="max-w-lg mx-auto flex justify-around items-center px-1 pt-1.5 pb-0.5">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleTap}
              className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive ? "text-blue-500" : "text-gray-400"
              }`}
            >
              <div className={`relative p-1 ${isActive ? "" : ""}`}>
                <Icon className={`w-[22px] h-[22px] transition-transform duration-200 ${isActive ? "scale-110" : ""}`} strokeWidth={isActive ? 2 : 1.5} />
                {isActive && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />
                )}
              </div>
              <span className={`text-[10px] mt-0.5 transition-all ${isActive ? "font-semibold" : "font-medium"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
