import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRoute, useLocation } from 'wouter';
import { useStampPackages, useStamps, usePageWithStamps, useFirstStampUrls, placeStamp, MAX_STAMPS_PER_PAGE } from '@/lib/hooks';
import { useHeaderClose } from '@/components/layout/AppLayout';

/**
 * Full-screen stamp selection view.
 *
 * Layout: a non-scrolling top area (title + optional limit warning + horizontal
 * scrolling package-tab bar) above a separately scrollable stamp grid. This
 * avoids the accordion's hidden-state confusion while keeping the number of
 * visible stamps manageable at one package at a time.
 */
export function StampPicker() {
  const [, params] = useRoute('/booklet/:bookletId/page/:pageId/stamps');
  const [, setLocation] = useLocation();

  const bookletId = params?.bookletId;
  const pageId = params?.pageId;

  const page = usePageWithStamps(pageId);
  const stampPackages = useStampPackages();

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-select the first package once packages load (or whenever the
  // selection becomes stale because a package was deleted).
  useEffect(() => {
    if (!stampPackages || stampPackages.length === 0) return;
    const still = selectedPkgId && stampPackages.some(p => p.id === selectedPkgId);
    if (!still) setSelectedPkgId(stampPackages[0].id);
  }, [stampPackages, selectedPkgId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const packageIds = stampPackages?.map(p => p.id) ?? [];
  const firstStampUrls = useFirstStampUrls(packageIds);

  const stampsInSelected = useStamps(selectedPkgId || undefined);
  const stampLimitReached = (page?.stamps.length ?? 0) >= MAX_STAMPS_PER_PAGE;

  const selectedPkg = stampPackages?.find(p => p.id === selectedPkgId);

  const returnToEditor = () => setLocation(`/booklet/${bookletId}/page/${pageId}`);
  useHeaderClose(returnToEditor);

  const handleStampTap = async (stampId: string) => {
    if (!pageId || stampLimitReached) return;
    await placeStamp(pageId, stampId, 0.5, 0.5);
    returnToEditor();
  };

  const handleSelectPack = (pkgId: string) => {
    setSelectedPkgId(pkgId);
    setDropdownOpen(false);
  };

  if (!bookletId || !pageId) return null;

  return (
    <div className="flex flex-col fixed inset-x-0 top-16 bottom-0 z-40 w-full bg-background animate-in fade-in duration-200">

      {/* ── Non-scrolling header ─────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-0 bg-background border-b-2 border-border">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-3">Choose a Stamp</h1>

        {stampLimitReached && (
          <div className="text-sm font-bold text-destructive text-center border-2 border-destructive/20 bg-destructive/10 rounded-xl p-3 mb-3">
            Max {MAX_STAMPS_PER_PAGE} stamps per page reached. Remove one to add another.
          </div>
        )}

        {/* Custom pack dropdown with thumbnails */}
        {stampPackages && stampPackages.length > 0 && (
          <div className="relative mb-3" ref={dropdownRef}>
            {/* Trigger button */}
            <button
              type="button"
              onClick={() => setDropdownOpen(o => !o)}
              className="w-full flex items-center gap-2.5 rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none hover:border-primary/60 transition-colors"
            >
              {/* Selected pack thumbnail */}
              <span className="shrink-0 w-8 h-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
                {selectedPkg && firstStampUrls?.[selectedPkg.id] ? (
                  <img
                    src={firstStampUrls[selectedPkg.id]}
                    alt=""
                    className="w-full h-full object-contain p-0.5"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">?</span>
                )}
              </span>
              <span className="flex-1 text-left truncate">{selectedPkg?.name ?? 'Select a pack'}</span>
              <ChevronDown className={`shrink-0 w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown list */}
            {dropdownOpen && (
              <ul className="absolute z-50 mt-1 w-full rounded-xl border-2 border-border bg-background shadow-lg overflow-hidden">
                {stampPackages.map((pkg) => (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPack(pkg.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-bold text-left hover:bg-muted transition-colors ${pkg.id === selectedPkgId ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                    >
                      {/* Pack thumbnail */}
                      <span className="shrink-0 w-8 h-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
                        {firstStampUrls?.[pkg.id] ? (
                          <img
                            src={firstStampUrls[pkg.id]}
                            alt=""
                            className="w-full h-full object-contain p-0.5"
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs leading-none">?</span>
                        )}
                      </span>
                      <span className="flex-1 truncate">{pkg.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Pack context header ───────────────────────────────────────────── */}
      {selectedPkg && (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-muted/40 border-b border-border">
          <span className="shrink-0 w-8 h-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
            {firstStampUrls?.[selectedPkg.id] ? (
              <img
                src={firstStampUrls[selectedPkg.id]}
                alt=""
                className="w-full h-full object-contain p-0.5"
              />
            ) : (
              <span className="text-muted-foreground text-xs">?</span>
            )}
          </span>
          <span className="text-sm font-bold text-foreground truncate">{selectedPkg.name}</span>
        </div>
      )}

      {/* ── Scrollable stamp grid ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-safe">
        {(!stampPackages || stampPackages.length === 0) ? (
          <div className="flex-1 flex items-center justify-center text-center text-muted-foreground font-bold py-12">
            No stamp packs yet. Add one from the Stamp Library.
          </div>
        ) : stampsInSelected && stampsInSelected.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground font-bold">
            This pack is empty.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {stampsInSelected?.map((stamp) => (
              <button
                key={stamp.id}
                disabled={stampLimitReached}
                className="aspect-square bg-white border-2 border-border rounded-xl p-2 hover:border-primary hover:-translate-y-1 transition-all flex items-center justify-center disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:border-border disabled:cursor-not-allowed"
                onClick={() => handleStampTap(stamp.id)}
              >
                <img
                  src={stamp.pngDataUrl}
                  alt={stamp.name}
                  className="max-w-full max-h-full object-contain drop-shadow-sm"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
