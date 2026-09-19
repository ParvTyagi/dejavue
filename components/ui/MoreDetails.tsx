'use client';

import { ChevronRight } from 'lucide-react';

/**
 * Optional fields, folded away until someone wants them.
 *
 * Every check here has one thing it actually needs and several it can work without. Those
 * extras sharpen a verdict when they are given, and asking for them up front turns a
 * one-field form into a questionnaire, so they live behind this.
 *
 * Built on `<details>`, so it opens without JavaScript, keyboard support comes free, and
 * the browser's own find-in-page can reach the fields inside it.
 */
export function MoreDetails({
  summary = 'Add details',
  hint,
  children,
}: {
  summary?: string;
  /** What the extras are, in a few words, so the label alone is enough to decide. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-line bg-surface/60 open:bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-sm text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        <span className="font-medium">{summary}</span>
        {hint && <span className="hidden truncate text-xs text-faint sm:inline">— {hint}</span>}
      </summary>
      <div className="space-y-3 border-t border-line px-3.5 py-3.5">{children}</div>
    </details>
  );
}
