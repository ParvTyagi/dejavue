'use client';

import { motion } from 'motion/react';
import { ENGINE_LABEL, SKIP_REASON_LABEL } from '@/lib/client/labels';
import type { Dossier } from '@/lib/shared/types';
import { ENGINE_ICON } from './icons';
import { Panel } from './Panel';

export function EnginePanel({ dossier }: { dossier: Dossier }) {
  const { enginesUsed, enginesFailed, enginesSkipped } = dossier.signals;
  const rows = [
    ...enginesUsed.map((e) => ({ e, status: 'used', cls: 'text-good bg-good-soft' })),
    ...enginesFailed.map((e) => ({ e, status: 'failed', cls: 'text-bad bg-bad-soft' })),
    ...enginesSkipped.map((s) => ({ e: s.engine, status: `skipped · ${SKIP_REASON_LABEL[s.reason]}`, cls: 'text-warn bg-warn-soft' })),
  ];
  const m = dossier.metrics;
  const sceneTags = [...new Set([...dossier.scene.landmarks, ...dossier.scene.text].map((t) => t.trim()).filter(Boolean))];

  return (
    <Panel title="Search engines" subtitle={`Tiers ${m.tiersRun.join(', ') || 'none'} · ${(m.totalMs / 1000).toFixed(1)} s${m.cacheHit ? ' · cached evidence' : ''}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No searches were needed.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ e, status, cls }, i) => {
            const Icon = ENGINE_ICON[e];
            return (
              <motion.li
                key={`${e}-${status}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex items-center gap-2 text-sm"
              >
                <Icon className="size-4 text-faint" />
                <span className="text-ink">{ENGINE_LABEL[e]}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{status}</span>
              </motion.li>
            );
          })}
        </ul>
      )}
      {sceneTags.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs text-faint">Read from the scene</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sceneTags.map((t, i) => (
              <span key={i} className="rounded-md border border-line px-2 py-0.5 text-xs text-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
