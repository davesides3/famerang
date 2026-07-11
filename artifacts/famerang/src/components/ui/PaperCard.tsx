import React from 'react';
import { cn } from '@/lib/utils';

export function PaperCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground border-2 border-border rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}