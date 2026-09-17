'use client';

import { ImageOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { EASE_OUT } from '@/components/ui/motion';
import type { Evidence } from '@/lib/shared/types';

const BITS = 64;

/** Replay fixtures use reserved .invalid hosts, which can never load. */
const loadable = (src?: string) => {
  try {
    return !!src && !new URL(src, 'https://x').hostname.endsWith('.invalid');
  } catch {
    return false;
  }
};

function Thumb({ src, label }: { src?: string; label: string }) {
  const [broken, setBroken] = useState(!loadable(src));
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="relative size-14 overflow-hidden rounded-lg border border-line bg-surface-2">
        {src && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-faint" title="No preview available">
            <ImageOff className="size-4" />
          </span>
        )}
      </div>
      <figcaption className="text-[10px] text-faint">{label}</figcaption>
    </figure>
  );
}

/** The input and a search result's thumbnail side by side, with their perceptual-hash distance. */
export function MatchCompare({ ev, inputPreview }: { ev: Evidence; inputPreview?: string }) {
  if (!ev.match) return null;
  const { hamming, confirmed } = ev.match;
  const similarity = 1 - hamming / BITS;

  return (
    <div className="flex shrink-0 items-start gap-2" title={`Hamming distance ${hamming} of ${BITS} bits (same image at 10 or less)`}>
      <Thumb src={inputPreview} label="yours" />
      <div className="flex w-16 flex-col items-center pt-3">
        <span className={`font-mono text-xs ${confirmed ? 'text-good' : 'text-faint'}`}>{Math.round(similarity * 100)}%</span>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${confirmed ? 'bg-good' : 'bg-faint'}`}
            initial={{ width: 0 }}
            animate={{ width: `${similarity * 100}%` }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
          />
        </div>
        <span className="mt-1 font-mono text-[10px] text-faint">Δ {hamming}/{BITS}</span>
      </div>
      <Thumb src={ev.thumbnailUrl} label="match" />
    </div>
  );
}
