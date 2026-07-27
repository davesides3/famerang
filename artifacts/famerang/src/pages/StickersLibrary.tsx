import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Sticker, Check, X, Upload, AlertCircle } from 'lucide-react';
import {
  useStickerPacks, createStickerPack, reorderStickerPacks, deleteStickerPack, getStickerPackUsage, StickerInUseError,
} from '@/lib/hooks';
import { importStickerPackZip } from '@/lib/stickerPackZip';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { StickerPackRow } from '@/components/stickers/StickerPackRow';
import type { StickerPack } from '@/lib/types';

/**
 * Vertical list of sticker packages, mirroring the Booklet Hub's list of
 * booklets. Tapping a package navigates to a dedicated full-screen detail
 * view (StickerPackDetail) rather than expanding inline, so only one
 * package's stickers are visible at a time.
 */
export function StickersLibrary() {
  const serverPackages = useStickerPacks();
  const [, setLocation] = useLocation();

  // Local state so packages can be reordered by dragging directly in the
  // list, mirroring the page-reorder pattern in the Booklet Hub.
  const [packages, setPackages] = useState<StickerPack[]>(serverPackages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const draggedIdxRef = useRef<number | null>(null);
  const packagesRef = useRef<StickerPack[]>(packages);

  useEffect(() => {
    packagesRef.current = packages;
  }, [packages]);

  useEffect(() => {
    if (serverPackages && draggedIdx === null) {
      setPackages(serverPackages);
    }
  }, [serverPackages, draggedIdx]);

  const [newPkgName, setNewPkgName] = useState('');
  const [isCreatingPkg, setIsCreatingPkg] = useState(false);

  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const packFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim()) return;
    const pkg = await createStickerPack(newPkgName.trim());
    setNewPkgName('');
    setIsCreatingPkg(false);
    setLocation(`/stickers/${pkg.id}`);
  };

  const handleImportPackageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError(null);
      setIsImporting(true);
      const pkg = await importStickerPackZip(file, { mode: 'new' });
      setLocation(`/stickers/${pkg.id}`);
    } catch (err: any) {
      setImportError(err.message || 'Import failed. The file might not be a valid sticker pack.');
    } finally {
      setIsImporting(false);
      if (packFileInputRef.current) packFileInputRef.current.value = '';
    }
  };

  // --- Drag-to-reorder, mirroring BookletHub's page-reorder mechanism ---
  const findIndexAtPoint = (clientX: number, clientY: number): number | null => {
    for (const [index, el] of rowRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return index;
      }
    }
    return null;
  };

  const handlePointerMove = (e: PointerEvent) => {
    const from = draggedIdxRef.current;
    if (from === null) return;
    const over = findIndexAtPoint(e.clientX, e.clientY);
    if (over === null || over === from) return;

    setPackages((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(over, 0, item);
      return next;
    });
    draggedIdxRef.current = over;
    setDraggedIdx(over);
  };

  const handlePointerUp = async () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    draggedIdxRef.current = null;
    setDraggedIdx(null);
    await reorderStickerPacks(packagesRef.current.map((p) => p.id));
  };

  const handleGripPointerDown = (e: React.PointerEvent, index: number) => {
    draggedIdxRef.current = index;
    setDraggedIdx(index);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleDeletePackage = async (pkg: StickerPack) => {
    const usage = await getStickerPackUsage(pkg.id);
    const message = usage.stickerCount > 0
      ? `Delete package "${pkg.name}"? There ${usage.stickerCount === 1 ? 'is' : 'are'} ${usage.stickerCount} sticker${usage.stickerCount === 1 ? '' : 's'} used across ${usage.pageCount} page${usage.pageCount === 1 ? '' : 's'}.`
      : `Delete package "${pkg.name}"?`;
    if (!confirm(message)) return;
    try {
      await deleteStickerPack(pkg.id, { force: usage.stickerCount > 0 });
    } catch (err) {
      if (err instanceof StickerInUseError) {
        // Fallback in case usage changed between the check and the delete.
        if (confirm(`Cannot delete: Stickers from this package are used on ${err.usageCount} page(s). Force delete anyway (will remove them from pages)?`)) {
          await deleteStickerPack(pkg.id, { force: true });
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Sticker className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-foreground">Sticker Library</h1>
        </div>
        <div className="flex gap-2">
          <PaperButton
            variant="outline"
            size="sm"
            onClick={() => { setImportError(null); packFileInputRef.current?.click(); }}
            disabled={isImporting}
          >
            <Upload className="w-4 h-4 mr-2" /> {isImporting ? 'Importing...' : 'Import Pack'}
          </PaperButton>
          {!isCreatingPkg && (
            <PaperButton size="sm" onClick={() => setIsCreatingPkg(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Pack
            </PaperButton>
          )}
        </div>
        <input type="file" accept=".zip,application/zip" ref={packFileInputRef} className="hidden" onChange={handleImportPackageFile} />
      </div>

      {importError && (
        <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-bold">{importError}</p>
        </div>
      )}

      {isCreatingPkg && (
        <PaperCard className="animate-in slide-in-from-top-4">
          <form onSubmit={handleCreatePackage} className="flex gap-2">
            <input
              type="text"
              placeholder="Pack name..."
              className="flex-1 px-3 py-2 border-2 border-border rounded-xl focus:border-primary outline-none"
              value={newPkgName}
              onChange={e => setNewPkgName(e.target.value)}
              autoFocus
            />
            <PaperButton type="submit" size="icon" variant="primary"><Check className="w-5 h-5" /></PaperButton>
            <PaperButton type="button" size="icon" variant="ghost" onClick={() => setIsCreatingPkg(false)}><X className="w-5 h-5" /></PaperButton>
          </form>
        </PaperCard>
      )}

      {packages.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground font-bold border-2 border-dashed border-border rounded-xl">
          Create a sticker pack to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {packages.map((pkg, i) => (
            <StickerPackRow
              key={pkg.id}
              pkg={pkg}
              isExpanded={false}
              isDragging={draggedIdx === i}
              onToggle={() => setLocation(`/stickers/${pkg.id}`)}
              onGripPointerDown={(e) => handleGripPointerDown(e, i)}
              onDelete={() => handleDeletePackage(pkg)}
              rowRef={(el) => {
                if (el) rowRefs.current.set(i, el);
                else rowRefs.current.delete(i);
              }}
              testId={`sticker-package-row-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
