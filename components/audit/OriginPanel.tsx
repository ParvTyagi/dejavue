'use client';

import { Info } from 'lucide-react';
import { motion } from 'motion/react';
import { ORIGIN_SKIP_LABEL } from '@/lib/client/labels';
import type { OriginHint } from '@/lib/leak/types';
import { Panel } from './Panel';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Which public copy looks least degraded. Labelled as a hint everywhere it appears,
 * because it is one: a large, clean copy can still have been posted long after a small
 * cropped one, so none of this reaches the verdict or the score.
 */
export function OriginPanel({ origin }: { origin: OriginHint }) {
  const { ranked, fetched, skipped } = origin;
  const subtitle = `${fetched} full-size image${fetched === 1 ? '' : 's'} measured · no searches spent`;

  return (
    <Panel title="Likely closest to the original" subtitle={subtitle}>
      <p className="flex items-start gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        A hint, not evidence. It compares how much each copy has been resized, recompressed and cropped — not when it appeared.
      </p>

      {ranked.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No full-size copy could be measured, so there is nothing to compare.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {ranked.map((copy, i) => (
            <motion.li
              key={copy.evidenceId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className={`rounded-xl border p-3 ${i === 0 ? 'border-accent/40 bg-accent/[0.06]' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={`#ev-${copy.evidenceId}`} className="text-sm break-all text-ink underline-offset-2 hover:underline">
                  {copy.domain}
                </a>
                {i === 0 && <span className="text-[10px] tracking-wide text-accent uppercase">likely closest</span>}
              </div>
              <p className="mt-1 font-mono text-[11px] text-faint">
                {copy.width} × {copy.height}
                {copy.jpegQuality !== undefined && ` · quality ≈ ${copy.jpegQuality}`}
                {` · shows ${percent(copy.coverage)} of the scene`}
              </p>
              {copy.reasons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {copy.reasons.map((reason) => (
                    <span key={reason} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted">
                      {reason}
                    </span>
                  ))}
                </div>
              )}
            </motion.li>
          ))}
        </ol>
      )}

      {skipped.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-faint">
          {skipped.map((s) => (
            <li key={s.evidenceId}>
              <span className="font-mono">{s.evidenceId}</span> not measured: {ORIGIN_SKIP_LABEL[s.reason]}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
