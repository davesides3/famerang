import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { ChevronLeft, GripVertical } from 'lucide-react';
import { useBooklet, usePagesWithStamps, reorderPages } from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';

export function ReorderPages() {
  const [, params] = useRoute('/booklet/:id/order');
  const id = params?.id;
  
  const booklet = useBooklet(id);
  const serverPages = usePagesWithStamps(id);
  
  // Local state for dragging
  const [pages, setPages] = useState(serverPages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  React.useEffect(() => {
    if (serverPages && draggedIdx === null) {
      setPages(serverPages);
    }
  }, [serverPages, draggedIdx]);

  if (!booklet || !serverPages) return null;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires setting data
    e.dataTransfer.setData('text/html', e.currentTarget.parentNode?.toString() || '');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedIdx === null || draggedIdx === index) return;
    
    const newPages = [...pages];
    const draggedItem = newPages[draggedIdx];
    newPages.splice(draggedIdx, 1);
    newPages.splice(index, 0, draggedItem);
    
    setDraggedIdx(index);
    setPages(newPages);
  };

  const handleDragEnd = async () => {
    setDraggedIdx(null);
    if (!id) return;
    // Persist new order
    await reorderPages(id, pages.map(p => p.id));
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center gap-3">
        <Link href={`/booklet/${id}`}>
          <PaperButton variant="ghost" size="icon" className="shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </PaperButton>
        </Link>
        <h1 className="text-2xl font-serif font-bold text-foreground">Reorder Pages</h1>
      </div>

      <div className="flex flex-col gap-3">
        {pages.map((page, index) => (
          <div 
            key={page.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-4 bg-card border-2 border-border p-3 rounded-xl cursor-move transition-all ${draggedIdx === index ? 'opacity-50 border-primary border-dashed shadow-none' : 'shadow-[0_4px_0_0_rgba(0,0,0,0.05)] hover:-translate-y-0.5'}`}
          >
            <div className="text-muted-foreground flex shrink-0 items-center justify-center">
              <GripVertical className="w-5 h-5" />
            </div>
            <div className="font-bold text-muted-foreground w-6 text-center">
              {index + 1}
            </div>
            <div className="w-16 h-16 bg-muted rounded-md border border-border overflow-hidden shrink-0 flex items-center justify-center">
              {page.photoDataUrl ? (
                <img src={page.photoDataUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs text-muted-foreground font-bold">Empty</div>
              )}
            </div>
            <div className="flex-1 truncate font-serif text-lg">
              {page.textContent || <span className="text-muted-foreground italic">No caption</span>}
            </div>
          </div>
        ))}

        {pages.length === 0 && (
          <div className="text-center py-10 text-muted-foreground font-bold">
            No pages to reorder yet.
          </div>
        )}
      </div>
    </div>
  );
}