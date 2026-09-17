'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { EASE_OUT } from '@/components/ui/motion';
import { DATE_TRUST_LABEL, displayDate } from '@/lib/client/labels';
import type { Dossier, Evidence } from '@/lib/shared/types';

const W = 600;
const H = 150;
const PAD = 28;
const AXIS = 96;

/** Dated evidence on a time axis: the axis draws, dots drop in, the claim marker lands last. */
export function Timeline({ dossier }: { dossier: Dossier }) {
  const [hover, setHover] = useState<Evidence>();
  const claimed = Date.parse(dossier.signals.claim.claimedAt);
  const points = dossier.evidence.filter((e) => e.publishedAt).map((e) => ({ e, t: Date.parse(e.publishedAt!) }));

  if (points.length === 0) {
    return <p className="flex h-40 items-center justify-center text-sm text-muted">No dated evidence, so there is no timeline to show.</p>;
  }

  const times = [...points.map((p) => p.t), claimed];
  const MIN_SPAN = 14 * 86_400_000;
  const rawMin = Math.min(...times);
  const rawMax = Math.max(...times);
  const pad = Math.max(0, (MIN_SPAN - (rawMax - rawMin)) / 2);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min;
  const x = (t: number) => PAD + ((t - min) / span) * (W - 2 * PAD);
  const firstSeenId = dossier.signals.firstSeen?.evidenceId;
  const firstSeen = points.find((p) => p.e.id === firstSeenId);

  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Timeline of dated evidence and the claimed date">
          <motion.line
            x1={PAD}
            x2={W - PAD}
            y1={AXIS}
            y2={AXIS}
            stroke="var(--line-strong)"
            strokeWidth={1.5}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
          />
          {firstSeen && (
            <motion.rect
              x={x(firstSeen.t)}
              y={AXIS - 3}
              height={6}
              rx={3}
              fill="url(#gap)"
              initial={{ width: 0 }}
              animate={{ width: Math.max(0, x(claimed) - x(firstSeen.t)) }}
              transition={{ duration: 1.2, delay: 0.7, ease: EASE_OUT }}
            />
          )}
          <defs>
            <linearGradient id="gap" x1="0" x2="1">
              <stop offset="0" stopColor="var(--warn)" stopOpacity="0.6" />
              <stop offset="1" stopColor="var(--bad)" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {points.map(({ e, t }, i) => {
            const confirmed = !!e.match?.confirmed;
            const first = e.id === firstSeenId;
            const cy = AXIS - 16 - (i % 3) * 16;
            return (
              <motion.g
                key={e.id}
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.4 + i * 0.07 }}
                onPointerEnter={() => setHover(e)}
                onPointerLeave={() => setHover(undefined)}
                className="cursor-pointer"
              >
                <line x1={x(t)} x2={x(t)} y1={cy} y2={AXIS} stroke="var(--line)" />
                {first && <circle cx={x(t)} cy={cy} r={12} fill="var(--warn)" opacity={0.18} />}
                <circle
                  cx={x(t)}
                  cy={cy}
                  r={first ? 6.5 : 5}
                  fill={confirmed ? (first ? 'var(--warn)' : 'var(--good)') : 'var(--bg)'}
                  stroke={confirmed ? 'none' : 'var(--muted)'}
                  strokeWidth={1.5}
                />
              </motion.g>
            );
          })}

          <motion.g initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.9 }}>
            <line x1={x(claimed)} x2={x(claimed)} y1={18} y2={AXIS + 14} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(claimed)} y={12} textAnchor={x(claimed) > W - 60 ? 'end' : 'middle'} fontSize={11} fill="var(--bad)" fontFamily="var(--font-geist-mono)">
              claimed
            </text>
          </motion.g>

          <text x={PAD} y={H - 8} fontSize={11} fill="var(--faint)" fontFamily="var(--font-geist-mono)">
            {displayDate(new Date(min).toISOString())}
          </text>
          <text x={W - PAD} y={H - 8} textAnchor="end" fontSize={11} fill="var(--faint)" fontFamily="var(--font-geist-mono)">
            {displayDate(new Date(max).toISOString())}
          </text>
        </svg>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute top-0 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-lg border border-line-strong bg-bg/95 px-3 py-1.5 text-xs shadow-xl"
          >
            <span className="font-mono text-faint">{hover.id}</span> · {hover.domain} · {displayDate(hover.publishedAt)}{' '}
            <span className="text-faint">({DATE_TRUST_LABEL[hover.dateTrust]})</span>
            {hover.match && <span className={hover.match.confirmed ? 'text-good' : 'text-faint'}> · {hover.match.confirmed ? 'same image' : 'similar only'}</span>}
          </motion.div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-faint">
        <Legend className="bg-warn" label="first seen" />
        <Legend className="bg-good" label="confirmed copy" />
        <Legend className="border border-muted" label="similar or article" />
      </figcaption>
    </figure>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
