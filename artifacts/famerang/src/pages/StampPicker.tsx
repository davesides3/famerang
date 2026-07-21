import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useStampPackages, useStamps, usePageWithStamps, placeStamp, MAX_STAMPS_PER_PAGE } from '@/lib/hooks';
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

  // Auto-select the first package once packages load (or whenever the
  // selection becomes stale because a package was deleted).
  useEffect(() => {
    if (!stampPackages || stampPackages.length === 0) return;
    const still = selectedPkgId && stampPackages.some(p => p.id === selectedPkgId);
    if (!still) setSelectedPkgId(stampPackages[0].id);
  }, [stampPackages, selectedPkgId]);

  const stampsInSelected = useStamps(selectedPkgId || undefined);
  const stampLimitReached = (page?.stamps.length ?? 0) >= MAX_STAMPS_PER_PAGE;

  const returnToEditor = () => setLocation(`/booklet/${bookletId}/page/${pageId}`);
  useHeaderClose(returnToEditor);

  const handleStampTap = async (stampId: string) => {
    if (!pageId || stampLimitReached) return;
    await placeStamp(pageId, stampId, 0.5, 0.5);
    returnToEditor();
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

        {/* Package tab bar — scrolls horizontally if there are many packages */}
        {stampPackages && stampPackages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4">
            {stampPackages.map((pkg) => {
              const isSelected = selectedPkgId === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPkgId(pkg.id)}
                  className={[
                    'shrink-0 px-4 py-1.5 rounded-full text-sm font-bold border-2 transition-colors whitespace-nowrap',
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-background border-border text-foreground hover:border-primary/50',
                  ].join(' ')}
                >
                  {pkg.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
