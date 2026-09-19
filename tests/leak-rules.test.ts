import { describe, expect, it } from 'vitest';
import { LEAK_VERDICT_LABEL } from '@/lib/client/labels';
import { decideLeak } from '@/lib/leak/rules';
import { LEAK_ADVICE, LEAK_LIMITATIONS, type LeakSignals, type LeakVerdict } from '@/lib/leak/types';
import { LEAK_SCORE_CAP, scoreLeak } from '@/lib/leak/score';
import type { Claim, Evidence } from '@/lib/shared/types';

const CLAIMED_AT = '2026-03-10T12:00:00.000Z';
const OLD = '2024-06-01T00:00:00.000Z';

const claim = (over: Partial<Claim> = {}): Claim => ({
  rawText: 'Internal memo leaked today from Northwind Logistics',
  claimedAt: CLAIMED_AT,
  claimedAtSource: 'user',
  refersToPast: false,
  ...over,
});

const copy = (id: string, domain: string, publishedAt?: string, over: Partial<Evidence> = {}): Evidence => ({
  id,
  engine: 'google_lens',
  kind: 'visual_match',
  url: `https://${domain}/p`,
  domain,
  dateTrust: publishedAt ? 'absolute_text' : 'none',
  publishedAt,
  trustedSource: false,
  match: { hamming: 2, confirmed: true },
  ...over,
});

function signals(over: Partial<LeakSignals> = {}): LeakSignals {
  const confirmedMatches = over.confirmedMatches ?? [copy('a', 'one.example', OLD), copy('b', 'two.example', OLD)];
  return {
    claim: claim(),
    confirmedMatches,
    firstSeen: { at: OLD, evidenceId: 'a' },
    timeline: { entries: [], undated: [] },
    enginesUsed: ['google_lens'],
    enginesFailed: [],
    enginesSkipped: [],
    ...over,
  };
}

describe('LEAK_RECYCLED needs a claim to contradict', () => {
  it('stands when the user gave a date and public copies are older than it', () => {
    const d = decideLeak(signals());
    expect(d.verdict).toBe('LEAK_RECYCLED');
    expect(d.flags).toEqual({ predatesClaim: true, recycled: true, copiesFound: true, undatedOnly: false });
  });

  it('stands when no date was given but the text says the leak is from now', () => {
    const s = signals({
      claim: claim({ rawText: 'Breaking: payroll file just leaked from Northwind', claimedAtSource: 'default_now' }),
    });
    expect(decideLeak(s).verdict).toBe('LEAK_RECYCLED');
  });

  it('reports the older copy as a fact when the date field was left blank', () => {
    const s = signals({ claim: claim({ rawText: 'Northwind Logistics payroll file', claimedAtSource: 'default_now' }) });
    const d = decideLeak(s);
    // The date is unclaimed, so an older copy contradicts nothing: no accusation, but the finding is kept.
    expect(d.verdict).toBe('LEAK_EARLIEST_FOUND');
    expect(d.flags).toMatchObject({ recycled: false, predatesClaim: true });
  });

  it('does not flag a post that openly says the leak is an old one', () => {
    const s = signals({
      claim: claim({
        rawText: 'Throwback to the Northwind payroll dump from 2024, going round again',
        claimedAtSource: 'default_now',
        refersToPast: true,
        referencedYear: 2024,
      }),
    });
    const d = decideLeak(s);
    expect(d.verdict).toBe('LEAK_EARLIEST_FOUND');
    expect(d.flags.recycled).toBe(false);
  });

  it('reads Hinglish recency words too', () => {
    const s = signals({
      claim: claim({ rawText: 'Northwind ka internal memo abhi leak hua hai', claimedAtSource: 'default_now' }),
    });
    expect(decideLeak(s).verdict).toBe('LEAK_RECYCLED');
  });
});

describe('the other two verdicts', () => {
  it('reports the earliest public copy when T0 does not contradict the claim', () => {
    const recent = '2026-03-10T06:00:00.000Z';
    const s = signals({
      confirmedMatches: [copy('a', 'one.example', recent), copy('b', 'two.example', recent)],
      firstSeen: { at: recent, evidenceId: 'a' },
    });
    const d = decideLeak(s);
    expect(d.verdict).toBe('LEAK_EARLIEST_FOUND');
    expect(d.flags).toEqual({ predatesClaim: false, recycled: false, copiesFound: true, undatedOnly: false });
  });

  it('finds nothing when no copy was confirmed', () => {
    const d = decideLeak(signals({ confirmedMatches: [], firstSeen: undefined }));
    expect(d.verdict).toBe('LEAK_NOT_FOUND');
    expect(d.flags).toEqual({ predatesClaim: false, recycled: false, copiesFound: false, undatedOnly: false });
  });

  it('does not invent a date when every copy is undated', () => {
    const d = decideLeak(
      signals({ confirmedMatches: [copy('a', 'one.example'), copy('b', 'two.example')], firstSeen: undefined }),
    );
    // There is no T0, so there is no timeline to report - but copies were found, and the flag says so.
    expect(d.verdict).toBe('LEAK_NOT_FOUND');
    expect(d.flags).toMatchObject({ copiesFound: true, undatedOnly: true, predatesClaim: false });
  });

  it('never accuses on undated copies alone, however recent the claim says the leak is', () => {
    const s = signals({
      claim: claim({ rawText: 'Leaked today from Northwind' }),
      confirmedMatches: [copy('a', 'one.example'), copy('b', 'two.example')],
      firstSeen: undefined,
    });
    expect(decideLeak(s).flags.recycled).toBe(false);
  });
});

describe('leak scoring', () => {
  it('explains every point and caps by verdict', () => {
    const s = signals({
      confirmedMatches: [
        copy('a', 'one.example', OLD, { trustedSource: true }),
        copy('b', 'two.example', OLD, { engine: 'bing_reverse_image' }),
      ],
    });
    const c = scoreLeak(s, 'LEAK_RECYCLED');
    expect(c.reasons).toEqual([
      { label: 'Confirmed visual match on one.example', points: 15 },
      { label: 'Confirmed visual match on two.example', points: 15 },
      { label: 'Matches from 2+ independent search indexes', points: 15 },
      { label: 'Earliest match is from a trusted archive', points: 10 },
    ]);
    expect(c.value).toBe(55);
    expect(c.band).toBe('Medium');
  });

  it('caps an earliest-copy result below the High band', () => {
    const many = ['a', 'b', 'c', 'd'].map((id, i) => copy(id, `s${i}.example`, OLD, { trustedSource: true }));
    const s = signals({ confirmedMatches: many, firstSeen: { at: OLD, evidenceId: 'a' } });
    expect(scoreLeak(s, 'LEAK_EARLIEST_FOUND').value).toBeLessThanOrEqual(LEAK_SCORE_CAP.LEAK_EARLIEST_FOUND);
  });

  it('credits a thorough search that found nothing, but keeps it in the Low band', () => {
    const s = signals({
      confirmedMatches: [],
      firstSeen: undefined,
      enginesUsed: ['google_lens', 'bing_reverse_image', 'yandex_images'],
    });
    const c = scoreLeak(s, 'LEAK_NOT_FOUND');
    expect(c.reasons).toEqual([{ label: 'All three reverse-image indexes were searched and found nothing', points: 20 }]);
    expect(c.band).toBe('Low');
  });

  it('takes points off for an engine that failed, and never claims a thorough search then', () => {
    const s = signals({
      confirmedMatches: [],
      firstSeen: undefined,
      enginesUsed: ['google_lens', 'bing_reverse_image', 'yandex_images'],
      enginesFailed: ['yandex_images'],
    });
    const c = scoreLeak(s, 'LEAK_NOT_FOUND');
    expect(c.reasons).toEqual([{ label: 'yandex_images failed or timed out', points: -10 }]);
    expect(c.value).toBe(0);
  });
});

describe('what every leak result says', () => {
  const verdicts: LeakVerdict[] = ['LEAK_RECYCLED', 'LEAK_EARLIEST_FOUND', 'LEAK_NOT_FOUND'];

  it('never labels a verdict as good news and never mentions a person', () => {
    for (const v of verdicts) {
      expect(LEAK_VERDICT_LABEL[v].tone).not.toBe('good');
      expect(`${LEAK_VERDICT_LABEL[v].title} ${LEAK_ADVICE[v]}`).not.toMatch(/leaked by|the leaker|who leaked|source was/i);
    }
  });

  it('tells people what the search could not cover, and where to report harm', () => {
    expect(LEAK_LIMITATIONS).toEqual([
      'DejaVue finds where public copies appeared. It cannot identify who leaked it.',
      'Search engines do not cover private groups, Telegram or dark web forums.',
    ]);
    for (const v of verdicts) expect(LEAK_ADVICE[v]).toMatch(/cybercrime\.gov\.in or call 1930/);
  });
});
