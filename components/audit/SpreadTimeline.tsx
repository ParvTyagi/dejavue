'use client';

import { CircleHelp } from 'lucide-react';
import { motion } from 'motion/react';
import { DATE_TRUST_LABEL, displayDate, ENGINE_LABEL } from '@/lib/client/labels';
import type { SpreadTimeline as Spread } from '@/lib/leak/types';

/**
 * Where and when public copies appeared, earliest first. Entries drop in as each copy is
 * confirmed, so the list fills while the searches are still running.
 *
 * The first entry is marked as the earliest copy *found*, never as an origin: a public
 * copy is only ever the first one a search engine can see.
 */
export function SpreadTimeline({ timeline, live }: { timeline: Spread; live?: boolean }) {
  const { entries, undated } = timeline;

  if (entries.length === 0 && undated.length === 0) {
    return (
      <p className="py-6 text-sm text-muted">
        {live ? 'Waiting for the first confirmed copy…' : 'No public copy of this document was confirmed, so there is no spread to show.'}
      </p>
    );
  }

  return (
    <div>
      {entries.length > 0 && (
        <ol className="relative space-y-4 border-l border-line pl-6">
          {entries.map((e, i) => (
            <motion.li
              key={e.evidenceId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.06, 0.5) }}
              className="relative"
            >
              <span
                aria-hidden
                className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-bg ${e.isEarliest ? 'bg-warn' : 'bg-good'}`}
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <time dateTime={e.at} className="font-mono text-sm text-ink">
                  {displayDate(e.at)}
                </time>
                {e.isEarliest && (
                  <span className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-[10px] text-warn">
                    earliest public copy found
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm break-all text-muted">
                <a href={`#ev-${e.evidenceId}`} className="text-ink underline-offset-2 hover:underline">
                  {e.domain}
                </a>{' '}
                <span className="text-faint">
                  · {ENGINE_LABEL[e.engine]} · {DATE_TRUST_LABEL[e.dateTrust]}
                </span>
              </p>
            </motion.li>
          ))}
        </ol>
      )}

      {undated.length > 0 && (
        <div className={entries.length > 0 ? 'mt-6 border-t border-line pt-4' : ''}>
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <CircleHelp className="size-3.5" /> Date unknown — these copies exist, but nothing dates them, so they are not placed on the
            timeline.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {undated.map((u) => (
              <li key={u.evidenceId}>
                <a
                  href={`#ev-${u.evidenceId}`}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  {u.domain}
                  <span className="text-faint">{ENGINE_LABEL[u.engine]}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
