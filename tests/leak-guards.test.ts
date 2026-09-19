import { describe, expect, it } from 'vitest';
import { cardContent } from '@/components/audit/ShareCard';
import { narrateLeakSafe } from '@/lib/llm/safe';
import type { LlmPort } from '@/lib/llm/port';
import { scrubQuery } from '@/lib/leak/query';
import type { LeakDossier, LeakFlags, LeakSignals } from '@/lib/leak/types';
import { redactPersonalData } from '@/lib/shared/redact';
import type { Evidence } from '@/lib/shared/types';
import { getLeakCase, replayLeak } from './harness';

const OLD = '2024-06-01T00:00:00.000Z';

const copy = (id: string, domain: string, publishedAt?: string): Evidence => ({
  id,
  engine: 'google_lens',
  kind: 'visual_match',
  url: `https://${domain}/p`,
  domain,
  publishedAt,
  dateTrust: publishedAt ? 'absolute_text' : 'none',
  trustedSource: false,
  match: { hamming: 2, confirmed: true },
});

const MATCHES = [copy('a', 'one.example', OLD), copy('b', 'two.example', OLD)];

const signals: LeakSignals = {
  claim: {
    rawText: 'Northwind payroll memo leaked today',
    claimedAt: '2026-03-10T12:00:00.000Z',
    claimedAtSource: 'user',
    refersToPast: false,
  },
  confirmedMatches: MATCHES,
  firstSeen: { at: OLD, evidenceId: 'a' },
  deltaTDays: 647,
  timeline: {
    entries: [
      { evidenceId: 'a', at: OLD, dateTrust: 'absolute_text', domain: 'one.example', engine: 'google_lens', isEarliest: true },
      { evidenceId: 'b', at: OLD, dateTrust: 'absolute_text', domain: 'two.example', engine: 'google_lens', isEarliest: false },
    ],
    undated: [],
  },
  enginesUsed: ['google_lens'],
  enginesFailed: [],
  enginesSkipped: [],
};

const flags: LeakFlags = { predatesClaim: true, recycled: true, copiesFound: true, undatedOnly: false };

/** An LLM that returns exactly the narrative given, so the guard is what is under test. */
const sayingThat = (summary: string, bullets: { text: string; evidenceIds: string[] }[] = []): LlmPort => ({
  parseClaim: async () => ({ refersToPast: false }),
  readScene: async () => ({ signText: [], landmarks: [] }),
  narrate: async () => ({ summary, bullets }),
  readOffer: async () => ({ type: 'other', urgencyQuotes: [] }),
});

const narrate = (llm: LlmPort) => narrateLeakSafe(llm, 'LEAK_RECYCLED', flags, signals, MATCHES, 1_000);

describe('the narrative may never name a leaker', () => {
  const namings = [
    'The file was leaked by a former employee of the company.',
    'The leaker appears to have been in the payroll team.',
    'It is not clear who leaked it, but the source was an insider.',
    'First shared by @payroll_insider before it spread.',
    'An employee was blamed for putting the document online.',
  ];

  it.each(namings)('drops a narrative that says: %s', async (summary) => {
    const out = await narrate(sayingThat(summary));
    expect(out.source).toBe('template');
    expect(out.summary).not.toContain('leaked by');
    expect(out.summary).toMatch(/already public/);
  });

  it('drops it even when the naming hides in a bullet rather than the summary', async () => {
    const out = await narrate(
      sayingThat('Copies of this document appeared on two sites.', [
        { text: 'The earliest copy was posted by a contractor with access to the system.', evidenceIds: ['a'] },
      ]),
    );
    expect(out.source).toBe('template');
  });

  it('drops a narrative that contradicts the verdict, however it is phrased', async () => {
    const out = await narrate(sayingThat('This is a fresh leak that has never been online before.'));
    expect(out.source).toBe('template');
  });

  it('keeps a narrative that stays within what the evidence shows', async () => {
    const out = await narrate(
      sayingThat('Public copies of this document were online in 2024, well before the claimed date.', [
        { text: 'The earliest copy found is on one.example.', evidenceIds: ['a'] },
      ]),
    );
    expect(out.source).toBe('llm');
    expect(out.bullets).toHaveLength(1);
  });

  it('redacts personal data out of a narrative it keeps', async () => {
    const out = await narrate(
      sayingThat('The document lists a contact number 98765 43210 next to each row.', [
        { text: 'A copy appeared with the address hr.payroll@northwind.example visible.', evidenceIds: ['a'] },
      ]),
    );
    expect(out.source).toBe('llm');
    expect(out.summary).toBe('The document lists a contact number [number] next to each row.');
    expect(out.bullets[0].text).toContain('[email]');
  });

  it('falls back to the template when the model is not available at all', async () => {
    const out = await narrate({
      ...sayingThat(''),
      narrate: async () => {
        throw new Error('Gemini unavailable');
      },
    });
    expect(out.source).toBe('template');
    expect(out.bullets.map((b) => b.evidenceIds).flat()).toEqual(['a', 'a', 'b', 'a', 'b']);
  });
});

describe('the shareable card redacts personal data', () => {
  const dossier: LeakDossier = {
    kind: 'leak',
    id: 'dv_test0',
    verdict: 'LEAK_RECYCLED',
    flags,
    confidence: { value: 60, band: 'Medium', reasons: [] },
    signals: {
      ...signals,
      claim: {
        ...signals.claim,
        rawText: 'Payroll of Priya S, PAN ABCDE1234F, mobile 98765 43210, email hr@northwind.example, leaked today',
      },
    },
    evidence: MATCHES,
    scene: { redactedSnippets: ['NORTHWIND LOGISTICS'] },
    origin: { ranked: [], fetched: 0, skipped: [] },
    narrative: { summary: 'Already public in 2024.', bullets: [], source: 'template' },
    advice: 'Do not reshare personal data from it.',
    metrics: { totalMs: 10, credits: 3, maxCredits: 6, cacheHit: false, stepsRun: [1], partial: false },
    limitations: ['DejaVue finds where public copies appeared. It cannot identify who leaked it.'],
    signature: 'test-signature',
    createdAt: '2026-03-10T12:00:00.000Z',
  };

  it('replaces the phone number, email and id in the quoted claim', () => {
    const card = cardContent(dossier);
    expect(card.quote).toBe('Payroll of Priya S, PAN [id], mobile [number], email [email], leaked today');
    expect(card.quote).not.toMatch(/98765|ABCDE1234F|northwind\.example/);
  });

  it('shows the earliest public copy, never a source, and repeats the limitation', () => {
    const card = cardContent(dossier);
    expect(card.facts.map((f) => f.label)).toEqual(['Earliest public copy', 'Claimed', 'Public copies', 'Confidence']);
    expect(card.facts[0].value).toBe('1 Jun 2024');
    expect(card.footer).toContain('It cannot identify who leaked it.');
    expect(`${card.title} ${card.stamp}`).not.toMatch(/leaker|leaked by/i);
  });

  it('keeps dates readable while hiding numbers that identify people', () => {
    expect(redactPersonalData('Posted 2024-01-08, updated 12-10-2026')).toBe('Posted 2024-01-08, updated 12-10-2026');
    expect(redactPersonalData('Aadhaar 1234 5678 9012 and staff id 4820193')).toBe('Aadhaar [number] and staff id [number]');
    expect(redactPersonalData('Call 98765-43210 or +91 98765 43211')).toBe('Call [number] or [number]');
  });
});

describe('nothing from the document reaches a search engine', () => {
  it('strips personal data out of a query, and refuses one that is nothing but personal data', () => {
    expect(scrubQuery('Payroll sheet 98765 43210')).toBe('Payroll sheet');
    expect(scrubQuery('contact hr.team@northwind.example about the memo')).toBe('contact about the memo');
    expect(scrubQuery('9876543210')).toBeUndefined();
    expect(scrubQuery('  +91 98765 43210  ')).toBeUndefined();
    expect(scrubQuery('ABCDE1234F')).toBeUndefined();
  });

  it('sends no text read out of the leaked document to SerpApi', async () => {
    const c = getLeakCase('l01-recycled-payroll-memo');
    const sent: string[] = [];
    await replayLeak(c, (d) => ({
      serp: (engine, params, ctx) => {
        sent.push(...Object.values(params));
        return d.serp(engine, params, ctx);
      },
    }));
    const queries = sent.join(' | ');
    // The document's own text, including the phone number in it, never leaves DejaVue.
    expect(queries).not.toMatch(/98765|43210/);
    expect(queries).not.toMatch(/PAYROLL - CONFIDENTIAL/i);
    expect(redactPersonalData(queries)).toBe(queries);
  });
});
