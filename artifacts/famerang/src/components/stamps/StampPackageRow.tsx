import React from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
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
  /** Present only where deleting a whole package from the row is allowed
   * (the Stamp Library page). Omitted in read-only contexts like the
   * full-screen stamp picker. */
  onDelete?: () => void;
  isDragging?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  testId?: string;
}

/** A single stamp-package row, styled to parallel a page row in the
 * Booklet Hub: an optional drag handle on the left, the package name on its
 * own line with up to 5 of its stamps previewed on a second line beneath
 * it, and an optional delete button on the right. Tapping the row (outside
 * the drag handle and delete button) expands/collapses it. */
export function StampPackageRow({
  pkg,
  isExpanded,
  onToggle,
  onGripPointerDown,
  onDelete,
  isDragging,
  rowRef,
  testId,
}: Props) {
  const stamps = useStamps(pkg.id);
  const preview = stamps?.slice(0, 5) ?? [];

  return (
    <div ref={rowRef} className={cn('transition-opacity', isDragging && 'opacity-50 z-10')}>
      <PaperCard
        className={cn('flex items-center gap-3 p-3', isExpanded && 'border-primary')}
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
          >
            <GripVertical className="w-5 h-5" />
          </div>
        )}

        <div
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
          className="min-w-0 flex-1 cursor-pointer"
        >
          <p className="font-bold text-foreground truncate">{pkg.name}</p>
          <div className="flex items-center gap-1 mt-1">
            {preview.length === 0 ? (
              <span className="text-xs text-muted-foreground/60 italic">Empty</span>
            ) : (
              preview.map((stamp) => (
                <img
                  key={stamp.id}
                  src={stamp.pngDataUrl}
                  alt=""
                  draggable={false}
                  className="w-6 h-6 rounded-lg border-2 border-border bg-white object-contain p-0.5"
                />
              ))
            )}
          </div>
        </div>

        {onDelete && (
          <button
            type="button"
            aria-label="Delete package"
            data-testid={testId ? `${testId}-delete` : undefined}
            onClick={onDelete}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </PaperCard>
    </div>
  );
}
