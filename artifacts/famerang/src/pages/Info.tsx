import { Github, BookHeart, Shield, Cpu } from 'lucide-react';

const GITHUB_URL = 'https://github.com/davesides3/famerang';

export function Info() {
  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Logo + tagline */}
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <BookHeart className="w-14 h-14 text-primary" strokeWidth={1.5} />
        <h1 className="font-serif text-3xl font-bold text-foreground">Famerang</h1>
        <p className="text-lg font-medium text-foreground leading-snug max-w-xs">
          Turn Apple &amp; Google photos&nbsp;+&nbsp;stamps into printable booklets
          kids hold &amp; grandparents cherish.
        </p>
      </div>

      {/* Pillars */}
      <div className="flex flex-col gap-2">
        {[
          { icon: <Shield className="w-5 h-5 shrink-0 text-primary" />, text: 'Photos stay on-device — nothing leaves your phone.' },
          { icon: <Cpu className="w-5 h-5 shrink-0 text-primary" />, text: 'No login. No app store. Works offline once installed.' },
          { icon: <BookHeart className="w-5 h-5 shrink-0 text-primary" />, text: 'No screen time — it ends with something you can hold.' },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-start gap-3 bg-card border border-border rounded-xl px-4 py-3">
            {icon}
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

      {/* License */}
      <p className="text-center text-xs text-muted-foreground">
        Released under the{' '}
        <a
          href={`${GITHUB_URL}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          MIT License
        </a>
      </p>
    </div>
  );
}
