import React from 'react';
import { Link, useLocation } from 'wouter';
import { Library, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 pb-8">
      <header className="sticky top-0 z-30 bg-card border-b-2 border-border px-4 py-3 flex items-center justify-between shadow-sm">
        <Link href="/" className="font-serif text-2xl font-bold text-primary flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12Z" fill="currentColor" fillOpacity="0.2"/>
            <path d="M7 15L12 9L17 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Famerang
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/stamps" className={cn("p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground", location.startsWith('/stamps') && "bg-muted text-foreground")}>
            <Library className="w-6 h-6" />
          </Link>
          <Link href="/backup" className={cn("p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground", location.startsWith('/backup') && "bg-muted text-foreground")}>
            <ArchiveRestore className="w-6 h-6" />
          </Link>
        </nav>
      </header>
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-6 flex flex-col gap-6">
        {children}
      </main>
    </div>
  );
}