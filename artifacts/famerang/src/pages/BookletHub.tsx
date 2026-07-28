import React, { useEffect, useRef, useState } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import {
  Plus,
  Settings,
  FileImage,
  AlertTriangle,
  Download,
  Upload,
  AlertCircle,
  FileDown,
  Loader2,
  GripVertical,
  Eye,
  Share2,
  Images,
  Trash2,
  Archive,
  Video,
  Printer,
} from 'lucide-react';
import { useBooklet, usePagesWithStickers, createPage, updateBooklet, reorderPages, deletePage } from '@/lib/hooks';
import { useHeaderClose } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { exportBookletZip, restoreBookletZip } from '@/lib/backup';
import { shareOrDownloadFile, shareOrDownloadFiles } from '@/lib/share';
import {
  generateDraftPdf,  isLargeDraftPdf,  estimateDraftPdfBytes,
  generatePrintPdf,  isLargePrintPdf,  estimatePrintPdfBytes,
} from '@/lib/pdf';
import { renderPagesAsJpegBlobs, zipPhotoBlobs, isLargePhotoExport, estimatePhotoExportBytes } from '@/lib/photoExport';
import { generateMp4, isEncoderCached } from '@/lib/videoExport';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { TRIM_SIZES, FONT_FAMILY_OPTIONS, getTrimSize } from '@/lib/types';
import type { PageWithStickers, TrimSizeKey } from '@/lib/types';
import { PagePreview } from '@/pages/PagePreview';
import { cn, formatEstimatedSize } from '@/lib/utils';
import famerangLogo from '@/assets/famerang-logo.png';

/** Compact icon-over-label button used in the hub's frozen toolbar row. */
function ToolbarAction({
  icon,
  label,
  onClick,
  disabled,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-muted active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none text-muted-foreground"
    >
      {icon}
      <span className="text-[11px] font-bold leading-none">{label}</span>
    </button>
  );
}

export function BookletHub() {
  const [, params] = useRoute('/booklet/:id');
  const [, setLocation] = useLocation();
  const id = params?.id;

  const booklet = useBooklet(id);
  const serverPages = usePagesWithStickers(id);
  const { toast } = useToast();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const [isExportingBooklet, setIsExportingBooklet] = useState(false);
  const [isRestoringBooklet, setIsRestoringBooklet] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingPrintPdf, setIsGeneratingPrintPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [isSendingPhotos, setIsSendingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

  const [isGeneratingMp4, setIsGeneratingMp4] = useState(false);
  const [mp4Progress, setMp4Progress] = useState(0);
  const [mp4DownloadProgress, setMp4DownloadProgress] = useState<{ received: number; total: number } | null>(null);
  const [mp4Error, setMp4Error] = useState<string | null>(null);
  // Encode-phase time estimate: set once encoding starts (pct ≥ 67) and
  // updated on each FFmpeg progress event.
  const mp4EncodeStartRef = useRef<number | null>(null);
  const [mp4SecondsRemaining, setMp4SecondsRemaining] = useState<number | null>(null);
  // Snapshot of isEncoderCached() taken at the start of each export run.
  // When true the FFmpeg core was already in memory, so we suppress the
  // byte-counter and show "Loading encoder… (cached)" instead.
  const [mp4EncoderWasCached, setMp4EncoderWasCached] = useState(false);
  // Elapsed-seconds counter shown while ff.load() is instantiating the WASM
  // module (progress 2–9%).  Ticks every second via a useEffect interval.
  const [mp4LoadElapsed, setMp4LoadElapsed] = useState(0);
  const mp4LoadStartRef = useRef<number | null>(null);
  // Per-page progress reported by the export pipeline.
  const [mp4PageProgress, setMp4PageProgress] = useState<{ current: number; total: number; phase: 'rendering' | 'writing' } | null>(null);
  const [mp4SecondsPerPage, setMp4SecondsPerPage] = useState(3);
  const [mp4Crossfade, setMp4Crossfade] = useState(false);

  // "Send" for a very large export shows an inline warning with the
  // estimated size instead of immediately starting; a second tap on
  // "Send Anyway" confirms and proceeds.
  const [confirmLargePdf, setConfirmLargePdf] = useState(false);
  const [confirmLargePrintPdf, setConfirmLargePrintPdf] = useState(false);
  const [confirmLargePhotos, setConfirmLargePhotos] = useState(false);

  // Changing trim size when pages already have photos may distort those
  // photos (they were cropped for the old aspect ratio). If the new size
  // has a different aspect ratio family, hold the change here and show a
  // one-tap confirmation before applying it.
  const [pendingTrimSizeKey, setPendingTrimSizeKey] = useState<TrimSizeKey | null>(null);

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Local state so pages can be reordered by dragging directly in the list.
  const [pages, setPages] = useState<PageWithStickers[]>(serverPages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const draggedIdxRef = useRef<number | null>(null);
  const pagesRef = useRef<PageWithStickers[]>(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (serverPages && draggedIdx === null) {
      setPages(serverPages);
    }
  }, [serverPages, draggedIdx]);

  // Tick an elapsed-seconds counter while the WASM module is instantiating
  // (mp4Progress 2–9%).  This gives the user visible feedback that the app
  // hasn't frozen — ff.load() can take 5–20 s on mobile.
  useEffect(() => {
    if (!isGeneratingMp4 || mp4Progress < 2 || mp4Progress >= 10) {
      mp4LoadStartRef.current = null;
      return;
    }
    if (mp4LoadStartRef.current === null) {
      mp4LoadStartRef.current = Date.now();
      setMp4LoadElapsed(0);
    }
    const id = setInterval(() => {
      setMp4LoadElapsed(Math.round((Date.now() - mp4LoadStartRef.current!) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isGeneratingMp4, mp4Progress]);

  // While the Export or Settings sub-view is open, the shared header's nav
  // button becomes a "Close" action that returns to this page-list screen
  // instead of the usual Stickers/Booklets link -- gives every overlay-style
  // view one consistent header.
  useHeaderClose(
    isExportOpen
      ? () => {
          setIsExportOpen(false);
          setConfirmLargePdf(false);
          setConfirmLargePhotos(false);
        }
      : isSettingsOpen
        ? () => setIsSettingsOpen(false)
        : isArchiveOpen
          ? () => setIsArchiveOpen(false)
          : null,
  );

  if (!booklet || !serverPages) return null;

  const isUnbackedUp = booklet.updatedAt > (booklet.lastBackedUpAt ?? 0);

  const handleAddPage = async () => {
    if (!id) return;
    const page = await createPage(id);
    setLocation(`/booklet/${id}/page/${page.id}`);
  };

  const handleDeletePage = async (pageId: string) => {
    if (confirm('Delete this page?')) {
      await deletePage(pageId);
    }
  };

  // Settings auto-saves as you go (like the Page Editor) instead of
  // requiring an explicit Save button -- title commits on blur, the
  // trim-size and font selects already commit on change below.
  const handleTitleBlur = () => {
    if (!id) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== booklet.title) {
      updateBooklet(id, { title: trimmed });
    }
  };

  const openSettings = () => {
    setEditTitle(booklet.title);
    setPendingTrimSizeKey(null);
    setIsSettingsOpen(true);
  };

  /** Called when the user picks a new trim size. If the new size has a
   *  different aspect ratio family (square ↔ portrait) AND the booklet already
   *  has pages with photos, we hold the change and show a warning. Otherwise
   *  we apply it immediately. */
  const handleTrimSizeChange = (newKey: TrimSizeKey) => {
    if (newKey === booklet.canvasSize) return;
    const isSquare = (key: TrimSizeKey) => {
      const t = getTrimSize(key);
      return t.widthPx === t.heightPx;
    };
    const aspectFamilyChanges = isSquare(booklet.canvasSize) !== isSquare(newKey);
    const hasPhotos = pages.some((p) => p.photoDataUrl !== null);
    if (aspectFamilyChanges && hasPhotos) {
      setPendingTrimSizeKey(newKey);
    } else {
      updateBooklet(booklet.id, { canvasSize: newKey });
    }
  };

  const handleExportBooklet = async () => {
    if (!id) return;
    try {
      setBackupError(null);
      setIsExportingBooklet(true);
      const blob = await exportBookletZip(id);
      const safeTitle = booklet.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().split('T')[0];
      await shareOrDownloadFile(blob, `famerang-booklet-${safeTitle}-${date}.zip`, 'application/zip');
      toast({ title: 'Backup complete', description: `"${booklet.title}" was saved to a zip file.` });
    } catch (err: any) {
      setBackupError(err.message || 'Backup failed. See console for details.');
    } finally {
      setIsExportingBooklet(false);
    }
  };

  const handleRestoreBookletFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!id) return;

    const confirmed = confirm(
      `Restoring will overwrite "${booklet.title}" with the contents of this backup. This can't be undone. Continue?`,
    );
    if (!confirmed) {
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
      return;
    }

    try {
      setBackupError(null);
      setIsRestoringBooklet(true);
      const restored = await restoreBookletZip(file, id);
      toast({ title: 'Booklet restored', description: `"${restored.title}" has been restored from the backup.` });
    } catch (err: any) {
      setBackupError(err.message || 'Restore failed. The file might be corrupted.');
    } finally {
      setIsRestoringBooklet(false);
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
    }
  };

  const handleDraftPdfClick = () => {
    if (isLargeDraftPdf(pages.length) && !confirmLargePdf) {
      setConfirmLargePdf(true);
      return;
    }
    handleDraftPdf();
  };

  const handleDraftPdf = async () => {
    if (!booklet) return;
    try {
      setConfirmLargePdf(false);
      setPdfError(null);
      setIsGeneratingPdf(true);
      // Yield to the browser so the loading state actually paints before the
      // (synchronous, potentially slow for large booklets) PDF rendering work
      // starts and blocks the main thread.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const blob = await generateDraftPdf(booklet, pages);
      const filename = `${booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-draft.pdf`;
      await shareOrDownloadFile(blob, filename, 'application/pdf');
    } catch (err: any) {
      setPdfError(err.message || 'Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintPdfClick = () => {
    if (isLargePrintPdf(pages.length) && !confirmLargePrintPdf) {
      setConfirmLargePrintPdf(true);
      return;
    }
    handlePrintPdf();
  };

  const handlePrintPdf = async () => {
    if (!booklet) return;
    try {
      setConfirmLargePrintPdf(false);
      setPdfError(null);
      setIsGeneratingPrintPdf(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const blob = await generatePrintPdf(booklet, pages);
      const filename = `${booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-print.pdf`;
      await shareOrDownloadFile(blob, filename, 'application/pdf');
    } catch (err: any) {
      setPdfError(err.message || 'Could not generate the PDF. Please try again.');
    } finally {
      setIsGeneratingPrintPdf(false);
    }
  };

  const handleSendPhotosClick = () => {
    if (isLargePhotoExport(booklet, pages.length) && !confirmLargePhotos) {
      setConfirmLargePhotos(true);
      return;
    }
    handleSendPhotos();
  };

  const handleMp4Export = async () => {
    if (!booklet) return;
    try {
      setMp4Error(null);
      setMp4Progress(0);
      setMp4DownloadProgress(null);
      setMp4SecondsRemaining(null);
      setMp4LoadElapsed(0);
      setMp4PageProgress(null);
      mp4EncodeStartRef.current = null;
      mp4LoadStartRef.current = null;
      setMp4EncoderWasCached(isEncoderCached());
      setIsGeneratingMp4(true);
      // Yield so the loading state paints before the heavy work starts.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const blob = await generateMp4(booklet, pages, {
        secondsPerPage: mp4SecondsPerPage,
        crossfade: mp4Crossfade,
        onProgress: (pct: number) => {
          setMp4Progress(pct);
          // Time-remaining estimate: only active during the encode phase (67–99 %).
          if (pct >= 67) {
            const now = Date.now();
            if (mp4EncodeStartRef.current === null) {
              // Record the moment encoding begins.
              mp4EncodeStartRef.current = now;
            } else {
              const elapsedSec = (now - mp4EncodeStartRef.current) / 1000;
              // Wait at least 3 s before showing an estimate so the first few
              // noisy FFmpeg ticks don't produce a wildly inaccurate number.
              if (elapsedSec >= 3) {
                // encodeProgress is the fraction of the encode phase completed (0→1).
                const encodeProgress = (pct - 67) / 32;
                if (encodeProgress > 0) {
                  const totalEstimatedSec = elapsedSec / encodeProgress;
                  const remaining = Math.max(0, Math.round(totalEstimatedSec - elapsedSec));
                  setMp4SecondsRemaining(remaining);
                }
              }
            }
          }
        },
        onDownloadProgress: (received, total) =>
          setMp4DownloadProgress({ received, total }),
        onPageProgress: (current, total, phase) =>
          setMp4PageProgress({ current, total, phase }),
      });
      const safeTitle = booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'booklet';
      // eslint-disable-next-line no-console
      console.log('[VideoExport] shareOrDownloadFile — start', { size: blob.size });
      await shareOrDownloadFile(blob, `${safeTitle}.mp4`, 'video/mp4');
      // eslint-disable-next-line no-console
      console.log('[VideoExport] shareOrDownloadFile — done');
      setMp4Progress(100);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[VideoExport] handleMp4Export caught error', err);
      setMp4Error(err.message || 'Could not generate the video. Please try again.');
    } finally {
      setIsGeneratingMp4(false);
    }
  };

  const handleSendPhotos = async () => {
    if (!booklet) return;
    try {
      setPhotosError(null);
      setConfirmLargePhotos(false);
      setIsSendingPhotos(true);
      // Yield to the browser so the loading state paints before the
      // (synchronous-per-page) compositing work starts.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const safeTitle = booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'booklet';
      const blobs = await renderPagesAsJpegBlobs(booklet, pages);
      const files = blobs.map(
        (blob, i) =>
          new File([blob], `${safeTitle}-page-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }),
      );
      await shareOrDownloadFiles(
        files,
        () => zipPhotoBlobs(blobs, safeTitle),
        `${safeTitle}-photos.zip`,
        booklet.title,
      );
    } catch (err: any) {
      setPhotosError(err.message || 'Could not prepare the photos. Please try again.');
    } finally {
      setIsSendingPhotos(false);
    }
  };

  // --- Inline drag-to-reorder using pointer events (works with mouse, touch,
  // and pen, and is more reliable than native HTML5 drag-and-drop) ---
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

    setPages((current) => {
      const newPages = [...current];
      const [item] = newPages.splice(from, 1);
      newPages.splice(over, 0, item);
      return newPages;
    });
    draggedIdxRef.current = over;
    setDraggedIdx(over);
  };

  const handlePointerUp = async () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    draggedIdxRef.current = null;
    setDraggedIdx(null);
    if (!id) return;
    await reorderPages(id, pagesRef.current.map((p) => p.id));
  };

  const handleGripPointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    draggedIdxRef.current = index;
    setDraggedIdx(index);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (isExportOpen) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">Export Booklet</h1>

        {(pdfError || photosError) && (
          <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-bold">{pdfError || photosError}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <PaperCard className="flex flex-col gap-3 p-4">
            <PaperButton
              type="button"
              onClick={handleDraftPdfClick}
              disabled={isGeneratingPdf}
              className="w-full flex items-center justify-center gap-2"
              data-testid="send-draft-pdf"
            >
              {isGeneratingPdf
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><FileDown className="w-4 h-4" /> {confirmLargePdf ? 'Send Anyway' : 'Send Draft PDF'}</>}
            </PaperButton>
          </PaperCard>
          {confirmLargePdf && (
            <div
              className="bg-amber-50 text-amber-800 border-2 border-amber-200 p-3 rounded-xl flex items-start gap-2.5 -mt-1"
              data-testid="large-pdf-warning"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-bold">
                This booklet has {pages.length} pages, so the draft PDF will be large (about{' '}
                {formatEstimatedSize(estimateDraftPdfBytes(pages.length))}) -- it may be slow to send or bounce off email
                attachment limits. Tap Send again to continue anyway.
              </p>
            </div>
          )}

          <PaperCard className="flex flex-col gap-3 p-4">
            <PaperButton
              type="button"
              onClick={handlePrintPdfClick}
              disabled={isGeneratingPrintPdf}
              className="w-full flex items-center justify-center gap-2"
              data-testid="send-print-pdf"
            >
              {isGeneratingPrintPdf
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Printer className="w-4 h-4" /> {confirmLargePrintPdf ? 'Send Anyway' : 'Send Print PDF'}</>}
            </PaperButton>
          </PaperCard>
          {confirmLargePrintPdf && (
            <div
              className="bg-amber-50 text-amber-800 border-2 border-amber-200 p-3 rounded-xl flex items-start gap-2.5 -mt-1"
              data-testid="large-print-pdf-warning"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-bold">
                This booklet has {pages.length} pages, so the print PDF will be large (about{' '}
                {formatEstimatedSize(estimatePrintPdfBytes(pages.length))}) — it may be slow to generate and send.
                Tap Send again to continue anyway.
              </p>
            </div>
          )}

          <PaperCard className="flex flex-col gap-3 p-4">
            <PaperButton
              type="button"
              onClick={handleSendPhotosClick}
              disabled={isSendingPhotos}
              className="w-full flex items-center justify-center gap-2"
              data-testid="send-photos"
            >
              {isSendingPhotos
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Images className="w-4 h-4" /> {confirmLargePhotos ? 'Send Anyway' : 'Send Photos'}</>}
            </PaperButton>
          </PaperCard>
          {confirmLargePhotos && (
            <div
              className="bg-amber-50 text-amber-800 border-2 border-amber-200 p-3 rounded-xl flex items-start gap-2.5 -mt-1"
              data-testid="large-photos-warning"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-bold">
                This export will be large (about{' '}
                {formatEstimatedSize(estimatePhotoExportBytes(booklet, pages.length))} for {pages.length} pages) --
                it may be slow to send over cellular or bounce off email attachment limits. Tap Send again to continue
                anyway.
              </p>
            </div>
          )}

          {/* ── MP4 Video Export ─────────────────────────────────────────── */}
          <PaperCard className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3">
              <PaperButton
                type="button"
                onClick={handleMp4Export}
                disabled={isGeneratingMp4}
                className="w-full flex items-center justify-center gap-2"
                data-testid="generate-mp4"
              >
                {isGeneratingMp4
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Video className="w-4 h-4" /> Generate &amp; Send Video</>}
              </PaperButton>
            </div>

            {/* Inline settings */}
            <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-sm font-bold text-foreground">Seconds per page</span>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMp4SecondsPerPage(s)}
                      disabled={isGeneratingMp4}
                      className={`w-12 h-9 rounded-lg text-sm font-bold border-2 transition-colors ${
                        mp4SecondsPerPage === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary/50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-bold text-foreground">Crossfade between pages</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mp4Crossfade}
                  onClick={() => setMp4Crossfade(!mp4Crossfade)}
                  disabled={isGeneratingMp4}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${mp4Crossfade ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${mp4Crossfade ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </PaperCard>

          {/* MP4 progress bar */}
          {isGeneratingMp4 && (
            <div className="flex flex-col gap-1.5 -mt-1" data-testid="mp4-progress">
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${mp4Progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-bold text-center">
                {mp4Progress < 2 ? (
                  // Phase 1: dynamic imports + CDN download (usually instant when cached)
                  mp4EncoderWasCached ? (
                    'Loading encoder…'
                  ) : mp4DownloadProgress ? (() => {
                    // Use the known ~26 MB WASM size when CDN omits Content-Length.
                    const KNOWN_WASM_BYTES = 26_214_400;
                    const received = mp4DownloadProgress.received;
                    const total = mp4DownloadProgress.total > 0
                      ? mp4DownloadProgress.total
                      : KNOWN_WASM_BYTES;
                    const receivedMB = (received / 1_048_576).toFixed(1);
                    const totalMB = (total / 1_048_576).toFixed(0);
                    return <>Downloading encoder… {receivedMB} / {totalMB} MB</>;
                  })() : (
                    'Downloading encoder…'
                  )
                ) : mp4Progress < 10 ? (
                  // Phase 2: ff.load() — WASM instantiation (5–20 s on mobile)
                  <>Starting encoder… {mp4LoadElapsed > 0 ? `${mp4LoadElapsed}s` : ''}</>
                ) : mp4Progress < 45 ? (
                  mp4PageProgress
                    ? <>Rendering page {mp4PageProgress.current} of {mp4PageProgress.total}…</>
                    : <>Rendering pages… {mp4Progress}%</>
                ) : mp4Progress < 67 ? (
                  mp4PageProgress
                    ? <>Preparing frames… page {mp4PageProgress.current} of {mp4PageProgress.total}</>
                    : <>Preparing frames… {mp4Progress}%</>
                ) : (
                  <>
                    Encoding video… {mp4Progress}%
                    {mp4SecondsRemaining !== null && ` — about ${mp4SecondsRemaining} s left`}
                  </>
                )}
              </p>
            </div>
          )}

          {mp4Error && (
            <div
              className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-3 rounded-xl flex items-start gap-2.5 -mt-1"
              data-testid="mp4-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-bold">{mp4Error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isArchiveOpen) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-2xl font-serif font-bold text-foreground">Backup &amp; Restore</h1>

        {backupError && (
          <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-bold">{backupError}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <PaperCard className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">Backup</p>
              <p className="text-sm text-muted-foreground">Save a zip file of this booklet — photos, stickers, and all.</p>
            </div>
            <PaperButton
              type="button"
              onClick={handleExportBooklet}
              disabled={isExportingBooklet}
              className="shrink-0"
              data-testid="toolbar-backup"
            >
              {isExportingBooklet ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Backup'}
            </PaperButton>
          </PaperCard>

          <PaperCard className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">Restore</p>
              <p className="text-sm text-muted-foreground">Overwrite this booklet from a previously saved backup zip.</p>
            </div>
            <PaperButton
              type="button"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={isRestoringBooklet}
              className="shrink-0"
              data-testid="toolbar-restore"
            >
              {isRestoringBooklet ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Restore'}
            </PaperButton>
          </PaperCard>
        </div>

        <input
          type="file"
          accept=".zip,application/zip"
          ref={restoreFileInputRef}
          className="hidden"
          onChange={handleRestoreBookletFile}
          data-testid="restore-file-input"
        />
      </div>
    );
  }

  if (isSettingsOpen) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">Booklet Settings</h1>
        </div>

        <PaperCard className="bg-muted/50">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleTitleBlur}
                className="w-full bg-background text-foreground px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Trim Size</label>
              <select
                value={pendingTrimSizeKey ?? booklet.canvasSize}
                onChange={(e) => handleTrimSizeChange(e.target.value as TrimSizeKey)}
                className="w-full bg-background text-foreground px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
              >
                {TRIM_SIZES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>

              {pendingTrimSizeKey && (
                <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="font-bold text-amber-800 dark:text-amber-300">
                      Existing photos were cropped for the current size and may look stretched in the new format. You'll need to re-upload them to fit correctly.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setPendingTrimSizeKey(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border-2 border-border bg-background hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateBooklet(booklet.id, { canvasSize: pendingTrimSizeKey });
                        setPendingTrimSizeKey(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Change Anyway
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Font</label>
              <select
                value={booklet.fontFamily}
                onChange={(e) => updateBooklet(booklet.id, { fontFamily: e.target.value })}
                className="w-full bg-background text-foreground px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
                style={{ fontFamily: booklet.fontFamily }}
              >
                {FONT_FAMILY_OPTIONS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

          </div>
        </PaperCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Frozen header: stays pinned below the app header while the page
          list below scrolls independently. */}
      <div className="sticky top-16 z-20 -mx-4 px-4 pb-3 bg-background border-b-2 border-border" data-testid="hub-header">
        <div className="flex items-center gap-3 pt-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">{booklet.title}</h1>
            {isUnbackedUp && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" /> Not backed up (Archive)
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 mt-2">
          <ToolbarAction
            icon={<Plus className="w-5 h-5" />}
            label="Add Page"
            onClick={handleAddPage}
            testId="toolbar-add-page"
          />
          <ToolbarAction
            icon={<Eye className="w-5 h-5" />}
            label="Preview"
            onClick={() => setPreviewIndex(0)}
            disabled={pages.length === 0}
            testId="toolbar-preview"
          />
          <ToolbarAction
            icon={<Share2 className="w-5 h-5" />}
            label="Export"
            onClick={() => setIsExportOpen(true)}
            disabled={pages.length === 0}
            testId="open-export"
          />
          <ToolbarAction icon={<Settings className="w-5 h-5" />} label="Settings" onClick={openSettings} testId="toolbar-settings" />
          <ToolbarAction
            icon={<Archive className="w-5 h-5" />}
            label="Archive"
            onClick={() => setIsArchiveOpen(true)}
            testId="toolbar-archive"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4">
        {pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-border rounded-xl bg-card">
            <img src={famerangLogo} alt="" className="w-24 h-24 object-contain mb-4 opacity-70" />
            <h3 className="text-xl font-bold text-foreground mb-2">It's empty in here</h3>
            <p className="text-muted-foreground mb-6">Add your first photo to start building your story.</p>
            <PaperButton onClick={handleAddPage} size="lg">
              <Plus className="w-6 h-6 mr-2" />
              Add First Page
            </PaperButton>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {pages.map((page, i) => (
                <div
                  key={page.id}
                  data-testid={`page-row-${i}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(i, el);
                    else rowRefs.current.delete(i);
                  }}
                  className={cn('transition-opacity', draggedIdx === i ? 'opacity-50 z-10' : '')}
                >
                  <PaperCard className="flex items-center gap-3 p-3">
                    <div
                      data-testid={`page-grip-${i}`}
                      aria-label="Drag to reorder"
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground/70 cursor-move touch-none select-none"
                      onPointerDown={(e) => handleGripPointerDown(e, i)}
                    >
                      <GripVertical className="w-5 h-5" />
                    </div>

                    <div
                      onClick={() => setLocation(`/booklet/${id}/page/${page.id}`)}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-white border-2 border-border">
                        {page.photoDataUrl ? (
                          <img src={page.photoDataUrl} alt="Thumbnail" draggable={false} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileImage className="w-8 h-8 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {i + 1}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground line-clamp-1">
                          {page.textContent?.trim() || <span className="text-muted-foreground/60 italic">Untitled page</span>}
                        </p>
                        {page.stickers.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 -space-x-2">
                            {page.stickers.slice(0, 5).map((s) => (
                              <img
                                key={s.id}
                                src={s.sticker.pngDataUrl}
                                draggable={false}
                                className="w-5 h-5 rounded-full border border-white bg-white/50"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`page-delete-${i}`}
                      aria-label="Delete page"
                      onClick={() => handleDeletePage(page.id)}
                      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </PaperCard>
                </div>
              ))}
            </div>
          </>
        )}

      </div>

      {previewIndex !== null && (
        <PagePreview booklet={booklet} pages={pages} initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      )}
    </div>
  );
}
