'use client';

import { Info } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT, NumberTicker } from '@/components/ui/motion';
import { TONE_VAR, VERDICT_LABEL } from '@/lib/client/labels';
import type { Dossier } from '@/lib/shared/types';

/** The verdict lands like a rubber stamp; confidence fills its ring. */
export function VerdictHero({ dossier }: { dossier: Dossier }) {
  const label = VERDICT_LABEL[dossier.verdict];
  const color = TONE_VAR[label.tone];

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
            {label.stamp}
          </motion.div>
          {dossier.flags.recycled && dossier.flags.misplaced && (
            <motion.span
              initial={{ opacity: 0, scale: 1.8, rotate: 10 }}
              animate={{ opacity: 1, scale: 1, rotate: 3 }}
              transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.35 }}
              className="ml-3 inline-block rounded-lg border-2 border-warn px-3 py-1 font-mono text-xs font-bold tracking-[0.25em] text-warn uppercase"
            >
              Misplaced
            </motion.span>
          )}

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
            className="mt-5 font-serif text-4xl leading-none sm:text-6xl"
          >
            {label.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: EASE_OUT }}
            className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
          >
            {dossier.narrative.summary}
          </motion.p>

          {dossier.narrative.bullets.length > 0 && (
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.6 } } }}
              className="mt-5 space-y-2"
            >
              {dossier.narrative.bullets.map((b, i) => (
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
          {dossier.metrics.partial && (
            <p className="mt-4 text-sm font-medium text-warn">Partial audit: searches ran out, timed out or were rate-limited before all engines ran.</p>
          )}
          {dossier.narrative.source === 'template' && <p className="mt-4 text-xs text-faint">Explanation generated from the evidence without AI.</p>}
          <ul className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-faint">
            {dossier.limitations.map((l) => (
              <li key={l} className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-3 shrink-0" /> {l}
              </li>
            ))}
          </ul>
        </div>

        <ConfidenceRing value={dossier.confidence.value} band={dossier.confidence.band} color={color} />
      </div>
    </motion.section>
  );
}

function ConfidenceRing({ value, band, color }: { value: number; band: string; color: string }) {
  const r = 58;
  return (
    <div className="relative mx-auto size-44 shrink-0 md:mx-0" role="img" aria-label={`Confidence ${value} out of 100, ${band}`}>
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
        <span className="mt-1 text-[11px] tracking-wide text-faint uppercase">{band} confidence</span>
      </div>
    </div>
  );
}
