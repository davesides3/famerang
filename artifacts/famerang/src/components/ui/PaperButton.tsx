import React from 'react';
import { cn } from '@/lib/utils';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const PaperButton = React.forwardRef<HTMLButtonElement, Props>(({ className, variant = 'primary', size = 'md', ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none select-none",
        {
          "bg-primary text-primary-foreground border-2 border-primary/20 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1": variant === 'primary',
          "bg-secondary text-secondary-foreground border-2 border-secondary/20 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1": variant === 'secondary',
          "bg-transparent border-2 border-border text-foreground hover:bg-muted shadow-[0_4px_0_0_rgba(0,0,0,0.05)] active:shadow-none active:translate-y-1": variant === 'outline',
          "bg-destructive text-destructive-foreground border-2 border-destructive/20 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1": variant === 'destructive',
          "bg-transparent text-foreground hover:bg-muted/50": variant === 'ghost',
          "px-3 py-1.5 text-sm": size === 'sm',
          "px-4 py-2 text-base": size === 'md',
          "px-6 py-3 text-lg": size === 'lg',
          "p-2 aspect-square": size === 'icon',
        },
        className
      )}
      {...props}
    />
  );
});

PaperButton.displayName = "PaperButton";