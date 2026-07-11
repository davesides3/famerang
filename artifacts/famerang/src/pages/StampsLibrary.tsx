import React, { useState, useRef } from 'react';
import { Link } from 'wouter';
import { PackagePlus, Plus, Trash2, Library, Check, X } from 'lucide-react';
import { 
  useStampPackages, createStampPackage, renameStampPackage, deleteStampPackage, 
  useStamps, addStamp, renameStamp, deleteStamp, StampInUseError 
} from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';

export function StampsLibrary() {
  const packages = useStampPackages();
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  
  // Safe default selection
  const activePkgId = selectedPkgId || (packages?.[0]?.id ?? null);
  const activeStamps = useStamps(activePkgId || undefined);

  const [newPkgName, setNewPkgName] = useState('');
  const [isCreatingPkg, setIsCreatingPkg] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim()) return;
    const pkg = await createStampPackage(newPkgName.trim());
    setSelectedPkgId(pkg.id);
    setNewPkgName('');
    setIsCreatingPkg(false);
  };

  const handleDeletePackage = async (id: string, name: string) => {
    try {
      if (confirm(`Delete package "${name}"?`)) {
        await deleteStampPackage(id);
        if (selectedPkgId === id) setSelectedPkgId(null);
      }
    } catch (err) {
      if (err instanceof StampInUseError) {
        if (confirm(`Cannot delete: Stamps from this package are used on ${err.usageCount} page(s). Force delete anyway (will remove them from pages)?`)) {
          await deleteStampPackage(id, { force: true });
          if (selectedPkgId === id) setSelectedPkgId(null);
        }
      }
    }
  };

  const handleUploadStamps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activePkgId) return;
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      // clean name by removing extension
      const name = file.name.replace(/\.[^/.]+$/, "");
      await addStamp(activePkgId, file, name);
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

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center gap-3">
        <Library className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-serif font-bold text-foreground">Stamp Library</h1>
      </div>

      <div className="flex flex-col gap-4">
        {/* Package selector row */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 px-1 -mx-1">
          {packages?.map(pkg => (
            <PaperButton 
              key={pkg.id}
              variant={activePkgId === pkg.id ? 'primary' : 'outline'}
              className="shrink-0 rounded-full"
              onClick={() => setSelectedPkgId(pkg.id)}
            >
              {pkg.name}
            </PaperButton>
          ))}
          <PaperButton variant="ghost" className="shrink-0 rounded-full border-2 border-dashed border-border" onClick={() => setIsCreatingPkg(true)}>
            <Plus className="w-5 h-5 mr-1" /> Pack
          </PaperButton>
        </div>

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

        {/* Active Package Content */}
        {activePkgId ? (
          <PaperCard className="flex flex-col gap-6 min-h-[50vh]">
            <div className="flex items-center justify-between">
              <h2 className="font-bold font-serif text-xl">{packages?.find(p => p.id === activePkgId)?.name}</h2>
              <div className="flex gap-2">
                <PaperButton variant="ghost" size="sm" onClick={() => handleDeletePackage(activePkgId, packages?.find(p => p.id === activePkgId)?.name || '')} className="text-destructive">
                  Delete Pack
                </PaperButton>
                <PaperButton size="sm" onClick={() => fileInputRef.current?.click()}>
                  <PackagePlus className="w-4 h-4 mr-2" /> Add Stamps
                </PaperButton>
              </div>
            </div>

            <input type="file" multiple accept="image/png,image/webp" ref={fileInputRef} className="hidden" onChange={handleUploadStamps} />

            {activeStamps?.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                <StickerIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="font-bold text-muted-foreground">This pack is empty.</p>
                <p className="text-sm text-muted-foreground">Upload PNG images with transparent backgrounds.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {activeStamps?.map(stamp => (
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
        ) : (
          <div className="py-12 text-center text-muted-foreground font-bold">
            {packages?.length === 0 ? "Create a stamp pack to get started." : "Select a stamp pack above."}
          </div>
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