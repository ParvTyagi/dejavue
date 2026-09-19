import { describe, expect, it } from 'vitest';
import { claimAssertsDate, decide } from '@/lib/verdict/rules';
import { mapsAgrees, sceneLocationQuery } from '@/lib/orchestrator/pipeline';
import { score } from '@/lib/verdict/score';
import { OFFER_VERDICT_LABEL, VERDICT_LABEL } from '@/lib/client/labels';
import type { Claim, Evidence, Signals } from '@/lib/shared/types';

const CLAIMED_AT = '2026-03-10T12:00:00.000Z';
const OLD = '2019-06-01T00:00:00.000Z';

function claim(over: Partial<Claim> = {}): Claim {
  return {
    rawText: 'Flood water in the streets',
    claimedAt: CLAIMED_AT,
    claimedAtSource: 'user',
    refersToPast: false,
    ...over,
  };
}

const match = (id: string, domain: string, publishedAt?: string): Evidence => ({
  id,
  engine: 'google_lens',
  kind: 'visual_match',
  url: `https://${domain}/p`,
  domain,
  dateTrust: publishedAt ? 'absolute_text' : 'none',
  publishedAt,
  trustedSource: false,
  match: { hamming: 2, confirmed: true },
});

function signals(over: Partial<Signals> = {}): Signals {
  const confirmedMatches = over.confirmedMatches ?? [match('a', 'one.example', OLD), match('b', 'two.example', OLD)];
  return {
    claim: claim(),
    confirmedMatches,
    firstSeen: { at: OLD, evidenceId: 'a' },
    location: 'unchecked',
    newsCorroborates: false,
    enginesUsed: [],
    enginesFailed: [],
    enginesSkipped: [],
    ...over,
  };
}

describe('recycled needs a claim to contradict', () => {
  it('stands when the user gave a date', () => {
    const d = decide(signals());
    expect(d.verdict).toBe('RECYCLED');
    expect(d.flags).toEqual({ recycled: true, misplaced: false, predatesClaim: true });
  });

  it('stands when no date was given but the text claims the media is from now', () => {
    const s = signals({
      claim: claim({ rawText: 'Flash flood hits Uttarakhand today, houses washed away', claimedAtSource: 'default_now' }),
    });
    expect(decide(s).verdict).toBe('RECYCLED');
  });

  it('reports the older copy as a fact when nothing at all was claimed about the date', () => {
    const s = signals({ claim: claim({ rawText: 'Beautiful view of the river', claimedAtSource: 'default_now' }) });
    const d = decide(s);
    expect(d.verdict).toBe('UNVERIFIED');
    // The finding is kept; only the accusation is dropped.
    expect(d.flags).toEqual({ recycled: false, misplaced: false, predatesClaim: true });
  });

  it('does not let an older copy be read as confirmation of a claim', () => {
    const s = signals({
      claim: claim({ rawText: 'Beautiful view of the river', claimedAtSource: 'default_now' }),
      location: 'agrees',
    });
    expect(decide(s).verdict).not.toBe('CONSISTENT');
  });

  it('reads Hinglish recency words too', () => {
    expect(claimAssertsDate(claim({ rawText: 'Abhi ka video hai Delhi se', claimedAtSource: 'default_now' }))).toBe(true);
    expect(claimAssertsDate(claim({ rawText: 'Nadi ka sundar drishya', claimedAtSource: 'default_now' }))).toBe(false);
  });
});

describe('the model cannot clear a recycled photo on its own', () => {
  it('honours refersToPast when the text backs it up', () => {
    const s = signals({
      claim: claim({ rawText: 'Remembering the 2019 floods, six years on', refersToPast: true, referencedYear: 2019 }),
    });
    expect(decide(s).verdict).toBe('UNVERIFIED');
    expect(decide(s).flags.recycled).toBe(false);
  });

  it('ignores a bare refersToPast that nothing in the text supports', () => {
    const s = signals({ claim: claim({ rawText: 'Flood water in the streets right now', refersToPast: true }) });
    expect(decide(s).verdict).toBe('RECYCLED');
  });

  it('does not read any four-digit number as a reference to an older event', () => {
    // A casualty count, a house count and a rupee amount are not years.
    for (const text of ['Flood today, 2000 houses washed away', 'Rs 2500 relief announced', '1500 stranded at the station']) {
      const s = signals({ claim: claim({ rawText: text, refersToPast: true }) });
      expect(decide(s).verdict, text).toBe('RECYCLED');
    }
  });

  it('will not treat a claim about right now as a claim about an older event', () => {
    const s = signals({
      claim: claim({ rawText: 'Breaking: floods hit the city today, 2019 homes damaged', refersToPast: true, referencedYear: 2019 }),
    });
    expect(decide(s).verdict).toBe('RECYCLED');
  });

  it('keeps the older-copy finding even when the claim accounts for it', () => {
    // The post is honest, so it is not recycled — but the copy really is older, and
    // that fact must not depend on what the model said.
    const s = signals({
      claim: claim({ rawText: 'Remembering the 2019 floods, six years on', refersToPast: true, referencedYear: 2019 }),
      location: 'agrees',
    });
    const d = decide(s);
    expect(d.flags).toEqual({ recycled: false, misplaced: false, predatesClaim: true });
    // An acknowledged older copy does not block confirming the claim.
    expect(d.verdict).toBe('CONSISTENT');
  });

  it('reads recency words in the script they are forwarded in', () => {
    const hindi = claim({ rawText: 'आज बंगाल में पुलिस लाठीचार्ज, वीडियो देखें', claimedAtSource: 'default_now' });
    expect(claimAssertsDate(hindi)).toBe(true);
    const bengali = claim({ rawText: 'এখন কলকাতায় ভারী বৃষ্টি', claimedAtSource: 'default_now' });
    expect(claimAssertsDate(bengali)).toBe(true);
    const undated = claim({ rawText: 'गंगा नदी का सुंदर दृश्य', claimedAtSource: 'default_now' });
    expect(claimAssertsDate(undated)).toBe(false);
  });
});

describe('scoring a location that rests on EXIF alone', () => {
  it('takes points off, so it cannot reach the same confidence as a resolved one', () => {
    const base = signals({ location: 'mismatch', sceneGeoSource: 'maps' });
    const exif = signals({ location: 'mismatch', sceneGeoSource: 'exif' });
    const withMaps = score(base, 'MISPLACED').value;
    const withExif = score(exif, 'MISPLACED').value;
    expect(withExif).toBeLessThan(withMaps);
    expect(score(exif, 'MISPLACED').reasons).toContainEqual({
      label: 'Scene location comes only from editable photo GPS',
      points: -20,
    });
  });
});

describe('locating the scene without trusting the model to be right', () => {
  it('asks Maps about a landmark the model is unsure of, instead of dropping it', () => {
    expect(sceneLocationQuery({ signText: [], landmarks: [{ name: 'Howrah Station', confidence: 0.6 }] })).toBe('Howrah Station');
  });

  it('falls back to text read off a sign when no landmark is named', () => {
    expect(sceneLocationQuery({ signText: ['Jeddah Islamic Port', 'Gate 4'], landmarks: [] })).toBe('Jeddah Islamic Port Gate 4');
  });

  it('prefers text read off a sign to a landmark the model hedged', () => {
    // The old ordering let any landmark, at any confidence, block the sign-text
    // fallback entirely.
    const q = sceneLocationQuery({ signText: ['Jeddah Islamic Port'], landmarks: [{ name: 'Atlantis Tower', confidence: 0.2 }] });
    expect(q).toBe('Jeddah Islamic Port');
  });

  it('still falls back to a hedged landmark when no sign is legible', () => {
    expect(sceneLocationQuery({ signText: [], landmarks: [{ name: 'Howrah Station', confidence: 0.2 }] })).toBe('Howrah Station');
  });

  it('prefers the landmark the model is most sure of', () => {
    const q = sceneLocationQuery({
      signText: ['Platform 9'],
      landmarks: [
        { name: 'Some Tower', confidence: 0.4 },
        { name: 'Howrah Bridge', confidence: 0.9 },
      ],
    });
    expect(q).toBe('Howrah Bridge');
  });

  it('has nothing to ask when the scene reading is empty or failed', () => {
    expect(sceneLocationQuery({ signText: [], landmarks: [] })).toBeUndefined();
    expect(sceneLocationQuery(undefined)).toBeUndefined();
  });

  it('accepts a Maps answer that matches the name it was asked about', () => {
    expect(mapsAgrees('Howrah Station', { lat: 22.58, lng: 88.34, label: 'Howrah Station', scale: 'poi' })).toBe(true);
  });

  it('throws away a Maps answer for somewhere else, so a made-up landmark cannot place a scene', () => {
    expect(mapsAgrees('Atlantis Convention Centre', { lat: 19, lng: 72, label: 'Mumbai', scale: 'city' })).toBe(false);
  });
});

describe('the enum names never reach a reader', () => {
  const labels = [...Object.entries(VERDICT_LABEL), ...Object.entries(OFFER_VERDICT_LABEL)];

  it.each(labels)('%s reads as plain language, not as a constant', (verdict, label) => {
    for (const text of [label.stamp, label.title]) {
      expect(text).not.toBe(verdict);
      expect(text).not.toMatch(/_/);
      // No SHOUTING_CASE tokens like CONTEXT or PLAUSIBLE left in the copy.
      expect(text).not.toMatch(/\b[A-Z]{3,}\b/);
    }
  });

  it('covers every verdict, so nothing can fall through to its raw name', () => {
    expect(Object.keys(VERDICT_LABEL).sort()).toEqual(
      ['CONSISTENT', 'CONTEXT_PLAUSIBLE', 'MISPLACED', 'RECYCLED', 'UNVERIFIED'].sort(),
    );
    expect(Object.keys(OFFER_VERDICT_LABEL).sort()).toEqual(['LIKELY_SCAM', 'NO_RED_FLAGS', 'UNVERIFIED'].sort());
  });
});
