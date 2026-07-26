import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { renderPageToCanvas } from '@/lib/compositing';
import { useHeaderClose } from '@/components/layout/AppLayout';
import { getTrimSize } from '@/lib/types';
import type { Booklet, PageWithStamps } from '@/lib/types';

const PREVIEW_RENDER_SIZE = 1000;

interface Props {
  booklet: Booklet;
  pages: PageWithStamps[];
  initialIndex: number;
  onClose: () => void;
}

/**
 * Full-screen, read-only page navigator. Composites each page through the
 * same `renderPageToCanvas` used by the editor and the draft PDF, so what
 * the user previews here exactly matches what they'll get in the export.
 * Renders are cached per page id so revisiting a page is instant.
 */
export function PagePreview({ booklet, pages, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(pages.length - 1, 0)));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const touchStartX = useRef<number | null>(null);

  const page = pages[index];

  useEffect(() => {
    if (!page) return;
    const cached = cacheRef.current.get(page.id);
    if (cached) {
      setImageUrl(cached);
      return;
    }
    let cancelled = false;
    setIsRendering(true);
    const trimSize = getTrimSize(booklet.canvasSize);
    const aspect = trimSize.widthPx / trimSize.heightPx;
    const pw = aspect >= 1 ? PREVIEW_RENDER_SIZE : Math.round(PREVIEW_RENDER_SIZE * aspect);
    const ph = aspect >= 1 ? Math.round(PREVIEW_RENDER_SIZE / aspect) : PREVIEW_RENDER_SIZE;
    renderPageToCanvas(page, booklet, pw, ph)
      .then((canvas) => {
        if (cancelled) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        cacheRef.current.set(page.id, dataUrl);
        setImageUrl(dataUrl);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, booklet]);

  // Preview is a "close"-style overlay -- swap the shared header's nav
  // button for a Close action so it matches the Export view's header
  // instead of showing its own separate top bar.
  useHeaderClose(onClose);

  if (!page) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(pages.length - 1, i + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    const SWIPE_THRESHOLD = 40;
    if (deltaX > SWIPE_THRESHOLD) goPrev();
    else if (deltaX < -SWIPE_THRESHOLD) goNext();
  };

  return (
    <div
      className="fixed inset-x-0 top-16 bottom-0 z-40 bg-black flex flex-col animate-in fade-in duration-200"
      data-testid="page-preview"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex-1 flex items-center justify-center relative px-3 overflow-hidden">
        {isRendering && !imageUrl ? (
          <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={`Page ${index + 1} of ${pages.length}`}
            draggable={false}
            className="max-w-full max-h-full object-contain rounded-lg select-none"
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between px-6 pb-8 pt-2 shrink-0">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Previous page"
          data-testid="preview-prev"
          className="p-3 rounded-full bg-white/10 text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-sm font-bold tabular-nums text-white" data-testid="preview-counter">
          {index + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index === pages.length - 1}
          aria-label="Next page"
          data-testid="preview-next"
          className="p-3 rounded-full bg-white/10 text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
