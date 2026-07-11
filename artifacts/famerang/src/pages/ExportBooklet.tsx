import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { ChevronLeft, FileDown, FileArchive, Loader2 } from 'lucide-react';
import { useBooklet, usePagesWithStamps } from '@/lib/hooks';
import { PaperButton } from '@/components/ui/PaperButton';
import { PaperCard } from '@/components/ui/PaperCard';
import { generateDraftPdf } from '@/lib/pdf';
import { exportPageImagesZip } from '@/lib/zipExport';
import { shareOrDownloadFile } from '@/lib/share';

export function ExportBooklet() {
  const [, params] = useRoute('/booklet/:id/export');
  const id = params?.id;

  const booklet = useBooklet(id);
  const pages = usePagesWithStamps(id);

  const [isExporting, setIsExporting] = useState<'pdf' | 'zip' | null>(null);

  if (!booklet || !pages) return null;

  const handleExportPdf = async () => {
    try {
      setIsExporting('pdf');
      const blob = await generateDraftPdf(booklet, pages);
      const filename = `${booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-draft.pdf`;
      await shareOrDownloadFile(blob, filename, 'application/pdf');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportZip = async () => {
    try {
      setIsExporting('zip');
      const blob = await exportPageImagesZip(booklet, pages);
      const filename = `${booklet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-pages.zip`;
      await shareOrDownloadFile(blob, filename, 'application/zip');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in">
      <div className="flex items-center gap-3">
        <Link href={`/booklet/${id}`}>
          <PaperButton variant="ghost" size="icon" className="shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </PaperButton>
        </Link>
        <h1 className="text-2xl font-serif font-bold text-foreground line-clamp-1">Export: {booklet.title}</h1>
      </div>

      <div className="grid gap-4">
        <PaperCard className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-secondary/10 rounded-xl text-secondary">
              <FileDown className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Draft PDF</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A quick 1-up layout optimized for home printers. Perfect for handing to a grandparent or previewing the flow.
              </p>
            </div>
          </div>
          <PaperButton 
            variant="secondary" 
            onClick={handleExportPdf}
            disabled={isExporting !== null || pages.length === 0}
          >
            {isExporting === 'pdf' ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileDown className="w-5 h-5 mr-2" />}
            {isExporting === 'pdf' ? 'Generating...' : 'Export PDF'}
          </PaperButton>
        </PaperCard>

        <PaperCard className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <FileArchive className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-bold text-lg">High-Res Images (ZIP)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every page composited at full print resolution. Ideal for sending to a professional photo book printing service.
              </p>
            </div>
          </div>
          <PaperButton 
            variant="primary" 
            onClick={handleExportZip}
            disabled={isExporting !== null || pages.length === 0}
          >
            {isExporting === 'zip' ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileArchive className="w-5 h-5 mr-2" />}
            {isExporting === 'zip' ? 'Packaging...' : 'Export ZIP'}
          </PaperButton>
        </PaperCard>
      </div>
    </div>
  );
}