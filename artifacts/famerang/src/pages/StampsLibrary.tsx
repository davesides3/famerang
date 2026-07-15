import React, { useEffect, useRef, useState } from 'react';
import { PackagePlus, Plus, Trash2, Stamp, Check, X, Pencil, Download, Upload, AlertCircle } from 'lucide-react';
import {
  useStampPackages, createStampPackage, renameStampPackage, deleteStampPackage,
  reorderStampPackages, useStamps, addStamp, deleteStamp, StampInUseError,
} from '@/lib/hooks';
import { exportStampPackageZip, importStampPackageZip, type StampPackImportTarget } from '@/lib/stampPackZip';
import { shareOrDownloadFile } from '@/lib/share';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { StampPackageRow } from '@/components/stamps/StampPackageRow';
import { cn } from '@/lib/utils';
import type { StampPackage } from '@/lib/types';

export function StampsLibrary() {
  const serverPackages = useStampPackages();

  // Local state so packages can be reordered by dragging directly in the
  // list, mirroring the page-reorder pattern in the Booklet Hub.
  const [packages, setPackages] = useState<StampPackage[]>(serverPackages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const draggedIdxRef = useRef<number | null>(null);
  const packagesRef = useRef<StampPackage[]>(packages);

  useEffect(() => {
    packagesRef.current = packages;
  }, [packages]);

  useEffect(() => {
    if (serverPackages && draggedIdx === null) {
      setPackages(serverPackages);
    }
  }, [serverPackages, draggedIdx]);

  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  const activeStamps = useStamps(expandedPkgId || undefined);
  const activePkg = packages.find((p) => p.id === expandedPkgId);

  const [newPkgName, setNewPkgName] = useState('');
  const [isCreatingPkg, setIsCreatingPkg] = useState(false);

  const [isRenamingPkg, setIsRenamingPkg] = useState(false);
  const [renamePkgName, setRenamePkgName] = useState('');

  const [isImportingPkg, setIsImportingPkg] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'new' | 'merge'>('new');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const packFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim()) return;
    const pkg = await createStampPackage(newPkgName.trim());
    setExpandedPkgId(pkg.id);
    setNewPkgName('');
    setIsCreatingPkg(false);
  };

  const openRenamePackage = () => {
    if (!activePkg) return;
    setRenamePkgName(activePkg.name);
    setIsRenamingPkg(true);
  };

  const handleRenamePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedPkgId || !renamePkgName.trim()) return;
    await renameStampPackage(expandedPkgId, renamePkgName.trim());
    setIsRenamingPkg(false);
  };

  const handleExportPackage = async () => {
    if (!expandedPkgId) return;
    const pkg = packages.find((p) => p.id === expandedPkgId);
    const blob = await exportStampPackageZip(expandedPkgId);
    const safeName = (pkg?.name || 'stamp-pack').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await shareOrDownloadFile(blob, `famerang-${safeName}.zip`, 'application/zip');
  };

  const handleImportPackageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError(null);
      const target: StampPackImportTarget =
        importMode === 'merge' && expandedPkgId
          ? { mode: 'merge', packageId: expandedPkgId }
          : { mode: 'new' };
      const pkg = await importStampPackageZip(file, target);
      setExpandedPkgId(pkg.id);
      setIsImportingPkg(false);
    } catch (err: any) {
      setImportError(err.message || 'Import failed. The file might not be a valid stamp pack.');
    } finally {
      if (packFileInputRef.current) packFileInputRef.current.value = '';
    }
  };

  const handleDeletePackage = async (id: string, name: string) => {
    try {
      if (confirm(`Delete package "${name}"?`)) {
        await deleteStampPackage(id);
        if (expandedPkgId === id) setExpandedPkgId(null);
      }
    } catch (err) {
      if (err instanceof StampInUseError) {
        if (confirm(`Cannot delete: Stamps from this package are used on ${err.usageCount} page(s). Force delete anyway (will remove them from pages)?`)) {
          await deleteStampPackage(id, { force: true });
          if (expandedPkgId === id) setExpandedPkgId(null);
        }
      }
    }
  };

  const handleUploadStamps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!expandedPkgId) return;
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      // clean name by removing extension
      const name = file.name.replace(/\.[^/.]+$/, "");
      await addStamp(expandedPkgId, file, name);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteStamp = async (id: string) => {
    try {
      await deleteStamp(id);
    } catch (err) {
      if (err instanceof StampInUseError) {
        if (confirm(`This stamp is used on ${err.usageCount} page(s). Delete it anyway?`)) {
          await deleteStamp(id, { force: true });
        }
      }
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
    await reorderStampPackages(packagesRef.current.map((p) => p.id));
  };

  const handleGripPointerDown = (e: React.PointerEvent, index: number) => {
    draggedIdxRef.current = index;
    setDraggedIdx(index);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Stamp className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-foreground">Stamp Library</h1>
        </div>
        <div className="flex gap-2">
          <PaperButton variant="outline" size="sm" onClick={() => { setImportError(null); setIsImportingPkg(true); }}>
            <Upload className="w-4 h-4 mr-2" /> Import Pack
          </PaperButton>
          {!isCreatingPkg && (
            <PaperButton size="sm" onClick={() => setIsCreatingPkg(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Pack
            </PaperButton>
          )}
        </div>
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

      {isRenamingPkg && (
        <PaperCard className="animate-in slide-in-from-top-4">
          <form onSubmit={handleRenamePackage} className="flex gap-2">
            <input
              type="text"
              placeholder="Pack name..."
              className="flex-1 px-3 py-2 border-2 border-border rounded-xl focus:border-primary outline-none"
              value={renamePkgName}
              onChange={e => setRenamePkgName(e.target.value)}
              autoFocus
            />
            <PaperButton type="submit" size="icon" variant="primary"><Check className="w-5 h-5" /></PaperButton>
            <PaperButton type="button" size="icon" variant="ghost" onClick={() => setIsRenamingPkg(false)}><X className="w-5 h-5" /></PaperButton>
          </form>
        </PaperCard>
      )}

      {isImportingPkg && (
        <PaperCard className="animate-in slide-in-from-top-4 flex flex-col gap-4">
          <h3 className="font-bold font-serif">Import Stamp Pack</h3>
          <p className="text-sm text-muted-foreground">Choose a pack .zip file exported from Famerang.</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="importMode" value="new" checked={importMode === 'new'} onChange={() => setImportMode('new')} className="w-4 h-4 text-primary" />
              <span className="font-bold">Import as a new pack</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                disabled={!expandedPkgId}
                className="w-4 h-4 text-primary"
              />
              <span className={`font-bold ${!expandedPkgId ? 'text-muted-foreground/50' : ''}`}>
                Merge into "{activePkg?.name ?? 'the selected pack'}"
              </span>
            </label>
          </div>
          <input type="file" accept=".zip,application/zip" ref={packFileInputRef} className="hidden" onChange={handleImportPackageFile} />
          <div className="flex justify-end gap-2">
            <PaperButton type="button" variant="ghost" onClick={() => setIsImportingPkg(false)}>Cancel</PaperButton>
            <PaperButton type="button" onClick={() => packFileInputRef.current?.click()}>Choose File</PaperButton>
          </div>
        </PaperCard>
      )}

      {packages.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground font-bold border-2 border-dashed border-border rounded-xl">
          Create a stamp pack to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {packages.map((pkg, i) => {
            const isExpanded = expandedPkgId === pkg.id;
            const stamps = isExpanded ? activeStamps : undefined;
            return (
              <div key={pkg.id} className="flex flex-col gap-3">
                <StampPackageRow
                  pkg={pkg}
                  isExpanded={isExpanded}
                  isDragging={draggedIdx === i}
                  onToggle={() => setExpandedPkgId(isExpanded ? null : pkg.id)}
                  onGripPointerDown={(e) => handleGripPointerDown(e, i)}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(i, el);
                    else rowRefs.current.delete(i);
                  }}
                  testId={`stamp-package-row-${i}`}
                />

                {isExpanded && (
                  <PaperCard className={cn('flex flex-col gap-6 animate-in fade-in')}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h2 className="font-bold font-serif text-xl">{pkg.name}</h2>
                      <div className="flex gap-2 flex-wrap">
                        <PaperButton variant="ghost" size="sm" onClick={openRenamePackage}>
                          <Pencil className="w-4 h-4 mr-2" /> Rename
                        </PaperButton>
                        <PaperButton variant="ghost" size="sm" onClick={handleExportPackage}>
                          <Download className="w-4 h-4 mr-2" /> Export
                        </PaperButton>
                        <PaperButton variant="ghost" size="sm" onClick={() => handleDeletePackage(pkg.id, pkg.name)} className="text-destructive">
                          Delete Pack
                        </PaperButton>
                        <PaperButton size="sm" onClick={() => fileInputRef.current?.click()}>
                          <PackagePlus className="w-4 h-4 mr-2" /> Add Stamps
                        </PaperButton>
                      </div>
                    </div>

                    <input type="file" multiple accept="image/png,image/webp" ref={fileInputRef} className="hidden" onChange={handleUploadStamps} />

                    {stamps?.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                        <StickerIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                        <p className="font-bold text-muted-foreground">This pack is empty.</p>
                        <p className="text-sm text-muted-foreground">Upload PNG images with transparent backgrounds.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        {stamps?.map(stamp => (
                          <div key={stamp.id} className="relative group bg-white border-2 border-border rounded-xl aspect-square flex items-center justify-center p-2">
                            <img src={stamp.pngDataUrl} alt={stamp.name} className="max-w-full max-h-full object-contain" />
                            <button
                              onClick={() => handleDeleteStamp(stamp.id)}
                              className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div className="absolute bottom-1 w-full text-center text-[10px] font-bold text-muted-foreground bg-white/80 truncate px-1 opacity-0 group-hover:opacity-100">
                              {stamp.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </PaperCard>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Quick inline icon component to avoid adding more imports
function StickerIcon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
      <path d="M15 3v6h6" />
      <path d="M10 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="m14 12-1.5 1.5" />
    </svg>
  );
}
