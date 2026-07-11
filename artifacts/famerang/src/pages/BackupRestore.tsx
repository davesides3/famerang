import React, { useRef, useState } from 'react';
import { ArchiveRestore, Download, Upload, AlertCircle } from 'lucide-react';
import { exportBackupZip, restoreBackupZip } from '@/lib/backup';
import { shareOrDownloadFile } from '@/lib/share';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';

export function BackupRestore() {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const blob = await exportBackupZip();
      const date = new Date().toISOString().split('T')[0];
      await shareOrDownloadFile(blob, `famerang-backup-${date}.zip`, 'application/zip');
    } catch (err) {
      console.error(err);
      setError('Export failed. See console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsRestoring(true);
      setError(null);
      await restoreBackupZip(file, restoreMode);
      alert('Restore complete! The app will now reload.');
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Restore failed. The file might be corrupted.');
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center gap-3">
        <ArchiveRestore className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-serif font-bold text-foreground">Backup & Restore</h1>
      </div>

      <p className="text-muted-foreground leading-relaxed">
        Everything in Famerang lives purely on this device. Create a backup to move your library to a new device or just keep your memories safe.
      </p>

      {error && (
        <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      <PaperCard className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-secondary/10 rounded-xl text-secondary">
            <Download className="w-8 h-8" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Export Backup</h2>
            <p className="text-sm text-muted-foreground">Save a .zip containing all your booklets, pages, photos, and stamps.</p>
          </div>
        </div>
        <PaperButton onClick={handleExport} disabled={isExporting} variant="secondary">
          {isExporting ? 'Exporting...' : 'Create Backup'}
        </PaperButton>
      </PaperCard>

      <PaperCard className="flex flex-col gap-4 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Restore Backup</h2>
            <p className="text-sm text-muted-foreground">Load a previously saved backup .zip onto this device.</p>
          </div>
        </div>

        <div className="bg-muted p-4 rounded-xl flex flex-col gap-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="radio" 
              name="mode" 
              value="merge" 
              checked={restoreMode === 'merge'} 
              onChange={() => setRestoreMode('merge')}
              className="w-4 h-4 text-primary focus:ring-primary"
            />
            <span className="font-bold">Merge (Add to existing)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="radio" 
              name="mode" 
              value="replace" 
              checked={restoreMode === 'replace'} 
              onChange={() => setRestoreMode('replace')}
              className="w-4 h-4 text-destructive focus:ring-destructive"
            />
            <span className="font-bold text-destructive">Replace (Wipe existing first)</span>
          </label>
        </div>

        <input type="file" accept=".zip,application/zip" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        
        <PaperButton onClick={() => fileInputRef.current?.click()} disabled={isRestoring}>
          {isRestoring ? 'Restoring...' : 'Choose Backup File'}
        </PaperButton>
      </PaperCard>
    </div>
  );
}