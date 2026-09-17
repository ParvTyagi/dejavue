'use client';

import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { humanizeEngines } from '@/lib/client/labels';

interface Notice {
  id: number;
  message: string;
}

const VISIBLE_MS = 6_000;

/** Non-fatal audit problems pop up briefly while the audit keeps going. */
export function Toaster({ notices }: { notices: Notice[] }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const timers = notices
      .filter((n) => !dismissed.has(n.id))
      .map((n) => setTimeout(() => setDismissed((d) => new Set(d).add(n.id)), VISIBLE_MS));
    return () => timers.forEach(clearTimeout);
  }, [notices, dismissed]);

  const visible = notices.filter((n) => !dismissed.has(n.id)).slice(-3);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {visible.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-warn/30 bg-[#16130c]/95 p-3 text-sm shadow-2xl shadow-black/60 backdrop-blur"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <p className="flex-1 text-ink">{humanizeEngines(n.message)}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed((d) => new Set(d).add(n.id))}
              className="text-faint transition-colors hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
