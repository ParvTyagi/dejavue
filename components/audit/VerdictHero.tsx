'use client';

import { Info } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT, NumberTicker } from '@/components/ui/motion';
import { OFFER_VERDICT_LABEL, TONE_VAR, VERDICT_LABEL, type Tone } from '@/lib/client/labels';
import type { OfferDossier } from '@/lib/offer/types';
import type { Dossier } from '@/lib/shared/types';

/** What the verdict card shows, for a media audit or an offer check. */
export interface VerdictView {
  stamp: string;
  title: string;
  tone: Tone;
  /** A second stamp, such as Misplaced on a recycled photo. */
  extraStamp?: { text: string; tone: Tone };
  summary: string;
  bullets: { text: string; evidenceIds: string[] }[];
  /** Shown in warning colour when the searches did not all run. */
  partialNote?: string;
  /** Advice that applies whatever the verdict. */
  advice?: string;
  template: boolean;
  limitations: string[];
  confidence: { value: number; band: string };
}

export function mediaVerdictView(d: Dossier): VerdictView {
  const label = VERDICT_LABEL[d.verdict];
  return {
    ...label,
    extraStamp: d.flags.recycled
      ? d.flags.misplaced
        ? { text: 'Misplaced', tone: 'warn' }
        : undefined
      : d.flags.predatesClaim
        ? { text: 'Older copy exists', tone: 'warn' }
        : undefined,
    summary: d.narrative.summary,
    bullets: d.narrative.bullets,
    partialNote: d.metrics.partial ? 'Partial audit: searches ran out, timed out or were rate-limited before all engines ran.' : undefined,
    template: d.narrative.source === 'template',
    limitations: d.limitations,
    confidence: d.confidence,
  };
}

export function offerVerdictView(d: OfferDossier): VerdictView {
  return {
    ...OFFER_VERDICT_LABEL[d.verdict],
    summary: d.narrative.summary,
    bullets: d.narrative.bullets,
    partialNote: d.metrics.partial ? 'Partial check: some searches failed or were skipped, so fewer warning signs could be checked.' : undefined,
    advice: d.advice,
    template: d.narrative.source === 'template',
    limitations: d.limitations,
    confidence: d.confidence,
  };
}

/** The verdict lands like a rubber stamp; confidence fills its ring. */
export function VerdictHero({ view }: { view: VerdictView }) {
  const color = TONE_VAR[view.tone];

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE_OUT }}
      className="relative mt-8 overflow-hidden rounded-3xl border bg-surface p-6 sm:p-8"
      style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}
    >
      <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, scale: 2.2, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.15 }}
            className="inline-block rounded-lg border-2 px-3 py-1 font-mono text-xs font-bold tracking-[0.25em] uppercase"
            style={{ borderColor: color, color }}
          >
            {view.stamp}
          </motion.div>
          {view.extraStamp && (
            <motion.span
              initial={{ opacity: 0, scale: 1.8, rotate: 10 }}
              animate={{ opacity: 1, scale: 1, rotate: 3 }}
              transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.35 }}
              className="ml-3 inline-block rounded-lg border-2 px-3 py-1 font-mono text-xs font-bold tracking-[0.25em] uppercase"
              style={{ borderColor: TONE_VAR[view.extraStamp.tone], color: TONE_VAR[view.extraStamp.tone] }}
            >
              {view.extraStamp.text}
            </motion.span>
          )}

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
            className="mt-5 font-serif text-4xl leading-none sm:text-6xl"
          >
            {view.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: EASE_OUT }}
            className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
          >
            {view.summary}
          </motion.p>

          {view.bullets.length > 0 && (
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.6 } } }}
              className="mt-5 space-y-2"
            >
              {view.bullets.map((b, i) => (
                <motion.li
                  key={i}
                  variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                  className="flex gap-3 text-sm text-ink"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span>
                    {b.text}{' '}
                    {b.evidenceIds.map((eid) => (
                      <a
                        key={eid}
                        href={`#ev-${eid}`}
                        className="ml-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-accent hover:text-accent"
                      >
                        {eid}
                      </a>
                    ))}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          )}
          {view.advice && (
            <p className="mt-5 rounded-xl border px-4 py-3 text-sm font-medium text-ink" style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}>
              {view.advice}
            </p>
          )}
          {view.partialNote && <p className="mt-4 text-sm font-medium text-warn">{view.partialNote}</p>}
          {view.template && <p className="mt-4 text-xs text-faint">Explanation generated from the evidence without AI.</p>}
          <ul className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-faint">
            {view.limitations.map((l) => (
              <li key={l} className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-3 shrink-0" /> {l}
              </li>
            ))}
          </ul>
        </div>

        <ConfidenceRing value={view.confidence.value} band={view.confidence.band} color={color} />
      </div>
    </motion.section>
  );
}

function ConfidenceRing({ value, band, color }: { value: number; band: string; color: string }) {
  const r = 58;
  return (
    <div className="mx-auto shrink-0 text-center md:mx-0" role="img" aria-label={`Confidence ${value} out of 100, ${band}`}>
      <div className="relative mx-auto size-40">
        <svg viewBox="0 0 140 140" className="size-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
          <motion.circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: value / 100 }}
            transition={{ duration: 1.4, delay: 0.4, ease: EASE_OUT }}
          />
          {Array.from({ length: 40 }, (_, i) => (
            <line
              key={i}
              x1="70"
              y1="4"
              x2="70"
              y2={i % 10 === 0 ? 10 : 7}
              stroke="var(--line-strong)"
              strokeWidth="1"
              transform={`rotate(${i * 9} 70 70)`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-5xl leading-none">
            <NumberTicker value={value} />
          </span>
          <span className="mt-1 text-[11px] text-faint">out of 100</span>
        </div>
      </div>
      {/* Outside the ring: the band never has to fit inside the stroke. */}
      <p className="mt-3 text-xs tracking-wide text-muted">
        <span className="font-medium text-ink capitalize">{band}</span> confidence
      </p>
    </div>
  );
}
