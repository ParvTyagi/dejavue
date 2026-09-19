import type { LeakConfidence, LeakSignals, LeakVerdict } from './types';
import type { ScoreReason } from '@/lib/shared/types';

// LEAK_NOT_FOUND is capped low on purpose: search engines do not index Telegram,
// private groups, paste sites or dark web forums, so finding no public copy is weak
// evidence about anything.
export const LEAK_SCORE_CAP: Record<LeakVerdict, number> = {
  LEAK_RECYCLED: 99,
  LEAK_EARLIEST_FOUND: 85,
  LEAK_NOT_FOUND: 40,
};

const IMAGE_ENGINES = ['google_lens', 'bing_reverse_image', 'yandex_images'] as const;

/** Additive, capped confidence score with the reasons behind every point, as media audits do. */
export function scoreLeak(s: LeakSignals, verdict: LeakVerdict): LeakConfidence {
  const reasons: ScoreReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });

  const confirmed = s.confirmedMatches;
  const counted = Math.min(confirmed.length, 3);
  for (let i = 0; i < counted; i++) add(`Confirmed visual match on ${confirmed[i].domain}`, 15);

  const engines = new Set(confirmed.map((e) => e.engine));
  if (engines.size >= 2) add('Matches from 2+ independent search indexes', 15);

  const earliest = s.firstSeen && confirmed.find((e) => e.id === s.firstSeen!.evidenceId);
  if (earliest?.trustedSource) add('Earliest match is from a trusted archive', 10);

  // Confidence in a "not found" rests entirely on how completely we looked, so it is
  // only earned when every reverse-image index actually answered.
  const allIndexesRan = IMAGE_ENGINES.every((e) => s.enginesUsed.includes(e)) && s.enginesFailed.length === 0;
  if (!s.firstSeen && confirmed.length === 0 && allIndexesRan) {
    add('All three reverse-image indexes were searched and found nothing', 20);
  }

  if ((s.dateSpreadDays ?? 0) > 30) add('Sources disagree on the date by more than 30 days', -15);
  for (const engine of s.enginesFailed) add(`${engine} failed or timed out`, -10);

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  const value = Math.max(0, Math.min(LEAK_SCORE_CAP[verdict], raw));
  const band = value >= 80 ? 'High' : value >= 50 ? 'Medium' : 'Low';
  return { value, band, reasons };
}
