import React, { useEffect, useRef, useState } from 'react';
import { renderPageToCanvas } from '@/lib/compositing';
import { getTrimSize } from '@/lib/types';
import type { Booklet, PageWithStickers } from '@/lib/types';
import { movePageSticker } from '@/lib/hooks';

interface LiveCanvasProps {
  page: PageWithStickers;
  booklet: Booklet;
  /** Max pixel size for the internal render canvas (long edge). The actual
   *  render dimensions are computed from this + the booklet's aspect ratio
   *  so portrait and square pages both look correct. Default: 600. */
  maxRenderSize?: number;
  onBgTap?: (xRatio: number, yRatio: number) => void;
  className?: string;
}

export function LiveCanvas({ page, booklet, maxRenderSize = 600, onBgTap, className }: LiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [localStickers, setLocalStickers] = useState(page.stickers);

  // Compute render dimensions from the booklet's trim size, bounded by maxRenderSize.
  const trimSize = getTrimSize(booklet.canvasSize);
  const aspect = trimSize.widthPx / trimSize.heightPx;
  const renderWidth  = aspect >= 1 ? maxRenderSize : Math.round(maxRenderSize * aspect);
  const renderHeight = aspect >= 1 ? Math.round(maxRenderSize / aspect) : maxRenderSize;

  // Sync with DB when not actively dragging
  useEffect(() => {
    if (!draggingId) {
      setLocalStickers(page.stickers);
    }
  }, [page.stickers, draggingId]);

  useEffect(() => {
    let active = true;
    const syntheticPage = { ...page, stickers: localStickers };
    
    renderPageToCanvas(syntheticPage, booklet, renderWidth, renderHeight).then(offscreen => {
      if (!active) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    });
    return () => { active = false; };
  }, [page, booklet, localStickers, renderWidth, renderHeight]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    const STICKER_RADIUS = 0.11;
    const stickersReversed = [...localStickers].sort((a,b) => b.stackOrder - a.stackOrder);
    const hit = stickersReversed.find(s => {
      const dx = s.xRatio - xRatio;
      const dy = s.yRatio - yRatio;
      return Math.sqrt(dx*dx + dy*dy) < STICKER_RADIUS;
    });

    if (hit) {
      setDraggingId(hit.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (onBgTap) {
      onBgTap(xRatio, yRatio);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setLocalStickers(prev => prev.map(s => s.id === draggingId ? { ...s, xRatio, yRatio } : s));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      
      // Persist the change
      const finalSticker = localStickers.find(s => s.id === draggingId);
      if (finalSticker) {
        movePageSticker(draggingId, finalSticker.xRatio, finalSticker.yRatio);
      }
      
      setDraggingId(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={renderWidth}
      height={renderHeight}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
    />
  );
}
