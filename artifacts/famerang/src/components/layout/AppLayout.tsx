import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BookOpen, Info, Sticker, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import famerangLogo from '@/assets/famerang-logo.png';
import { LandscapeGuard } from '@/components/layout/LandscapeGuard';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

interface HeaderOverride {
  label: string;
  onClick: () => void;
  extra?: React.ReactNode;
}

interface HeaderOverrideApi {
  setOverride: (override: HeaderOverride | null) => void;
  setNavHidden: (hidden: boolean) => void;
}

const HeaderOverrideContext = createContext<HeaderOverrideApi | null>(null);

/**
 * Lets a page temporarily replace the shared header's right-side nav button
 * (normally "Stickers" on Home / "Booklets" elsewhere) with a "Close" action,
 * so overlay-style views (Export, full-screen Preview) get one consistent
 * header instead of a bespoke local one. Pass `null` when there is nothing
 * to close, e.g. before the overlay is open.
 *
 * `extra` renders additional content immediately to the left of the Close
 * button (e.g. page-navigation arrows in the Page Editor). It is read fresh
 * on every render, unlike `onClose` -- so it always reflects current state
 * (like disabled-arrow conditions) without needing its own effect deps.
 */
export function useHeaderClose(onClose: (() => void) | null, extra?: React.ReactNode) {
  const ctx = useContext(HeaderOverrideContext);
  // Keep the latest callback/extra in refs so the effect below only needs to
  // depend on whether an override is active (a stable boolean), not on the
  // callback's identity -- an inline arrow function recreated every render
  // would otherwise retrigger the effect (and setOverride) on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const isOpen = onClose !== null;

  useEffect(() => {
    if (!ctx) return;
    if (!isOpen) {
      ctx.setOverride(null);
      return;
    }
    ctx.setOverride({ label: 'Close', onClick: () => onCloseRef.current?.(), extra: extraRef.current });
    return () => ctx.setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, isOpen]);

  // Keep the rendered extra content in sync on every render (e.g. arrow
  // disabled state changing as the user navigates pages), without
  // retriggering the open/close effect above.
  useEffect(() => {
    if (!ctx || !isOpen) return;
    ctx.setOverride({ label: 'Close', onClick: () => onCloseRef.current?.(), extra });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra]);
}

/**
 * Lets a page temporarily hide the shared header's right-side nav button
 * entirely (no Close action, just nothing) -- used by the "New Booklet"
 * inline form on Home, which intentionally has no header affordance of its
 * own (Cancel/Create live in the form itself).
 */
export function useHeaderNavHidden(hidden: boolean) {
  const ctx = useContext(HeaderOverrideContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setNavHidden(hidden);
    return () => ctx.setNavHidden(false);
  }, [ctx, hidden]);
}

const navButtonClasses =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [override, setOverride] = useState<HeaderOverride | null>(null);
  const [navHidden, setNavHidden] = useState(false);
  const ctxValue = useMemo(() => ({ setOverride, setNavHidden }), []);

  const rightContent = navHidden ? null : override ? (
    <>
      {override.extra}
      <button type="button" onClick={override.onClick} className={navButtonClasses} data-testid="header-close">
        <X className="w-5 h-5" />
        {override.label}
      </button>
    </>
  ) : location === '/' ? (
    <Link href="/stickers" className={cn(navButtonClasses, location.startsWith('/stickers') && 'bg-muted text-foreground')} data-testid="header-stickers">
      <Sticker className="w-5 h-5" />
      Stickers
    </Link>
  ) : (
    <Link href="/" className={navButtonClasses} data-testid="header-booklets">
      <BookOpen className="w-5 h-5" />
      Booklets
    </Link>
  );

  return (
    <HeaderOverrideContext.Provider value={ctxValue}>
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 pb-8">
        <header className="sticky top-0 z-30 h-16 bg-card border-b-2 border-border px-4 flex items-center justify-between shadow-sm">
          <Link href="/" className="flex items-center gap-2 font-serif text-2xl font-bold text-primary">
            <img src={famerangLogo} alt="" className="h-9 w-9 object-contain shrink-0" />
            Famerang
          </Link>
          <nav className="flex items-center gap-1">
            {rightContent}
            <ThemeToggle />
            <Link
              href="/info"
              className={cn('flex items-center p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground', location === '/info' && 'bg-muted text-foreground')}
              aria-label="About Famerang"
              data-testid="header-info"
            >
              <Info className="w-5 h-5" />
            </Link>
          </nav>
        </header>
        <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-6 flex flex-col gap-6">
          {children}
        </main>
      </div>
      <LandscapeGuard />
    </HeaderOverrideContext.Provider>
  );
}
