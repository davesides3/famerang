import React, { useState } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { ChevronLeft, Plus, Settings, ListOrdered, Share, ImagePlus, FileImage } from 'lucide-react';
import { useBooklet, usePagesWithStamps, createPage, updateBooklet } from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { CANVAS_SIZES, FONT_FAMILY_OPTIONS } from '@/lib/types';

export function BookletHub() {
  const [, params] = useRoute('/booklet/:id');
  const [, setLocation] = useLocation();
  const id = params?.id;

  const booklet = useBooklet(id);
  const pages = usePagesWithStamps(id);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  if (!booklet || !pages) return null;

  const handleAddPage = async () => {
    if (!id) return;
    const page = await createPage(id);
    setLocation(`/booklet/${id}/page/${page.id}`);
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

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <PaperButton variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="w-6 h-6" />
            </PaperButton>
          </Link>
          <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">{booklet.title}</h1>
        </div>
        <PaperButton variant="ghost" size="icon" onClick={openSettings}>
          <Settings className="w-5 h-5" />
        </PaperButton>
      </div>

      {isSettingsOpen && (
        <PaperCard className="bg-muted/50">
          <form onSubmit={saveSettings} className="flex flex-col gap-4">
            <h3 className="font-bold text-lg font-serif">Booklet Settings</h3>
            
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
                {CANVAS_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                {FONT_FAMILY_OPTIONS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <PaperButton type="button" variant="ghost" onClick={() => setIsSettingsOpen(false)}>Close</PaperButton>
              <PaperButton type="submit">Save</PaperButton>
            </div>
          </form>
        </PaperCard>
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
          <div className="grid grid-cols-2 gap-4">
            {pages.map((page, i) => (
              <Link key={page.id} href={`/booklet/${id}/page/${page.id}`}>
                <PaperCard className="aspect-square flex items-center justify-center p-2 cursor-pointer hover:border-primary/50 transition-colors relative group overflow-hidden bg-white">
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-background border-2 border-border flex items-center justify-center text-xs font-bold z-10 text-muted-foreground">
                    {i + 1}
                  </div>
                  {page.photoDataUrl ? (
                    <img src={page.photoDataUrl} alt="Thumbnail" className="w-full h-full object-cover rounded-md opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <FileImage className="w-12 h-12 text-muted-foreground/30" />
                  )}
                  {page.stamps.length > 0 && (
                    <div className="absolute bottom-2 right-2 flex -space-x-2">
                      {page.stamps.slice(0, 3).map(s => (
                        <img key={s.id} src={s.stamp.pngDataUrl} className="w-6 h-6 rounded-full border border-white bg-white/50" />
                      ))}
                    </div>
                  )}
                </PaperCard>
              </Link>
            ))}
            
            <PaperButton 
              variant="outline" 
              className="aspect-square flex flex-col gap-2 items-center justify-center h-full border-dashed border-4 bg-transparent text-muted-foreground hover:bg-muted/30"
              onClick={handleAddPage}
            >
              <Plus className="w-8 h-8" />
              <span className="font-bold">Add Page</span>
            </PaperButton>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t-2 border-border flex justify-center gap-4 z-20">
            <Link href={`/booklet/${id}/order`}>
              <PaperButton variant="secondary" className="px-8 shadow-lg">
                <ListOrdered className="w-5 h-5 mr-2" />
                Reorder
              </PaperButton>
            </Link>
            <Link href={`/booklet/${id}/export`}>
              <PaperButton variant="primary" className="px-8 shadow-lg">
                <Share className="w-5 h-5 mr-2" />
                Export
              </PaperButton>
            </Link>
          </div>
          <div className="h-16" /> {/* spacer */}
        </>
      )}
    </div>
  );
}