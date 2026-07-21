import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

const navButtonClasses =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground';

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(navButtonClasses)}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="theme-toggle"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
