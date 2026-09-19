'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/ui/motion';
import type { ScoreReason, Verdict } from '@/lib/shared/types';
import { Panel } from './Panel';

export const MEDIA_SCORE_CAP: Record<Verdict, number> = { RECYCLED: 99, MISPLACED: 99, CONSISTENT: 85, CONTEXT_PLAUSIBLE: 60, UNVERIFIED: 40 };

/** Every point behind the confidence score, as growing bars. */
export function ScorePanel({ reasons, cap }: { reasons: ScoreReason[]; cap: number }) {
  // Bars are scaled to the largest reason, so 45-point warning signs and 10-point hints both read clearly.
  const scale = Math.max(15, ...reasons.map((r) => Math.abs(r.points)));
  return (
    <Panel title="Why this confidence" subtitle={`What raised and lowered the score · capped at ${cap} for this verdict`}>
      {reasons.length === 0 ? (
        <p className="text-sm text-muted">No evidence earned points.</p>
      ) : (
        <ul className="space-y-3">
          {reasons.map((r, i) => (
            <li key={i}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted">{r.label}</span>
                <span className={`font-mono ${r.points < 0 ? 'text-bad' : 'text-good'}`}>
                  {r.points > 0 ? '+' : ''}
                  {r.points}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className={`h-full rounded-full ${r.points < 0 ? 'bg-bad' : 'bg-good'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (Math.abs(r.points) / scale) * 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
