import { hasUsableDate } from '@/lib/evidence/dates';
import type { Evidence } from '@/lib/shared/types';
import type { SpreadTimeline, TimelineEntry, UndatedCopy } from './types';

/**
 * One dated public copy, or undefined when the copy carries no date we would trust.
 * The pipeline streams these as they are confirmed, so the page fills in while the
 * searches are still running.
 */
export function toTimelineEntry(e: Evidence, now: Date, isEarliest = false): TimelineEntry | undefined {
  if (!hasUsableDate(e, now)) return undefined;
  return { evidenceId: e.id, at: e.publishedAt!, dateTrust: e.dateTrust, domain: e.domain, engine: e.engine, isEarliest };
}

/**
 * The spread of a leaked image across the public web, built from confirmed matches only.
 *
 * Copies with no usable date are kept in their own group rather than being given a
 * guessed position on the axis: an invented date on a leak timeline is exactly the kind
 * of thing that gets read as "this is when it leaked".
 */
export function buildSpreadTimeline(
  confirmed: Evidence[],
  now: Date,
  firstSeen?: { evidenceId: string },
): SpreadTimeline {
  const entries: TimelineEntry[] = [];
  const undated: UndatedCopy[] = [];
  for (const e of confirmed) {
    const entry = toTimelineEntry(e, now, e.id === firstSeen?.evidenceId);
    if (entry) entries.push(entry);
    else undated.push({ evidenceId: e.id, domain: e.domain, engine: e.engine });
  }
  // Earliest first, and evidence id breaks ties so the same evidence always renders
  // in the same order.
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.evidenceId.localeCompare(b.evidenceId));
  undated.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  return { entries, undated };
}
