import React from 'react';
import { GripVertical } from 'lucide-react';
import { PaperCard } from '@/components/ui/PaperCard';
import { useStamps } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { StampPackage } from '@/lib/types';

interface Props {
  pkg: StampPackage;
  isExpanded: boolean;
  onToggle: () => void;
  /** Present only where reordering is allowed (the Stamp Library page).
   * Omitted in read-only contexts like the full-screen stamp picker. */
  onGripPointerDown?: (e: React.PointerEvent) => void;
  isDragging?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  testId?: string;
}

/** A single stamp-package row, styled to parallel a page row in the
 * Booklet Hub: an optional drag handle on the left, the package name, and
 * up to 5 of its stamps shown at reduced size along the row. Tapping the
 * row (outside the drag handle) expands/collapses it. */
export function StampPackageRow({
  pkg,
  isExpanded,
  onToggle,
  onGripPointerDown,
  isDragging,
  rowRef,
  testId,
}: Props) {
  const stamps = useStamps(pkg.id);
  const preview = stamps?.slice(0, 5) ?? [];

  return (
    <div ref={rowRef} className={cn('transition-opacity', isDragging && 'opacity-50 z-10')}>
      <PaperCard
        role="button"
        tabIndex={0}
        data-testid={testId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
          isExpanded && 'border-primary',
        )}
      >
        {onGripPointerDown && (
          <div
            aria-label="Drag to reorder"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground/70 cursor-move touch-none select-none"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onGripPointerDown(e);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-5 h-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground truncate">{pkg.name}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {preview.length === 0 ? (
            <span className="text-xs text-muted-foreground/60 italic">Empty</span>
          ) : (
            preview.map((stamp) => (
              <img
                key={stamp.id}
                src={stamp.pngDataUrl}
                alt=""
                draggable={false}
                className="w-8 h-8 rounded-lg border-2 border-border bg-white object-contain p-0.5"
              />
            ))
          )}
        </div>
      </PaperCard>
    </div>
  );
}
