import type { Dossier, ScoreReason, Signals, Verdict } from '@/lib/shared/types';

const CAP: Record<Verdict, number> = {
  RECYCLED: 99,
  MISPLACED: 99,
  CONSISTENT: 85,
  CONTEXT_PLAUSIBLE: 60,
  UNVERIFIED: 40,
};

/** Additive, capped confidence score with the reasons behind every point. */
export function score(signals: Signals, verdict: Verdict): Dossier['confidence'] {
  const reasons: ScoreReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });

  const confirmed = signals.confirmedMatches;
  const counted = Math.min(confirmed.length, 3);
  for (let i = 0; i < counted; i++) add(`Confirmed visual match on ${confirmed[i].domain}`, 15);

  const engines = new Set(confirmed.map((e) => e.engine));
  if (engines.size >= 2) add('Matches from 2+ independent search indexes', 15);

  const earliest = signals.firstSeen && confirmed.find((e) => e.id === signals.firstSeen!.evidenceId);
  if (earliest?.trustedSource) add('Earliest match is from a trusted archive', 10);
  if (earliest?.dateTrust === 'metadata') add('Earliest date comes from page metadata', 10);

  if (signals.sceneResolvedByMaps) add('Scene text or landmark located on Google Maps', 10);
  if (signals.newsCorroborates) add('News coverage corroborates the event', 10);

  // A location that rests only on EXIF rests on a field anyone can edit, so a
  // verdict built on it does not get to claim the same confidence as a resolved one.
  if (signals.sceneGeoSource === 'exif') add('Scene location comes only from editable photo GPS', -20);

  if ((signals.dateSpreadDays ?? 0) > 30) add('Sources disagree on the date by more than 30 days', -15);
  for (const engine of signals.enginesFailed) add(`${engine} failed or timed out`, -10);

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  const value = Math.max(0, Math.min(CAP[verdict], raw));
  const band = value >= 80 ? 'High' : value >= 50 ? 'Medium' : 'Low';
  return { value, band, reasons };
}
