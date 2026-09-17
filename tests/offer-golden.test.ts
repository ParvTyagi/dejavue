import { describe, expect, it } from 'vitest';
import { matchOfferCase } from '@/lib/fixtures/source';
import { OFFER_ADVICE } from '@/lib/offer/types';
import { AuditError } from '@/lib/orchestrator/pipeline';
import { SerpError, type SerpClient } from '@/lib/serp/client';
import type { EngineId } from '@/lib/shared/types';
import { getOfferCase, OFFER_FIXTURES, offerCases, replayOffer } from './harness';

const cases = offerCases();

const SCORE_CAP = { LIKELY_SCAM: 99, NO_RED_FLAGS: 75, UNVERIFIED: 40 };

const failing =
  (serp: SerpClient, engines: EngineId[], code: SerpError['code'] = 'UPSTREAM_FAILED'): SerpClient =>
  (engine, params, ctx) =>
    engines.includes(engine) ? Promise.reject(new SerpError(code, engine, `${engine} down`)) : serp(engine, params, ctx);

const down = async () => {
  throw new Error('Gemini unavailable');
};

describe('offer golden cases (replay fixtures)', () => {
  it('covers the planned mix of verdicts', () => {
    const counts = cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.expected.verdict] = (acc[c.expected.verdict] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ LIKELY_SCAM: 4, NO_RED_FLAGS: 1, UNVERIFIED: 1 });
    expect(cases.every((c) => c.synthetic)).toBe(true);
  });

  describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    it(`returns ${c.expected.verdict} with the expected flags, score, credits and steps`, async () => {
      const { dossier, error } = await replayOffer(c);
      expect(error).toBeUndefined();
      expect({
        verdict: dossier!.verdict,
        flags: dossier!.flags.map((f) => f.id),
        credits: dossier!.metrics.credits,
        stepsRun: dossier!.metrics.stepsRun,
        confidence: dossier!.confidence.value,
      }).toEqual(c.expected);
    });

    it('is deterministic, cites only real evidence and never fails an engine', async () => {
      const [a, b] = await Promise.all([replayOffer(c), replayOffer(c)]);
      const strip = (d: typeof a.dossier) => ({ ...d!, metrics: { ...d!.metrics, totalMs: 0 } });
      expect(strip(a.dossier)).toEqual(strip(b.dossier));
      const ids = new Set(a.dossier!.evidence.map((e) => e.id));
      for (const f of a.dossier!.flags) for (const id of f.evidenceIds) expect(ids).toContain(id);
      for (const bullet of a.dossier!.narrative.bullets) for (const id of bullet.evidenceIds) expect(ids).toContain(id);
      expect(a.dossier!.signals.enginesFailed).toEqual([]);
      const raw = a.dossier!.confidence.reasons.reduce((sum, r) => sum + r.points, 0);
      expect(a.dossier!.confidence.value).toBe(Math.max(0, Math.min(SCORE_CAP[a.dossier!.verdict], raw)));
    });

    it('carries the advice and limitations, and keeps no screenshot', async () => {
      const { dossier } = await replayOffer(c);
      expect(dossier!).toMatchObject({ kind: 'offer', advice: OFFER_ADVICE[dossier!.signals.type] });
      expect(dossier!.limitations.join(' ')).toMatch(/cannot confirm that an offer is genuine/);
      expect(JSON.stringify(dossier)).not.toContain('screenshot.jpg');
    });
  });
});

describe('demo message matching', () => {
  it('finds a demo case by its text, ignoring line breaks and spacing, or by its screenshot', () => {
    const o1 = getOfferCase('o1-amazon-registration-fee');
    const reflowed = `  ${o1.input.text!.split(' ').join(String.fromCharCode(10))}  `;
    expect(matchOfferCase(OFFER_FIXTURES, { text: reflowed })?.id).toBe(o1.id);
    const o3 = getOfferCase('o3-pmkisan-lookalike');
    expect(matchOfferCase(OFFER_FIXTURES, { screenshotUrl: o3.input.screenshotUrl })?.id).toBe(o3.id);
  });

  it('does not match an edited or unknown message', () => {
    const o1 = getOfferCase('o1-amazon-registration-fee');
    expect(matchOfferCase(OFFER_FIXTURES, { text: o1.input.text!.replace('₹999', '₹99') })).toBeUndefined();
    expect(matchOfferCase(OFFER_FIXTURES, { screenshotUrl: 'https://example.com/other.jpg' })).toBeUndefined();
  });
});

describe('offer stream', () => {
  it('streams the steps in order and stops after the contact search once a number is reported', async () => {
    const { events } = await replayOffer(getOfferCase('o4-sbi-kyc-reported-number'));
    const types = events.map((e) => (e.type === 'stage' ? `stage:${e.data.stage}` : e.type));
    expect(types.filter((t) => t.startsWith('stage:') || t === 'short_circuit' || t === 'dossier')).toEqual([
      'stage:read',
      'stage:identity',
      'stage:contacts',
      'short_circuit',
      'stage:judge',
      'dossier',
    ]);
    expect(events.find((e) => e.type === 'short_circuit')?.data).toEqual({ afterTier: 2, creditsSaved: 4 });
  });

  it('words the advice for the kind of message', async () => {
    const { dossier: bank } = await replayOffer(getOfferCase('o4-sbi-kyc-reported-number'));
    expect(bank!.advice).toMatch(/Never share an OTP/);
    expect(bank!.advice).not.toMatch(/employer/);
    const { dossier: job } = await replayOffer(getOfferCase('o1-amazon-registration-fee'));
    expect(job!.advice).toMatch(/A real employer never asks you to pay/);
  });

  it('points to the real site even when the message is plainly a scam', async () => {
    const { dossier } = await replayOffer(getOfferCase('o3-pmkisan-lookalike'));
    expect(dossier!.signals.officialDomain).toBe('pmkisan.gov.in');
    expect(dossier!.flags[0].detail).toMatch(/pmkisan-gov\.online adds words to the official name "pmkisan"/);
    expect(dossier!.narrative.bullets.map((b) => b.text)).toContain('The official website is pmkisan.gov.in.');
  });

  it('skips the contact search for links already on the official site', async () => {
    const { dossier } = await replayOffer(getOfferCase('o5-infosys-official-listing'));
    expect(dossier!.signals.enginesUsed.sort()).toEqual(['google', 'google_jobs']);
    expect(dossier!.signals.contacts).toMatchObject([{ type: 'url', host: 'career.infosys.com', onOfficialSite: true }]);
    expect(dossier!.signals.listingFound).toBe(true);
  });

  it('counts only pages with scam words as reports', async () => {
    const { dossier } = await replayOffer(getOfferCase('o4-sbi-kyc-reported-number'));
    const phone = dossier!.signals.contacts.find((c) => c.type === 'phone')!;
    expect(phone).toMatchObject({ value: '+918210457693', scamReports: 2, onOfficialSite: false });
    expect(phone.evidenceIds).toEqual(['contact0-0', 'contact0-1']);
  });
});

describe('offer failures', () => {
  it('still flags a payment request when every search fails', async () => {
    const c = getOfferCase('o1-amazon-registration-fee');
    const { dossier, events } = await replayOffer(c, (d) => ({ serp: failing(d.serp, ['google', 'google_jobs']) }));
    expect(dossier!.verdict).toBe('LIKELY_SCAM');
    expect(dossier!.signals).toMatchObject({ officialDomain: undefined, enginesFailed: ['google'] });
    expect(dossier!.metrics.partial).toBe(true);
    expect(events.some((e) => e.type === 'error' && e.data.recoverable)).toBe(true);
  });

  it('needs the official site to pass, but not the listing', async () => {
    const c = getOfferCase('o5-infosys-official-listing');
    const { dossier } = await replayOffer(c, (d) => ({ serp: failing(d.serp, ['google_jobs']) }));
    // The link is still on the official site, which is enough on its own.
    expect(dossier!.verdict).toBe('NO_RED_FLAGS');
    const { dossier: noSite } = await replayOffer(c, (d) => ({ serp: failing(d.serp, ['google']) }));
    expect(noSite!.verdict).toBe('UNVERIFIED');
  });

  it('stops searching at the credit cap', async () => {
    const c = getOfferCase('o6-unknown-company');
    const { dossier } = await replayOffer(c, () => ({}), { ...c.input, maxCredits: 1 });
    expect(dossier!.metrics.credits).toBe(1);
    expect(dossier!.signals.enginesSkipped).toEqual([{ engine: 'google_jobs', reason: 'budget' }]);
    expect(dossier!.verdict).toBe('UNVERIFIED');
  });

  it('reaches a verdict from patterns alone when Gemini is down and text was pasted', async () => {
    const c = getOfferCase('o1-amazon-registration-fee');
    const { dossier } = await replayOffer(c, (d) => ({ llm: { ...d.llm, readOffer: down } }));
    expect(dossier!).toMatchObject({ verdict: 'LIKELY_SCAM', reading: { source: 'patterns' } });
  });

  it('ends with no verdict when a screenshot cannot be read', async () => {
    const c = getOfferCase('o3-pmkisan-lookalike');
    const { dossier, error, events } = await replayOffer(c, (d) => ({ llm: { ...d.llm, readOffer: down } }));
    expect(dossier).toBeUndefined();
    expect(error).toBeInstanceOf(AuditError);
    expect(error).toMatchObject({ code: 'UNREADABLE', status: 422 });
    expect(events.filter((e) => e.type === 'credit')).toEqual([]);
  });
});
