import React, { useEffect, useState } from 'react';
import { Lock, LockOpen, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaperButton } from '@/components/ui/PaperButton';
import { updateStampPackageCredits } from '@/lib/hooks';
import type { StampPackage } from '@/lib/types';

interface Props {
  pkg: StampPackage;
  open: boolean;
  onClose: () => void;
}

/**
 * Info / credits dialog for a stamp package.
 *
 * Shows artist name and URL in read-only view. A padlock button in the header
 * controls edit access:
 *  - Closed padlock (creditsLocked) → tap to unlock and enter edit mode.
 *  - Open padlock (!creditsLocked) → tap to save and re-lock.
 * Save saves without locking; Cancel reverts local edits and re-locks if the
 * package was locked when the dialog opened.
 */
export function StampPackageInfoDialog({ pkg, open, onClose }: Props) {
  const [localLocked, setLocalLocked] = useState(pkg.creditsLocked ?? false);
  const [draftArtist, setDraftArtist] = useState(pkg.artist ?? '');
  const [draftUrl, setDraftUrl] = useState(pkg.creditsUrl ?? '');

  // Reset local state whenever the dialog opens or the package identity changes.
  useEffect(() => {
    if (open) {
      setLocalLocked(pkg.creditsLocked ?? false);
      setDraftArtist(pkg.artist ?? '');
      setDraftUrl(pkg.creditsUrl ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg.id]);

  const isEditing = !localLocked;

  const handlePadlockToggle = async () => {
    if (localLocked) {
      // Unlock: persist to DB then enter edit mode.
      await updateStampPackageCredits(pkg.id, { creditsLocked: false });
      setLocalLocked(false);
    } else {
      // Lock: save current drafts and lock.
      await updateStampPackageCredits(pkg.id, {
        artist: draftArtist.trim() || undefined,
        creditsUrl: draftUrl.trim() || undefined,
        creditsLocked: true,
      });
      setLocalLocked(true);
    }
  };

  const handleSave = async () => {
    await updateStampPackageCredits(pkg.id, {
      artist: draftArtist.trim() || undefined,
      creditsUrl: draftUrl.trim() || undefined,
    });
    onClose();
  };

  const handleCancel = async () => {
    // If the package was locked when we opened, re-lock it (in case the user
    // unlocked it and started editing but now wants to undo).
    if (pkg.creditsLocked && !localLocked) {
      await updateStampPackageCredits(pkg.id, { creditsLocked: true });
    }
    setDraftArtist(pkg.artist ?? '');
    setDraftUrl(pkg.creditsUrl ?? '');
    setLocalLocked(pkg.creditsLocked ?? false);
    onClose();
  };

  const displayUrl = isEditing ? draftUrl : (pkg.creditsUrl ?? '');
  const displayArtist = isEditing ? draftArtist : (pkg.artist ?? '');
  const hasValidUrl = !!displayUrl && (displayUrl.startsWith('http://') || displayUrl.startsWith('https://'));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        {/* Header: title + padlock toggle */}
        <div className="flex items-start justify-between gap-3 pr-6">
          <DialogTitle className="text-lg font-serif font-bold leading-tight">
            {pkg.name}
          </DialogTitle>
          <button
            type="button"
            onClick={handlePadlockToggle}
            aria-label={localLocked ? 'Unlock credits for editing' : 'Lock credits'}
            className="shrink-0 mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {localLocked
              ? <Lock className="w-4 h-4" />
              : <LockOpen className="w-4 h-4 text-primary" />
            }
          </button>
        </div>

        {/* Credits fields */}
        <div className="flex flex-col gap-4">
          {/* Artist */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Artist
            </label>
            {isEditing ? (
              <input
                type="text"
                value={draftArtist}
                onChange={(e) => setDraftArtist(e.target.value)}
                placeholder="Artist or creator name"
                className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            ) : (
              <p className="text-sm font-medium text-foreground min-h-[2rem] flex items-center">
                {displayArtist || <span className="text-muted-foreground italic">Not set</span>}
              </p>
            )}
          </div>

          {/* URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              URL
            </label>
            {isEditing ? (
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            ) : hasValidUrl ? (
              <a
                href={displayUrl}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(displayUrl, '_blank', 'noopener,noreferrer');
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline break-all cursor-pointer"
              >
                {displayUrl}
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            ) : (
              <p className="text-sm font-medium text-foreground min-h-[2rem] flex items-center">
                {displayUrl || <span className="text-muted-foreground italic">Not set</span>}
              </p>
            )}
          </div>
        </div>

        {/* Save / Cancel — only in edit mode */}
        {isEditing && (
          <div className="flex gap-2 justify-end pt-1">
            <PaperButton type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </PaperButton>
            <PaperButton type="button" variant="primary" size="sm" onClick={handleSave}>
              Save
            </PaperButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
