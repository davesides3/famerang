import React, { useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { PackagePlus, Trash2, Check, X, Pencil, Download } from 'lucide-react';
import {
  useStampPackages, renameStampPackage,
  useStamps, addStamp, deleteStamp, StampInUseError,
} from '@/lib/hooks';
import { exportStampPackageZip } from '@/lib/stampPackZip';
import { shareOrDownloadFile } from '@/lib/share';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { useHeaderClose } from '@/components/layout/AppLayout';
import famerangLogo from '@/assets/famerang-logo.png';

/** Compact icon-over-label action button, matching the "Add Page" toolbar
 * button style on the Booklet Hub, so Add Stamps can sit on the same line
 * as Rename and Export in mobile portrait view. */
function ToolbarAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-muted active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none text-muted-foreground"
    >
      {icon}
      <span className="text-[11px] font-bold leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
                {isRenaming ? (
                  <form onSubmit={handleRename} className="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Pack name..."
                      className="flex-1 min-w-0 text-2xl font-serif font-bold text-foreground bg-transparent border-b-2 border-primary outline-none"
                      value={renameName}
                      onChange={e => setRenameName(e.target.value)}
                      autoFocus
                      onFocus={e => e.currentTarget.select()}
                    />
                    <PaperButton type="submit" size="icon" variant="primary"><Check className="w-5 h-5" /></PaperButton>
                    <PaperButton type="button" size="icon" variant="ghost" onClick={() => setIsRenaming(false)}><X className="w-5 h-5" /></PaperButton>
                  </form>
                ) : (
                  <div className="min-w-0">
                    <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">{pkg.name}</h1>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 mt-1">
                <ToolbarAction icon={<PackagePlus className="w-5 h-5" />} label="Add Stamps" onClick={() => fileInputRef.current?.click()} />
                <ToolbarAction icon={<Pencil className="w-5 h-5" />} label="Rename" onClick={openRename} />
                <ToolbarAction icon={<Download className="w-5 h-5" />} label="Export" onClick={handleExport} />
              </div>
            </div>

            <input type="file" multiple accept="image/png,image/webp" ref={fileInputRef} className="hidden" onChange={handleUploadStamps} />

            {stamps?.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                <img src={famerangLogo} alt="" className="w-[72px] h-[72px] object-contain opacity-30 mb-3" />
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
