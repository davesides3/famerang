import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useStampPackages, useStamps, usePageWithStamps, placeStamp, MAX_STAMPS_PER_PAGE } from '@/lib/hooks';
import { useHeaderClose } from '@/components/layout/AppLayout';
import { StampPackageRow } from '@/components/stamps/StampPackageRow';

/**
 * Full-screen stamp selection view, replacing the old bottom-drawer overlay
 * that sat over a blurred photo+text editor. Uses the whole screen for
 * browsing stamp packages (as a vertical list, same as the Stamp Library)
 * and returns to the page editor once a stamp is placed.
 */
export function StampPicker() {
  const [, params] = useRoute('/booklet/:bookletId/page/:pageId/stamps');
  const [, setLocation] = useLocation();

  const bookletId = params?.bookletId;
  const pageId = params?.pageId;

  const page = usePageWithStamps(pageId);
  const stampPackages = useStampPackages();

  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  useEffect(() => {
    if (!expandedPkgId && stampPackages && stampPackages.length > 0) {
      setExpandedPkgId(stampPackages[0].id);
    }
  }, [stampPackages, expandedPkgId]);

  const stampsInExpanded = useStamps(expandedPkgId || undefined);
  const stampLimitReached = (page?.stamps.length ?? 0) >= MAX_STAMPS_PER_PAGE;

  const returnToEditor = () => setLocation(`/booklet/${bookletId}/page/${pageId}`);

  // Shares the app's top header (Famerang + Close) like the page editor
  // itself, so this full-screen view gets a consistent close affordance.
  useHeaderClose(returnToEditor);

  const handleStampTap = async (stampId: string) => {
    if (!pageId || stampLimitReached) return;
    await placeStamp(pageId, stampId, 0.5, 0.5);
    returnToEditor();
  };

  if (!bookletId || !pageId) return null;

  return (
    <div className="flex flex-col fixed inset-x-0 top-16 bottom-0 z-40 w-full bg-background animate-in fade-in duration-200">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-safe">
        <h1 className="text-2xl font-serif font-bold text-foreground">Choose a Stamp</h1>

        {stampLimitReached && (
          <div className="text-sm font-bold text-destructive text-center border-2 border-destructive/20 bg-destructive/10 rounded-xl p-3">
            Max {MAX_STAMPS_PER_PAGE} stamps per page reached. Remove one to add another.
          </div>
        )}

        {(!stampPackages || stampPackages.length === 0) ? (
          <div className="flex-1 flex items-center justify-center text-center text-muted-foreground font-bold py-12">
            No stamp packs yet. Add one from the Stamp Library.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stampPackages.map((pkg) => {
              const isExpanded = expandedPkgId === pkg.id;
              return (
                <div key={pkg.id} className="flex flex-col gap-3">
                  <StampPackageRow
                    pkg={pkg}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedPkgId(isExpanded ? null : pkg.id)}
                  />

                  {isExpanded && (
                    <div className="grid grid-cols-4 gap-3 px-1">
                      {stampsInExpanded?.map((stamp) => (
                        <button
                          key={stamp.id}
                          disabled={stampLimitReached}
                          className="aspect-square bg-white border-2 border-border rounded-xl p-2 hover:border-primary hover:-translate-y-1 transition-all flex items-center justify-center disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:border-border disabled:cursor-not-allowed"
                          onClick={() => handleStampTap(stamp.id)}
                        >
                          <img src={stamp.pngDataUrl} alt={stamp.name} className="max-w-full max-h-full object-contain drop-shadow-sm" />
                        </button>
                      ))}
                      {stampsInExpanded?.length === 0 && (
                        <div className="col-span-4 text-center py-8 text-muted-foreground font-bold">This pack is empty.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
