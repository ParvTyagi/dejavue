'use client';

import { AnimatePresence, motion } from 'motion/react';
import { NumberTicker } from '@/components/ui/motion';
import { DEFAULT_MAX_CREDITS, ENGINE_LABEL } from '@/lib/client/labels';
import type { AuditState } from '@/lib/client/useAuditStream';
import { ENGINE_COLOR, ENGINE_ICON } from './icons';
import { Panel } from './Panel';

/** Live SerpApi search meter: six slots that fill as searches are spent. */
// Takes only the fields it reads, so evidence and stage events don't re-render it.
export function CreditMeter(state: Pick<AuditState, 'credits' | 'maxCredits' | 'shortCircuit' | 'creditLog'>) {
  const used = state.credits;
  const MAX = state.maxCredits ?? DEFAULT_MAX_CREDITS;
  return (
    <Panel title="SerpApi searches" subtitle={`Budget of ${MAX} per audit`}>
      <div className="flex items-end justify-between">
        <p className="font-serif text-5xl leading-none">
          <NumberTicker value={used} />
          <span className="ml-1 text-2xl text-faint">/{MAX}</span>
        </p>
        {state.shortCircuit && (
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent">
            −{state.shortCircuit.creditsSaved} saved
          </motion.span>
        )}
      </div>
      <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))` }}>
        {Array.from({ length: MAX }, (_, i) => (
          <div key={i} className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: i < used ? 1 : 0 }}
              style={{ originX: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            />
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5">
        <AnimatePresence initial={false}>
          {state.creditLog.map((c, i) => {
            const Icon = ENGINE_ICON[c.engine];
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                className="flex items-center gap-2 text-xs text-muted"
              >
                <Icon className="size-3.5" style={{ color: ENGINE_COLOR[c.engine] }} />
                {ENGINE_LABEL[c.engine]}
                <span className="ml-auto font-mono text-faint">{c.cached ? 'cached' : `#${i + 1}`}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}
