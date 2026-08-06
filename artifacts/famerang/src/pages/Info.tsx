import { useLocation } from 'wouter';
import { Github } from 'lucide-react';
import { useHeaderClose } from '@/components/layout/AppLayout';
import famerangLogo from '@/assets/famerang-logo.png';

const GITHUB_URL = 'https://github.com/davesides3/famerang';

export function Info() {
  const [, navigate] = useLocation();
  useHeaderClose(() => navigate('~-1'));

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Logo + tagline */}
      <div className="flex flex-col items-center text-center gap-2 pt-1">
        <img src={famerangLogo} alt="Famerang" className="h-16 w-16 object-contain" />
        <h1 className="font-serif text-3xl font-bold text-foreground">Famerang</h1>
        <p className="text-lg font-medium text-foreground leading-snug max-w-xs">
          Turn Apple &amp; Google photos&nbsp;+&nbsp;stamps into printable booklets
          kids hold &amp; grandparents cherish.
        </p>
      </div>

      {/* Pillars */}
      <div className="flex flex-col gap-2">
        {[
          'Photos stay on-device — nothing leaves your phone.',
          'No login. No app store. Works offline once installed.',
          'No screen time — it ends with something you can hold.',
        ].map((text) => (
          <div key={text} className="bg-card border border-border rounded-xl px-4 py-3">
            <span className="text-sm text-muted-foreground leading-snug">{text}</span>
          </div>
        ))}
      </div>

      {/* Free */}
      <p className="text-center text-sm text-muted-foreground font-medium">
        Famerang is&nbsp;<span className="text-foreground font-bold">free</span>&nbsp;and open source.
      </p>

      {/* GitHub link */}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2.5 bg-card border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground hover:bg-muted transition-colors"
      >
        <Github className="w-5 h-5" />
        View source on GitHub
      </a>
    </div>
  );
}
