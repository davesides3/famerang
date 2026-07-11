import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a byte estimate as a rounded, human-friendly size (e.g. "~32 MB"). */
export function formatEstimatedSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  return `~${Math.round(mb)} MB`;
}