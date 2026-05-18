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
    background: '#F2F2F7',
    isDark: false,
  },
  {
    id: 'warm',
    name: '暖光色',
    background: '#FFF8F0',
    isDark: false,
  },
  {
    id: 'cool',
    name: '清冷蓝',
    background: '#EEF2FF',
    isDark: false,
  },
  {
    id: 'green',
    name: '护眼绿',
    background: '#ECFDF5',
    isDark: false,
  },
  {
    id: 'lavender',
    name: '薰衣草',
    background: '#F5F3FF',
    isDark: false,
  },
  {
    id: 'dark',
    name: '深色模式',
    background: '#1C1C1E',
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