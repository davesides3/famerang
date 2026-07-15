import React, { useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { PackagePlus, Trash2, Check, X, Pencil, Download, Upload, AlertCircle } from 'lucide-react';
import {
  useStampPackages, renameStampPackage,
  useStamps, addStamp, deleteStamp, StampInUseError,
} from '@/lib/hooks';
import { exportStampPackageZip, importStampPackageZip } from '@/lib/stampPackZip';
import { shareOrDownloadFile } from '@/lib/share';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { useHeaderClose } from '@/components/layout/AppLayout';

/**
 * Full-screen view of a single stamp package's stamps, taking over the
 * whole screen -- mirroring how tapping a booklet opens the full-screen
 * Booklet Hub instead of expanding inline. Other packages are not visible
 * here; the header's Close action returns to the package list.
 */
export function StampPackageDetail() {
  const [, params] = useRoute('/stamps/:packageId');
  const [, setLocation] = useLocation();
  const packageId = params?.packageId;

  const packages = useStampPackages();
  const pkg = packages?.find((p) => p.id === packageId);
  const stamps = useStamps(packageId);

  const returnToLibrary = () => setLocation('/stamps');
  useHeaderClose(returnToLibrary);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeFileInputRef = useRef<HTMLInputElement>(null);

  const openRename = () => {
    if (!pkg) return;
    setRenameName(pkg.name);
    setIsRenaming(true);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageId || !renameName.trim()) return;
    await renameStampPackage(packageId, renameName.trim());
    setIsRenaming(false);
  };

  const handleExport = async () => {
    if (!packageId || !pkg) return;
    const blob = await exportStampPackageZip(packageId);
    const safeName = pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await shareOrDownloadFile(blob, `famerang-${safeName}.zip`, 'application/zip');
  };

  const handleUploadStamps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!packageId) return;
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      // clean name by removing extension
      const name = file.name.replace(/\.[^/.]+$/, "");
      await addStamp(packageId, file, name);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMergePackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !packageId) return;
    try {
      setMergeError(null);
      setIsMerging(true);
      await importStampPackageZip(file, { mode: 'merge', packageId });
    } catch (err: any) {
      setMergeError(err.message || 'Import failed. The file might not be a valid stamp pack.');
    } finally {
      setIsMerging(false);
      if (mergeFileInputRef.current) mergeFileInputRef.current.value = '';
    }
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

  if (!packageId) return null;

  return (
    <div className="flex flex-col fixed inset-x-0 top-16 bottom-0 z-40 w-full bg-background animate-in fade-in duration-200">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-safe">
        {!pkg ? null : (
          <>
            {/* Frozen header, styled to match the top of the Booklet Hub's
                page list: title on its own line, then a grouped action row
                beneath a bottom border. Uses top-0 (not top-16 like
                BookletHub) because this view is already offset below the
                app header by its own "fixed top-16" wrapper, so its
                scrollable area's own top is effectively 0. */}
            <div className="sticky top-0 z-20 -mx-4 px-4 pb-3 bg-background border-b-2 border-border" data-testid="package-detail-header">
              <div className="flex items-center gap-3 pt-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">{pkg.name}</h1>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <PaperButton variant="ghost" size="sm" onClick={openRename}>
                    <Pencil className="w-4 h-4 mr-2" /> Rename
                  </PaperButton>
                  <PaperButton variant="ghost" size="sm" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-2" /> Export
                  </PaperButton>
                  <PaperButton variant="ghost" size="sm" onClick={() => mergeFileInputRef.current?.click()} disabled={isMerging}>
                    <Upload className="w-4 h-4 mr-2" /> {isMerging ? 'Importing...' : 'Import Into Pack'}
                  </PaperButton>
                </div>
                <PaperButton size="sm" onClick={() => fileInputRef.current?.click()}>
                  <PackagePlus className="w-4 h-4 mr-2" /> Add Stamps
                </PaperButton>
              </div>
            </div>

            {isRenaming && (
              <form onSubmit={handleRename} className="flex gap-2 animate-in slide-in-from-top-4">
                <input
                  type="text"
                  placeholder="Pack name..."
                  className="flex-1 px-3 py-2 border-2 border-border rounded-xl focus:border-primary outline-none"
                  value={renameName}
                  onChange={e => setRenameName(e.target.value)}
                  autoFocus
                />
                <PaperButton type="submit" size="icon" variant="primary"><Check className="w-5 h-5" /></PaperButton>
                <PaperButton type="button" size="icon" variant="ghost" onClick={() => setIsRenaming(false)}><X className="w-5 h-5" /></PaperButton>
              </form>
            )}

            {mergeError && (
              <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-bold">{mergeError}</p>
              </div>
            )}

            <input type="file" multiple accept="image/png,image/webp" ref={fileInputRef} className="hidden" onChange={handleUploadStamps} />
            <input type="file" accept=".zip,application/zip" ref={mergeFileInputRef} className="hidden" onChange={handleMergePackFile} />

            {stamps?.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                <StickerIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="font-bold text-muted-foreground">This pack is empty.</p>
                <p className="text-sm text-muted-foreground">Upload PNG images with transparent backgrounds.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {stamps?.map(stamp => (
                  <PaperCard key={stamp.id} className="flex items-center gap-3 p-3">
                    <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white border-2 border-border flex items-center justify-center p-1">
                      <img src={stamp.pngDataUrl} alt={stamp.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <p className="min-w-0 flex-1 font-bold text-foreground truncate">{stamp.name}</p>
                    <button
                      type="button"
                      aria-label={`Delete stamp ${stamp.name}`}
                      onClick={() => handleDeleteStamp(stamp.id)}
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </PaperCard>
                ))}
              </div>
            )}
          </>
        )}
      </div>
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
