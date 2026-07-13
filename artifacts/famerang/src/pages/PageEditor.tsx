import React, { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { ImagePlus, Type, ArrowUpFromLine, ArrowDownToLine, Sticker } from 'lucide-react';
import { useBooklet, usePageWithStamps, setPagePhoto, updatePageText, useStampPackages, useStamps, placeStamp, removePageStamp } from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';
import { LiveCanvas } from '@/components/LiveCanvas';
import { useHeaderClose } from '@/components/layout/AppLayout';

export function PageEditor() {
  const [, params] = useRoute('/booklet/:bookletId/page/:pageId');
  const [, setLocation] = useLocation();
  
  const bookletId = params?.bookletId;
  const pageId = params?.pageId;

  const booklet = useBooklet(bookletId);
  const page = usePageWithStamps(pageId);
  const stampPackages = useStampPackages();

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isStampDrawerOpen, setIsStampDrawerOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

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

  const handleStampTap = async (stampId: string) => {
    if (!pageId) return;
    // Place at center by default
    await placeStamp(pageId, stampId, 0.5, 0.5);
    setIsStampDrawerOpen(false);
  };

  const handleCanvasTap = (xRatio: number, yRatio: number) => {
    // We could use this to place a selected stamp, or just ignore for now.
    // The spec said "tapping a stamp... place it at sensible default (center)... user drag it".
  };

  const togglePlacement = () => {
    if (!pageId || !page) return;
    updatePageText(pageId, textContent, page.textPlacement === 'above' ? 'below' : 'above');
  };

  const stampsInCurrentPackage = useStamps(selectedPackageId || stampPackages?.[0]?.id);

  // This is a full-screen overlay-style view, so it shares the app's
  // top header (Famerang + Close) instead of its own bespoke bar --
  // consistent with the Export and Preview views.
  useHeaderClose(() => setLocation(`/booklet/${bookletId}`));

  if (!booklet || !page) return null;

  return (
    <div className="flex flex-col fixed inset-x-0 top-16 bottom-0 z-40 w-full bg-background animate-in fade-in duration-200">
      {/* Main workspace */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
        
        {/* Canvas Area */}
        <div className="flex-1 relative flex items-center justify-center p-4">
          <div className="relative shadow-xl w-full max-w-[400px] aspect-square bg-white border-4 border-white">
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
                <ImagePlus className="w-12 h-12 text-muted-foreground/50 mb-2" />
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
              className="flex-1 bg-white border-2 border-border rounded-xl px-10 py-2.5 resize-none h-12 focus:border-primary focus:outline-none text-lg leading-tight"
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
            <PaperButton variant="primary" className="flex-1" onClick={() => setIsStampDrawerOpen(true)}>
              <Sticker className="w-5 h-5 mr-2" />
              Stamps
            </PaperButton>
          </div>

          {page.stamps.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">Placed:</span>
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

          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} />
        </div>
      </div>

      {/* Stamp Drawer (Poor man's bottom sheet without extra libs to ensure reliability) */}
      {isStampDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsStampDrawerOpen(false)}>
          <div className="bg-card border-t-4 border-border rounded-t-3xl min-h-[50vh] max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center p-3">
              <div className="w-12 h-1.5 bg-border rounded-full" />
            </div>
            <div className="px-4 pb-2 border-b-2 border-border flex gap-2 overflow-x-auto hide-scrollbar">
              {stampPackages?.map(pkg => (
                <PaperButton 
                  key={pkg.id} 
                  variant={(selectedPackageId || stampPackages[0]?.id) === pkg.id ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className="shrink-0"
                >
                  {pkg.name}
                </PaperButton>
              ))}
              {(!stampPackages || stampPackages.length === 0) && (
                <div className="text-muted-foreground text-sm font-bold py-2">No stamp packs yet. Go to Library to add some!</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-4 pb-safe">
              {stampsInCurrentPackage?.map(stamp => (
                <button 
                  key={stamp.id}
                  className="aspect-square bg-white border-2 border-border rounded-xl p-2 hover:border-primary hover:-translate-y-1 transition-all flex items-center justify-center"
                  onClick={() => handleStampTap(stamp.id)}
                >
                  <img src={stamp.pngDataUrl} alt={stamp.name} className="max-w-full max-h-full object-contain drop-shadow-sm" />
                </button>
              ))}
              {stampsInCurrentPackage?.length === 0 && (
                <div className="col-span-4 text-center py-8 text-muted-foreground font-bold">This pack is empty.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}