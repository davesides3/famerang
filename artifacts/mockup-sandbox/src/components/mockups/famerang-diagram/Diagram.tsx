export function Diagram() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-8 font-['Inter']">
      <div className="w-full max-w-[1260px]">

        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <img src="/__mockup/images/famerang-logo.png" alt="Famerang" className="w-10 h-10 object-contain" />
          <span className="text-3xl font-black tracking-tight text-stone-800">How Famerang Works</span>
        </div>

        {/* Three-column flow */}
        <div className="grid grid-cols-[1fr_56px_1fr_56px_1fr] items-center gap-0">

          {/* ── Column 1: Sources ─────────────────────── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1 text-center">Your photos</p>

            <SourceCard
              logo={<ApplePhotosLogo />}
              name="Apple Photos"
              desc="Pick directly from your iOS library"
            />
            <SourceCard
              logo={<GooglePhotosLogo />}
              name="Google Photos"
              desc="Pick directly from your Android library"
            />
            <SourceCard
              logo={<CameraLogo />}
              name="Camera & Files"
              desc="Any image on your device"
            />
          </div>

          {/* Arrow 1 */}
          <Arrow />

          {/* ── Column 2: Famerang ───────────────────── */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1">Famerang App</p>
            <div className="relative flex flex-col items-center bg-amber-50 border-2 border-amber-200 rounded-2xl px-8 py-6 shadow-md w-full">
              <img src="/__mockup/images/famerang-logo.png" alt="Famerang" className="w-14 h-14 mb-3" />

              {/* Mini booklet illustration */}
              <div className="flex gap-2 mb-4">
                {[0,1,2].map(i => (
                  <div key={i} className="w-12 h-16 rounded-md bg-white border border-amber-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex-1 bg-amber-100/60" />
                    <div className="h-3 bg-amber-200/50 mx-1 mb-1 rounded-sm" />
                  </div>
                ))}
              </div>

              <p className="text-sm font-bold text-stone-700 text-center leading-snug">
                Build photo booklets
              </p>
              <p className="text-xs text-stone-500 text-center mt-1 leading-snug">
                Arrange pages, add captions &amp; stamps
              </p>

              {/* Privacy badge */}
              <div className="mt-4 flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                <LockIcon />
                <span className="text-[11px] font-semibold text-green-700">Stays on your device</span>
              </div>
            </div>
          </div>

          {/* Arrow 2 */}
          <Arrow />

          {/* ── Column 3: Outputs ────────────────────── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1 text-center">You decide what to share</p>

            <OutputCard
              icon={<PdfIcon />}
              name="Draft PDF"
              desc="Preview your booklet before printing"
              color="bg-red-50 border-red-200"
              iconBg="bg-red-100"
            />
            <OutputCard
              icon={<ShareIcon />}
              name="Share via Device"
              desc="AirDrop, Messages, email — your choice"
              color="bg-blue-50 border-blue-200"
              iconBg="bg-blue-100"
            />
            <OutputCard
              icon={<BackupIcon />}
              name="Backup & Restore"
              desc="Export a ZIP you keep and control"
              color="bg-violet-50 border-violet-200"
              iconBg="bg-violet-100"
            />
          </div>
        </div>

        {/* Footer privacy note */}
        <div className="mt-10 flex items-center justify-center gap-2">
          <LockIcon className="text-stone-400" />
          <p className="text-sm text-stone-400 text-center">
            Photos are processed and stored locally. Nothing is uploaded to any server unless <em>you</em> choose to share it.
          </p>
        </div>

      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function SourceCard({ logo, name, desc }: { logo: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 bg-white border-2 border-stone-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="shrink-0 w-10 h-10 flex items-center justify-center">
        {logo}
      </div>
      <div>
        <p className="text-sm font-bold text-stone-800 leading-tight">{name}</p>
        <p className="text-xs text-stone-500 leading-tight mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function OutputCard({ icon, name, desc, color, iconBg }: {
  icon: React.ReactNode; name: string; desc: string; color: string; iconBg: string;
}) {
  return (
    <div className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3 shadow-sm ${color}`}>
      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-stone-800 leading-tight">{name}</p>
        <p className="text-xs text-stone-500 leading-tight mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center">
      <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
        <path d="M0 12 H32 M24 4 L40 12 L24 20" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function LockIcon({ className = "text-green-600" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function BackupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 15 21 21 3 21 3 15" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CameraLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="8" fill="#1C1C1E" />
      <rect x="6" y="11" width="24" height="17" rx="3" fill="#3A3A3C" />
      <circle cx="18" cy="19.5" r="5.5" fill="#636366" />
      <circle cx="18" cy="19.5" r="3.5" fill="#8E8E93" />
      <rect x="14" y="9" width="8" height="3" rx="1.5" fill="#3A3A3C" />
      <circle cx="24" cy="14" r="1" fill="#AEAEB2" />
    </svg>
  );
}

/* Apple Photos logo — multicolour radial petal flower */
function ApplePhotosLogo() {
  const petals = [
    { color: "#FF3B30", rotate: 0 },
    { color: "#FF9500", rotate: 45 },
    { color: "#FFCC00", rotate: 90 },
    { color: "#34C759", rotate: 135 },
    { color: "#30B0C7", rotate: 180 },
    { color: "#007AFF", rotate: 225 },
    { color: "#5856D6", rotate: 270 },
    { color: "#FF2D55", rotate: 315 },
  ];
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      {petals.map((p, i) => (
        <ellipse
          key={i}
          cx="18" cy="11"
          rx="5" ry="8"
          fill={p.color}
          opacity="0.92"
          transform={`rotate(${p.rotate} 18 18)`}
        />
      ))}
      <circle cx="18" cy="18" r="5" fill="white" />
    </svg>
  );
}

/* Google Photos logo — 4-petal pinwheel */
function GooglePhotosLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      {/* Red — top-left */}
      <path d="M18 18 Q18 6 9 6 Q6 6 6 9 Q6 18 18 18Z" fill="#EA4335" />
      {/* Yellow — top-right */}
      <path d="M18 18 Q30 18 30 9 Q30 6 27 6 Q18 6 18 18Z" fill="#FBBC04" />
      {/* Blue — bottom-right */}
      <path d="M18 18 Q18 30 27 30 Q30 30 30 27 Q30 18 18 18Z" fill="#4285F4" />
      {/* Green — bottom-left */}
      <path d="M18 18 Q6 18 6 27 Q6 30 9 30 Q18 30 18 18Z" fill="#34A853" />
    </svg>
  );
}
