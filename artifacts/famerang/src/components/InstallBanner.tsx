import { Share, Download } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import famerangLogo from '@/assets/famerang-logo.png';

export function InstallBanner() {
  const { shouldShow, isIos, triggerInstall, dismiss } = usePwaInstall();

  if (!shouldShow) return null;

  return (
    <div className="flex items-center gap-3 bg-card border-2 border-border rounded-xl px-4 py-3">
      <img src={famerangLogo} alt="" className="h-10 w-10 object-contain shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">Add to Home Screen</p>
        {isIos ? (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            Tap <Share className="w-3 h-3 inline-block align-[-1px] mx-0.5" /> then
            &ldquo;Add to Home Screen&rdquo; for offline access.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            Install for instant offline access — no app store needed.
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {!isIos && (
          <button
            type="button"
            onClick={() => triggerInstall()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
