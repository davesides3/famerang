import React, { useEffect, useRef, useState } from 'react';
import { renderPageToCanvas } from '@/lib/compositing';
import { getTrimSize } from '@/lib/types';
import type { Booklet, PageWithStamps } from '@/lib/types';
import { movePageStamp } from '@/lib/hooks';

interface LiveCanvasProps {
  page: PageWithStamps;
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
  const [localStamps, setLocalStamps] = useState(page.stamps);

  // Compute render dimensions from the booklet's trim size, bounded by maxRenderSize.
  const trimSize = getTrimSize(booklet.canvasSize);
  const aspect = trimSize.widthPx / trimSize.heightPx;
  const renderWidth  = aspect >= 1 ? maxRenderSize : Math.round(maxRenderSize * aspect);
  const renderHeight = aspect >= 1 ? Math.round(maxRenderSize / aspect) : maxRenderSize;

  // Sync with DB when not actively dragging
  useEffect(() => {
    if (!draggingId) {
      setLocalStamps(page.stamps);
    }
  }, [page.stamps, draggingId]);

  useEffect(() => {
    let active = true;
    const syntheticPage = { ...page, stamps: localStamps };
    
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
  }, [page, booklet, localStamps, renderWidth, renderHeight]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    const STAMP_RADIUS = 0.11;
    const stampsReversed = [...localStamps].sort((a,b) => b.stackOrder - a.stackOrder);
    const hit = stampsReversed.find(s => {
      const dx = s.xRatio - xRatio;
      const dy = s.yRatio - yRatio;
      return Math.sqrt(dx*dx + dy*dy) < STAMP_RADIUS;
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

    setLocalStamps(prev => prev.map(s => s.id === draggingId ? { ...s, xRatio, yRatio } : s));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      
      // Persist the change
      const finalStamp = localStamps.find(s => s.id === draggingId);
      if (finalStamp) {
        movePageStamp(draggingId, finalStamp.xRatio, finalStamp.yRatio);
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
