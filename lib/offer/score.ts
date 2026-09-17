import type { FlagStrength, OfferConfidence, OfferSignals, OfferVerdict, RedFlag } from './types';

// NO_RED_FLAGS stays below the High band (80): finding nothing wrong is never strong proof.
const CAP: Record<OfferVerdict, number> = {
  LIKELY_SCAM: 99,
  NO_RED_FLAGS: 75,
  UNVERIFIED: 40,
};

const FLAG_POINTS: Record<FlagStrength, number> = { strong: 45, medium: 25, weak: 5 };

const FLAG_LABEL: Record<RedFlag['id'], string> = {
  payment_request: 'Asks for money up front',
  lookalike_domain: 'Uses a look-alike website',
  reported_contact: 'Contact is reported as a scam',
  free_email: 'Uses a personal email address',
  chat_only: 'Only reachable on chat apps',
  unofficial_link: 'Links to a site that is not the official one',
  urgency: 'Pressure to act fast',
};

/** Additive, capped confidence score with the reason behind every point. */
export function scoreOffer(signals: OfferSignals, verdict: OfferVerdict, flags: RedFlag[]): OfferConfidence {
  const reasons: { label: string; points: number }[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });

  if (verdict === 'LIKELY_SCAM') {
    for (const f of flags) add(FLAG_LABEL[f.id], FLAG_POINTS[f.strength]);
  } else {
    if (signals.officialDomain) add(`Official site found: ${signals.officialDomain}`, 20);
    if (signals.listingFound) add(signals.type === 'govt_scheme' ? 'Scheme appears on a government site' : 'Matching listing found', 25);
    if (signals.contacts.some((c) => c.onOfficialSite === true)) add('Contact appears on the official site', 25);
    if (!flags.some((f) => f.strength !== 'weak')) add('No warning signs found', 10);
    for (const f of flags) if (f.strength === 'weak') add(FLAG_LABEL[f.id], -FLAG_POINTS.weak);
  }

  for (const engine of signals.enginesFailed) add(`${engine} failed or timed out`, -10);

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  const value = Math.max(0, Math.min(CAP[verdict], raw));
  const band = value >= 80 ? 'High' : value >= 50 ? 'Medium' : 'Low';
  return { value, band, reasons };
}
