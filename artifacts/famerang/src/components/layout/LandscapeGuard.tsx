import React from 'react';
import { Smartphone } from 'lucide-react';
import famerangLogo from '@/assets/famerang-logo.png';

/**
 * Full-screen overlay shown when a touch device is rotated to landscape.
 * See the `.landscape-guard` CSS rule in index.css for how/when it becomes
 * visible -- this component always renders, but is `display: none` outside
 * the landscape+touch media query.
 */
export function LandscapeGuard() {
  return (
    <div
      className="landscape-guard fixed inset-0 z-50 bg-background flex-col items-center justify-center text-center px-8 gap-4"
      data-testid="landscape-guard"
    >
      <img src={famerangLogo} alt="" className="w-16 h-16 object-contain" />
      <Smartphone className="w-10 h-10 text-primary rotate-90" />
      <p className="text-lg font-bold text-foreground max-w-xs">
        Famerang is designed to work best in portrait mode.
      </p>
      <p className="text-sm text-muted-foreground max-w-xs">Please rotate your device back to continue.</p>
    </div>
  );
}
