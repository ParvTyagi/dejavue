'use client';

import { ExternalLink, ShieldCheck, Sparkle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT } from '@/components/ui/motion';
import { DATE_TRUST_LABEL, displayDate, ENGINE_LABEL } from '@/lib/client/labels';
import type { Evidence } from '@/lib/shared/types';
import { ENGINE_ICON } from './icons';

/** Evidence cards that slide in as each engine answers; confirmed matches first. */
export function EvidenceFeed({ evidence, firstSeenId, searching }: { evidence: Evidence[]; firstSeenId?: string; searching: boolean }) {
  const ordered = searching ? evidence : [...evidence].sort((a, b) => Number(!!b.match?.confirmed) - Number(!!a.match?.confirmed));

  return (
    <div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {ordered.map((ev) => (
            <EvidenceCard key={ev.id} ev={ev} firstSeen={ev.id === firstSeenId} />
          ))}
        </AnimatePresence>
      </ul>
      {searching && (
        <div className="mt-2 space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="relative h-16 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="absolute inset-y-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" style={{ animationDelay: `${i * 0.3}s` }} />
            </div>
          ))}
        </div>
      )}
      {!searching && evidence.length === 0 && <p className="text-sm text-muted">No search results were found.</p>}
    </div>
  );
}

function EvidenceCard({ ev, firstSeen }: { ev: Evidence; firstSeen: boolean }) {
  const Icon = ENGINE_ICON[ev.engine];
  const confirmed = ev.match?.confirmed;
  const similarity = ev.match ? Math.max(0, 1 - ev.match.hamming / 32) : undefined;

  return (
    <motion.li
      id={`ev-${ev.id}`}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className={`group relative scroll-mt-28 overflow-hidden rounded-xl border bg-black/20 p-3.5 transition-colors hover:bg-surface-2 target:border-accent ${
        confirmed ? 'border-good/25' : 'border-line'
      }`}
    >
      {confirmed && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-good" />}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-faint">{ev.id}</span>
            <span className="text-faint">·</span>
            <span className="text-muted">{ENGINE_LABEL[ev.engine]}</span>
            {confirmed && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.15 }}
                className="flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-good"
              >
                <ShieldCheck className="size-3" /> same image
              </motion.span>
            )}
            {ev.match && !confirmed && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-faint">similar only</span>}
            {ev.trustedSource && <span className="rounded-full bg-info-soft px-2 py-0.5 text-info">trusted archive</span>}
            {firstSeen && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-warn">
                <Sparkle className="size-3" /> first seen
              </motion.span>
            )}
          </div>
          <a
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-1 flex items-start gap-1.5 text-sm font-medium break-words text-ink decoration-accent/60 underline-offset-4 hover:underline"
          >
            {ev.title ?? ev.url}
            <ExternalLink className="mt-1 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </a>
          <p className="mt-0.5 text-xs text-faint">
            {ev.domain} · {ev.publishedAt ? `${displayDate(ev.publishedAt)} (${DATE_TRUST_LABEL[ev.dateTrust]})` : 'undated'}
          </p>
        </div>
        {similarity !== undefined && (
          <div className="hidden w-20 shrink-0 text-right sm:block" title={`Hamming distance ${ev.match!.hamming} of 64`}>
            <p className={`font-mono text-xs ${confirmed ? 'text-good' : 'text-faint'}`}>{Math.round(similarity * 100)}%</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className={`h-full rounded-full ${confirmed ? 'bg-good' : 'bg-faint'}`}
                initial={{ width: 0 }}
                animate={{ width: `${similarity * 100}%` }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.li>
  );
}
