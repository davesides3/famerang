import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'famerang-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** True if the app is already running as an installed PWA (home-screen launch). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** True if the device is iOS/iPadOS — no beforeinstallprompt on either.
 *
 * Two cases:
 *  1. iPhone/iPod (and older iPads): UA contains "iPad|iPhone|iPod".
 *  2. Modern iPadOS in desktop mode: UA says "Macintosh" but the device
 *     still has touch points and no hover, caught by platform + maxTouchPoints.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Classic iOS UA
  if (/iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)) return true;
  // iPadOS desktop-mode UA (reports Macintosh, but has touch)
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

export interface PwaInstallState {
  /** Whether the banner should be shown at all. */
  shouldShow: boolean;
  /** True on iOS — show manual share-sheet instructions instead of a button. */
  isIos: boolean;
  /** Android only: trigger the native install prompt. Returns true if accepted. */
  triggerInstall: () => Promise<boolean>;
  /** Persist the dismissal so the banner never reappears. */
  dismiss: () => void;
}

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [standalone] = useState(isStandalone);
  const [ios] = useState(isIos);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      dismiss();
    }
    return outcome === 'accepted';
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch { /* ignore */ }
    setDismissed(true);
  };

  // Show when:
  //   • not already standalone (installed)
  //   • user hasn't dismissed before
  //   • AND either: iOS (always show instructions) OR Android with a captured prompt
  const shouldShow = !standalone && !dismissed && (ios || deferredPrompt !== null);

  return { shouldShow, isIos: ios, triggerInstall, dismiss };
}
