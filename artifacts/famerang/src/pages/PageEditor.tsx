import React, { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { ImagePlus, Type, ArrowUpFromLine, ArrowDownToLine, Sticker, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBooklet, usePages, usePageWithStamps, setPagePhoto, updatePageText, removePageStamp, MAX_STAMPS_PER_PAGE } from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';
import { LiveCanvas } from '@/components/LiveCanvas';
import { useHeaderClose } from '@/components/layout/AppLayout';
import famerangLogo from '@/assets/famerang-logo.png';

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function PageEditor() {
  const [, params] = useRoute('/booklet/:bookletId/page/:pageId');
  const [, setLocation] = useLocation();
  
  const bookletId = params?.bookletId;
  const pageId = params?.pageId;

  const booklet = useBooklet(bookletId);
  const pages = usePages(bookletId);
  const page = usePageWithStamps(pageId);

  const currentIndex = pages?.findIndex((p) => p.id === pageId) ?? -1;
  const prevPage = currentIndex > 0 ? pages?.[currentIndex - 1] : undefined;
  const nextPage = pages && currentIndex >= 0 && currentIndex < pages.length - 1 ? pages[currentIndex + 1] : undefined;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save text
  const [textContent, setTextContent] = useState(page?.textContent || '');
  useEffect(() => { if (page) setTextContent(page.textContent); }, [page?.textContent]);
  
  const handleTextBlur = () => {
    if (!pageId || !page) return;
    if (textContent !== page.textContent) {
      updatePageText(pageId, textContent, page.textPlacement);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pageId || !booklet) return;
    await setPagePhoto(pageId, file, booklet.canvasSize);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stampLimitReached = (page?.stamps.length ?? 0) >= MAX_STAMPS_PER_PAGE;

  // If the page is already at the limit, there's nothing to place -- show
  // the limit message right here (where stamps can actually be removed)
  // instead of sending the user to the full-screen picker with no way out.
  const openStampPicker = () => {
    if (stampLimitReached) return;
    setLocation(`/booklet/${bookletId}/page/${pageId}/stamps`);
  };

  const handleCanvasTap = (xRatio: number, yRatio: number) => {
    // We could use this to place a selected stamp, or just ignore for now.
    // The spec said "tapping a stamp... place it at sensible default (center)... user drag it".
  };

  const togglePlacement = () => {
    if (!pageId || !page) return;
    updatePageText(pageId, textContent, page.textPlacement === 'above' ? 'below' : 'above');
  };

  // This is a full-screen overlay-style view, so it shares the app's
  // top header (Famerang + Close) instead of its own bespoke bar --
  // consistent with the Export and Preview views. Page-navigation arrows
  // ride along next to Close since there's no other room on this screen.
  useHeaderClose(
    () => setLocation(`/booklet/${bookletId}`),
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => prevPage && setLocation(`/booklet/${bookletId}/page/${prevPage.id}`)}
        disabled={!prevPage}
        aria-label="Previous page"
        data-testid="header-prev-page"
        className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => nextPage && setLocation(`/booklet/${bookletId}/page/${nextPage.id}`)}
        disabled={!nextPage}
        aria-label="Next page"
        data-testid="header-next-page"
        className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>,
  );

  if (!booklet || !page) return null;

  return (
    <div className="flex flex-col fixed inset-x-0 top-16 bottom-0 z-40 w-full bg-background animate-in fade-in duration-200">
      {/* Main workspace */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
        
        {/* Canvas Area */}
        <div className="flex-1 relative flex items-center justify-center p-4">
          {/* bg-white is intentional: the canvas is a print-fidelity preview and must
              always render on white so exported colours match what users see here.
              The ring uses a theme-aware colour so the frame looks tidy in dark mode. */}
          <div className="relative shadow-xl w-full max-w-[400px] aspect-square bg-white ring-2 ring-border/40">
            <LiveCanvas 
              page={page} 
              booklet={booklet} 
              renderSize={800} // High-res internal canvas scaled down by CSS
              className="w-full h-full cursor-pointer touch-none"
              onBgTap={handleCanvasTap}
            />
            {/* Overlay hint if empty */}
            {!page.photoDataUrl && (
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-black/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <img src={famerangLogo} alt="" className="w-[72px] h-[72px] object-contain opacity-50 mb-2" />
                <span className="font-bold text-muted-foreground">Tap to add photo</span>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-card border-t-2 border-border p-4 flex flex-col gap-4 shrink-0 pb-safe">
          
          <div className="flex gap-2 relative">
            <Type className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
            <textarea
              className="flex-1 bg-background text-foreground border-2 border-border rounded-xl px-10 py-2.5 resize-none h-12 focus:border-primary focus:outline-none text-lg leading-tight"
              style={{ fontFamily: booklet.fontFamily }}
              placeholder="Write a caption..."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              onBlur={handleTextBlur}
            />
            <PaperButton variant="outline" size="icon" onClick={togglePlacement} aria-label="Toggle text placement">
              {page.textPlacement === 'above' ? <ArrowUpFromLine className="w-5 h-5" /> : <ArrowDownToLine className="w-5 h-5" />}
            </PaperButton>
          </div>

          <div className="flex gap-2">
            <PaperButton variant="secondary" className="flex-1" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="w-5 h-5 mr-2" />
              {page.photoDataUrl ? 'Replace Photo' : 'Add Photo'}
            </PaperButton>
            <PaperButton variant="primary" className="flex-1" onClick={openStampPicker}>
              <Sticker className="w-5 h-5 mr-2" />
              Stamps
            </PaperButton>
          </div>

          {page.stamps.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
                {isTouchDevice ? 'Touch' : 'Click'} to remove ({page.stamps.length}/{MAX_STAMPS_PER_PAGE}):
              </span>
              {page.stamps.map(s => (
                <button 
                  key={s.id} 
                  className="relative group shrink-0"
                  onClick={() => removePageStamp(s.id)}
                  title="Remove stamp"
                >
                  <img src={s.stamp.pngDataUrl} className="w-10 h-10 rounded-full border-2 border-border bg-white" />
                  <div className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                  </div>
                </button>
              ))}
            </div>
          )}

          {stampLimitReached && (
            <div className="text-sm font-bold text-destructive text-center border-2 border-destructive/20 bg-destructive/10 rounded-xl p-3">
              Max {MAX_STAMPS_PER_PAGE} stamps per page reached. Tap a stamp above to remove it.
            </div>
          )}

          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
        </div>
      </div>
    </div>
  );
}