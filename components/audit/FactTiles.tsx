'use client';

import { CalendarClock, History, Ruler } from 'lucide-react';
import { motion } from 'motion/react';
import { NumberTicker } from '@/components/ui/motion';
import { displayDate } from '@/lib/client/labels';
import type { Dossier } from '@/lib/shared/types';

export function FactTiles({ dossier }: { dossier: Dossier }) {
  const s = dossier.signals;
  const tiles = [
    {
      icon: History,
      color: 'var(--warn)',
      label: 'First seen',
      value: s.firstSeen ? displayDate(s.firstSeen.at) : '—',
      hint:
        s.deltaTDays !== undefined ? (
          <>
            <NumberTicker value={Math.abs(s.deltaTDays)} /> days {s.deltaTDays >= 0 ? 'before' : 'after'} the claim
          </>
        ) : (
          'No dated, confirmed copy'
        ),
      highlight: (s.deltaTDays ?? 0) > 2,
    },
    {
      icon: CalendarClock,
      color: 'var(--teal)',
      label: 'Claimed',
      value: displayDate(s.claim.claimedAt),
      hint: s.claim.place ?? 'No place given',
      highlight: false,
    },
    {
      icon: Ruler,
      color: 'var(--violet)',
      label: 'Scene vs. claim',
      value: s.deltaSKm !== undefined ? <><NumberTicker value={s.deltaSKm} /> km</> : '—',
      hint: s.sceneGeo ? `Scene: ${s.sceneGeo.label}` : 'Scene not located',
      highlight: s.location === 'mismatch',
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      className="grid gap-3 sm:grid-cols-3"
    >
      {tiles.map((t) => (
        <motion.div
          key={t.label}
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className={`rounded-2xl border p-4 ${t.highlight ? 'border-warn/30 bg-warn-soft' : 'border-line bg-surface'}`}
        >
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <t.icon className="size-3.5" style={{ color: t.color }} /> {t.label}
          </p>
          <p className="mt-2 font-serif text-3xl leading-none">{t.value}</p>
          <p className={`mt-2 text-xs ${t.highlight ? 'text-warn' : 'text-muted'}`}>{t.hint}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
