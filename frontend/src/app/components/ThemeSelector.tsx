import { Check } from 'lucide-react';
import { themes, useTheme } from '../contexts/ThemeContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

interface ThemeSelectorProps {
  open: boolean;
  onClose: () => void;
}

export default function ThemeSelector({ open, onClose }: ThemeSelectorProps) {
  const { currentTheme, setTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm rounded-[20px] p-5">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold text-center">背景主题</DialogTitle>
          <DialogDescription className="text-[13px] text-gray-500 text-center">选择适合您的背景色</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                setTheme(theme.id);
                onClose();
              }}
              className="relative group"
            >
              <div
                className={`h-20 rounded-[14px] transition-all duration-200 border-2 ${
                  currentTheme.id === theme.id ? 'border-blue-500 shadow-md' : 'border-gray-200/60 hover:border-gray-300'
                }`}
                style={{ background: theme.background }}
              >
                {/* 模拟卡片效果 */}
                <div className="absolute inset-2 top-3">
                  <div className={`h-3 w-10 rounded-[3px] mb-1.5 ${theme.isDark ? 'bg-white/20' : 'bg-white/80'}`} />
                  <div className={`h-2 w-14 rounded-[2px] ${theme.isDark ? 'bg-white/10' : 'bg-white/60'}`} />
                </div>
                {currentTheme.id === theme.id && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <p className={`mt-1.5 text-[12px] font-medium text-center ${
                currentTheme.id === theme.id ? 'text-blue-500' : 'text-gray-600'
              }`}>
                {theme.name}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}