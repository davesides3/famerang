import { useEffect, useState } from 'react';

const STORAGE_KEY = 'famerang-theme';

function getInitialDark(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => getInitialDark());

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = () => setIsDark(prev => !prev);

  return { isDark, toggle };
}
