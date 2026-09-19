import * as chrono from 'chrono-node';
import type { DateTrust, Evidence } from '@/lib/shared/types';

const DAY_MS = 86_400_000;
const EARLIEST_PLAUSIBLE = Date.UTC(1995, 0, 1);
const RELATIVE = /\b(ago|yesterday|today|last\s+(week|month|year))\b/i;

export interface ExtractedDate {
  publishedAt?: string;
  dateTrust: DateTrust;
}

/**
 * Picks the most trustworthy date available for a search result:
 * page metadata (ISO), then an absolute date in text, then a relative string
 * resolved against the time the search was fetched.
 */
export function extractDate(fields: { iso?: string; text?: string[] }, fetchedAt: Date): ExtractedDate {
  if (fields.iso) {
    const t = Date.parse(fields.iso);
    if (!Number.isNaN(t)) return { publishedAt: new Date(t).toISOString(), dateTrust: 'metadata' };
  }
  for (const text of fields.text ?? []) {
    if (!text || RELATIVE.test(text)) continue;
    const parsed = chrono.parse(text, { instant: fetchedAt, timezone: 'UTC' })[0];
    if (parsed && parsed.start.isCertain('year')) {
      return { publishedAt: parsed.start.date().toISOString(), dateTrust: 'absolute_text' };
    }
  }
  for (const text of fields.text ?? []) {
    if (!text || !RELATIVE.test(text)) continue;
    const parsed = chrono.parseDate(text, { instant: fetchedAt, timezone: 'UTC' });
    if (parsed) return { publishedAt: parsed.toISOString(), dateTrust: 'relative_text' };
  }
  return { dateTrust: 'none' };
}

export interface FirstSeen {
  firstSeen?: { at: string; evidenceId: string };
  dateSpreadDays?: number;
}

/**
 * Whether a search result's date can be used at all: present, trusted, after the web
 * existed and not in the future. Shared by T₀ and the leak spread timeline so both
 * discard the same dates.
 */
export function hasUsableDate(e: Evidence, now: Date): boolean {
  if (!e.publishedAt || e.dateTrust === 'none') return false;
  const t = Date.parse(e.publishedAt);
  return t >= EARLIEST_PLAUSIBLE && t <= now.getTime();
}

/**
 * Robust T₀: the earliest confirmed-match date that is backed by a second
 * confirmed match within 30 days, or by a trusted archive on its own.
 */
export function computeFirstSeen(confirmed: Evidence[], now: Date): FirstSeen {
  let dated = confirmed.filter((e) => hasUsableDate(e, now));
  if (dated.some((e) => e.dateTrust !== 'relative_text')) {
    dated = dated.filter((e) => e.dateTrust !== 'relative_text');
  }
  if (dated.length === 0) return {};

  const sorted = [...dated].sort((a, b) => Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!));
  const spread = Date.parse(sorted[sorted.length - 1].publishedAt!) - Date.parse(sorted[0].publishedAt!);
  const dateSpreadDays = Math.floor(spread / DAY_MS);

  for (const candidate of sorted) {
    const t = Date.parse(candidate.publishedAt!);
    const supported =
      candidate.trustedSource ||
      sorted.some(
        (other) =>
          other.id !== candidate.id &&
          other.domain !== candidate.domain &&
          Math.abs(Date.parse(other.publishedAt!) - t) <= 30 * DAY_MS,
      );
    if (supported) return { firstSeen: { at: candidate.publishedAt!, evidenceId: candidate.id }, dateSpreadDays };
  }
  return { dateSpreadDays };
}

export function deltaTDays(claimedAt: string, firstSeenAt: string): number {
  return Math.floor((Date.parse(claimedAt) - Date.parse(firstSeenAt)) / DAY_MS);
}

export function isOlderThan48h(firstSeenAt: string, claimedAt: string): boolean {
  return Date.parse(claimedAt) - Date.parse(firstSeenAt) > 2 * DAY_MS;
}
