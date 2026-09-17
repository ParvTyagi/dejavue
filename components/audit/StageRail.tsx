'use client';

import { Check, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Stage } from '@/lib/shared/types';
import { STAGE_ICON } from './icons';

type StepState = 'done' | 'active' | 'pending' | 'skipped' | 'failed';

/** Vertical progress rail with a filling connector and per-step states. */
// Takes only what it reads, so evidence and credit events don't re-render it.
export function StageRail({
  stages,
  stage,
  finished,
  fatal,
  skipped,
}: {
  stages: { id: Stage; label: string; detail: string }[];
  stage?: Stage;
  finished: boolean;
  fatal?: unknown;
  /** Steps the finished result says were not needed. */
  skipped?: (id: Stage) => boolean;
}) {
  const current = finished ? stages.length : Math.max(0, stages.findIndex((s) => s.id === stage));

  const stepState = (i: number): StepState => {
    if (finished && skipped?.(stages[i].id)) return 'skipped';
    if (i < current) return 'done';
    if (i === current) return fatal ? 'failed' : 'active';
    return 'pending';
  };

  const progress = Math.min(1, current / (stages.length - 1));

  return (
    <ol className="relative">
      <div className="absolute top-3 bottom-3 left-[13px] w-px bg-line" aria-hidden />
      <motion.div
        aria-hidden
        className="absolute top-3 left-[13px] w-px origin-top bg-accent"
        style={{ bottom: 12 }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: progress }}
        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
      />
      {stages.map((step, i) => {
        const st = stepState(i);
        const Icon = STAGE_ICON[step.id];
        return (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            <span
              className={`relative z-10 flex size-[27px] shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
                st === 'done'
                  ? 'border-accent bg-accent text-accent-ink'
                  : st === 'active'
                    ? 'border-accent bg-bg text-accent'
                    : st === 'failed'
                      ? 'border-bad bg-bg text-bad'
                      : 'border-line bg-bg text-faint'
              }`}
            >
              {st === 'active' && <span className="absolute inset-0 animate-pulse-ring rounded-full border border-accent" />}
              <AnimatePresence mode="wait" initial={false}>
                {st === 'done' ? (
                  <motion.span key="done" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
                    <Check className="size-3.5" strokeWidth={3} />
                  </motion.span>
                ) : st === 'active' ? (
                  <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Loader2 className="size-3.5 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Icon className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm transition-colors ${st === 'pending' || st === 'skipped' ? 'text-faint' : 'text-ink'} ${st === 'skipped' ? 'line-through' : ''}`}>
                {step.label}
              </p>
              <p className="text-xs text-faint">{st === 'skipped' ? 'Not needed' : step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
