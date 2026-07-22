import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BookPlus, Trash2, CalendarDays, Layers, AlertTriangle } from 'lucide-react';
import { useBooklets, createBooklet, deleteBooklet } from '@/lib/hooks';
import { PaperCard } from '@/components/ui/PaperCard';
import { PaperButton } from '@/components/ui/PaperButton';
import { CANVAS_SIZES } from '@/lib/types';
import { format } from 'date-fns';
import famerangLogo from '@/assets/famerang-logo.png';
import { useHeaderNavHidden } from '@/components/layout/AppLayout';

export function Home() {
  const booklets = useBooklets();
  const [, setLocation] = useLocation();
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useHeaderNavHidden(isCreating);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const bk = await createBooklet({ title: newTitle.trim() });
    setLocation(`/booklet/${bk.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this booklet?')) {
      await deleteBooklet(id);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif font-bold text-foreground">My Booklets</h1>
        {!isCreating && (
          <PaperButton size="sm" onClick={() => setIsCreating(true)}>
            <BookPlus className="w-5 h-5 mr-2" />
            New
          </PaperButton>
        )}
      </div>

      {isCreating && (
        <PaperCard className="bg-primary/5 border-primary/20 animate-in zoom-in-95">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <h2 className="text-xl font-bold font-serif text-primary">New Booklet</h2>
            <input
              type="text"
              placeholder="e.g. Summer at the Cabin"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-white text-gray-900 px-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:outline-none transition-colors"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <PaperButton type="button" variant="ghost" onClick={() => setIsCreating(false)}>
                Cancel
              </PaperButton>
              <PaperButton type="submit" disabled={!newTitle.trim()}>
                Create
              </PaperButton>
            </div>
          </form>
        </PaperCard>
      )}

      {isCreating ? null : booklets?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-border rounded-xl bg-card">
          <img src={famerangLogo} alt="" className="w-24 h-24 object-contain mb-4 opacity-70" />
          <h3 className="text-xl font-bold text-foreground mb-2">No booklets yet</h3>
          <p className="text-muted-foreground mb-6">Create your first keepsake to start adding photos and stamps.</p>
          <PaperButton onClick={() => setIsCreating(true)}>
            <BookPlus className="w-5 h-5 mr-2" />
            Make a Booklet
          </PaperButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {booklets?.map((booklet) => (
            <Link key={booklet.id} href={`/booklet/${booklet.id}`} className="block">
              <PaperCard className="group hover:-translate-y-1 hover:shadow-[0_8px_0_0_rgba(0,0,0,0.05)] transition-all cursor-pointer relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1 pr-8">
                    {booklet.title}
                  </h3>
                  <button
                    onClick={(e) => handleDelete(e, booklet.id)}
                    className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                    aria-label="Delete booklet"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4" />
                    {format(new Date(booklet.updatedAt), 'MMM d, yyyy')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    {CANVAS_SIZES.find(s => s.value === booklet.canvasSize)?.label || 'Square'}
                  </div>
                </div>

                {booklet.updatedAt > (booklet.lastBackedUpAt ?? 0) && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Not backed up
                  </div>
                )}
              </PaperCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}