import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface Theme {
  id: string;
  name: string;
  background: string;
  isDark: boolean;
}

export const themes: Theme[] = [
  {
    id: 'light',
    name: '经典白',
    background: 'linear-gradient(180deg, #f8fbff 0%, #eef3ff 42%, #f5f7fb 100%)',
    isDark: false,
  },
  {
    id: 'warm',
    name: '暖光色',
    background: 'linear-gradient(180deg, #fffaf2 0%, #fff4e6 45%, #f8f0ea 100%)',
    isDark: false,
  },
  {
    id: 'cool',
    name: '清冷蓝',
    background: 'linear-gradient(180deg, #f3f7ff 0%, #e9efff 44%, #eef2ff 100%)',
    isDark: false,
  },
  {
    id: 'green',
    name: '护眼绿',
    background: 'linear-gradient(180deg, #f2fff8 0%, #e8fbf1 42%, #eefaf5 100%)',
    isDark: false,
  },
  {
    id: 'lavender',
    name: '薰衣草',
    background: 'linear-gradient(180deg, #faf7ff 0%, #f1efff 45%, #f6f3ff 100%)',
    isDark: false,
  },
  {
    id: 'dark',
    name: '深色模式',
    background: 'linear-gradient(180deg, #151a24 0%, #101522 46%, #0b1020 100%)',
    isDark: true,
  },
];

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const savedThemeId = localStorage.getItem('appTheme');
    // 默认使用白色主题
    return themes.find(t => t.id === savedThemeId) || themes.find(t => t.id === 'light') || themes[0];
  });

  const setTheme = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
      localStorage.setItem('appTheme', themeId);
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--app-background', currentTheme.background);
  }, [currentTheme]);

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
