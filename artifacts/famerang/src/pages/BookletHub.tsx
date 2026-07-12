import React, { useEffect, useRef, useState } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import {
  ChevronLeft,
  Plus,
  Settings,
  ImagePlus,
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
} from 'lucide-react';
import { useBooklet, usePagesWithStamps, createPage, updateBooklet, reorderPages, deletePage } from '@/lib/hooks';
import { useHeaderClose } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { exportBookletZip, restoreBookletZip } from '@/lib/backup';
import { shareOrDownloadFile, shareOrDownloadFiles } from '@/lib/share';
import { generateDraftPdf, isLargeDraftPdf, estimateDraftPdfBytes } from '@/lib/pdf';
import { renderPagesAsJpegBlobs, zipPhotoBlobs, isLargePhotoExport, estimatePhotoExportBytes } from '@/lib/photoExport';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { CANVAS_SIZES, FONT_FAMILY_OPTIONS } from '@/lib/types';
import type { PageWithStamps } from '@/lib/types';
import { PagePreview } from '@/pages/PagePreview';
import { cn, formatEstimatedSize } from '@/lib/utils';

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
  const serverPages = usePagesWithStamps(id);
  const { toast } = useToast();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const [isExportingBooklet, setIsExportingBooklet] = useState(false);
  const [isRestoringBooklet, setIsRestoringBooklet] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [isSendingPhotos, setIsSendingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

  // "Send" for a very large export shows an inline warning with the
  // estimated size instead of immediately starting; a second tap on
  // "Send Anyway" confirms and proceeds.
  const [confirmLargePdf, setConfirmLargePdf] = useState(false);
  const [confirmLargePhotos, setConfirmLargePhotos] = useState(false);

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Local state so pages can be reordered by dragging directly in the list.
  const [pages, setPages] = useState<PageWithStamps[]>(serverPages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const draggedIdxRef = useRef<number | null>(null);
  const pagesRef = useRef<PageWithStamps[]>(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (serverPages && draggedIdx === null) {
      setPages(serverPages);
    }
  }, [serverPages, draggedIdx]);

  // While the Export sub-view is open, the shared header's nav button
  // becomes a "Close" action that returns to this page-list screen instead
  // of the usual Stamps/Booklets link -- gives Export one consistent header.
  useHeaderClose(
    isExportOpen
      ? () => {
          setIsExportOpen(false);
          setConfirmLargePdf(false);
          setConfirmLargePhotos(false);
        }
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

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (editTitle.trim()) {
      await updateBooklet(id, { title: editTitle.trim() });
    }
    setIsSettingsOpen(false);
  };

  const openSettings = () => {
    setEditTitle(booklet.title);
    setIsSettingsOpen(true);
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

  const handleSendPhotosClick = () => {
    if (isLargePhotoExport(booklet.canvasSize, pages.length) && !confirmLargePhotos) {
      setConfirmLargePhotos(true);
      return;
    }
    handleSendPhotos();
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
          <PaperCard className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileDown className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">Send Draft PDF</p>
              <p className="text-sm text-muted-foreground">A quick-preview PDF with every page, ready to print or share.</p>
            </div>
            <PaperButton
              type="button"
              onClick={handleDraftPdfClick}
              disabled={isGeneratingPdf}
              className="shrink-0"
              data-testid="send-draft-pdf"
            >
              {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmLargePdf ? 'Send Anyway' : 'Send'}
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

          <PaperCard className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Images className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">Send Photos</p>
              <p className="text-sm text-muted-foreground">
                Full-resolution images of every page, ready to save straight into Google Photos or Apple Photos.
              </p>
            </div>
            <PaperButton
              type="button"
              onClick={handleSendPhotosClick}
              disabled={isSendingPhotos}
              className="shrink-0"
              data-testid="send-photos"
            >
              {isSendingPhotos ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmLargePhotos ? 'Send Anyway' : 'Send'}
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
                {formatEstimatedSize(estimatePhotoExportBytes(booklet.canvasSize, pages.length))} for {pages.length} pages) --
                it may be slow to send over cellular or bounce off email attachment limits. Tap Send again to continue
                anyway.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isSettingsOpen) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3">
          <PaperButton variant="ghost" size="icon" className="shrink-0" onClick={() => setIsSettingsOpen(false)}>
            <ChevronLeft className="w-6 h-6" />
          </PaperButton>
          <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">Booklet Settings</h1>
        </div>

        <PaperCard className="bg-muted/50">
          <form onSubmit={saveSettings} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-white px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Trim Size</label>
              <select
                value={booklet.canvasSize}
                onChange={(e) => updateBooklet(booklet.id, { canvasSize: Number(e.target.value) as any })}
                className="w-full bg-white px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
              >
                {CANVAS_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground block">Font</label>
              <select
                value={booklet.fontFamily}
                onChange={(e) => updateBooklet(booklet.id, { fontFamily: e.target.value })}
                className="w-full bg-white px-4 py-2 rounded-xl border-2 border-border focus:border-primary focus:outline-none"
                style={{ fontFamily: booklet.fontFamily }}
              >
                {FONT_FAMILY_OPTIONS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <PaperButton type="button" variant="ghost" onClick={() => setIsSettingsOpen(false)}>
                Close
              </PaperButton>
              <PaperButton type="submit">Save</PaperButton>
            </div>
          </form>
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
                <AlertTriangle className="w-3.5 h-3.5" /> Not backed up
              </div>
            )}
          </div>
        </div>

        <div className={cn('grid gap-1 mt-2', pages.length > 0 ? 'grid-cols-4' : 'grid-cols-3')}>
          {pages.length > 0 && (
            <ToolbarAction
              icon={<Plus className="w-5 h-5" />}
              label="Add Page"
              onClick={handleAddPage}
              testId="toolbar-add-page"
            />
          )}
          <ToolbarAction
            icon={isExportingBooklet ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            label={isExportingBooklet ? 'Backing up...' : 'Backup'}
            onClick={handleExportBooklet}
            disabled={isExportingBooklet}
            testId="toolbar-backup"
          />
          <ToolbarAction
            icon={isRestoringBooklet ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            label={isRestoringBooklet ? 'Restoring...' : 'Restore'}
            onClick={() => restoreFileInputRef.current?.click()}
            disabled={isRestoringBooklet}
            testId="toolbar-restore"
          />
          <ToolbarAction icon={<Settings className="w-5 h-5" />} label="Settings" onClick={openSettings} testId="toolbar-settings" />
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

      <div className="flex flex-col gap-4 pt-4">
        {backupError && (
          <div className="bg-destructive/10 text-destructive border-2 border-destructive/20 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-bold">{backupError}</p>
          </div>
        )}

        {pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-border rounded-xl bg-card">
            <ImagePlus className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">It's empty in here</h3>
            <p className="text-muted-foreground mb-6">Add your first photo to start building your story.</p>
            <PaperButton onClick={handleAddPage} size="lg">
              <Plus className="w-6 h-6 mr-2" />
              Add First Page
            </PaperButton>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground -mt-1">Drag a page by its grip handle to reorder it, or tap it to open.</p>
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
                        {page.stamps.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 -space-x-2">
                            {page.stamps.slice(0, 4).map((s) => (
                              <img
                                key={s.id}
                                src={s.stamp.pngDataUrl}
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

        {pages.length > 0 && <div className="h-24" /> /* spacer so content clears the fixed bottom bar */}
      </div>

      {pages.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t-2 border-border flex justify-center z-20">
          <div className="flex gap-3 w-full max-w-sm">
            <PaperButton
              type="button"
              variant="outline"
              className="flex-1 shadow-lg"
              onClick={() => setPreviewIndex(0)}
              data-testid="open-preview"
            >
              <Eye className="w-5 h-5 mr-2" />
              Preview
            </PaperButton>
            <PaperButton
              type="button"
              variant="primary"
              className="flex-1 shadow-lg"
              onClick={() => setIsExportOpen(true)}
              data-testid="open-export"
            >
              <Share2 className="w-5 h-5 mr-2" />
              Export
            </PaperButton>
          </div>
        </div>
      )}

      {previewIndex !== null && (
        <PagePreview booklet={booklet} pages={pages} initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      )}
    </div>
  );
}
