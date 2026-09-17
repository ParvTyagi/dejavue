import { describe, expect, it } from 'vitest';
import { registrableDomain } from '@/lib/offer/domains';
import { findOfficialDomains } from '@/lib/offer/pipeline';
import { readOfferSafe } from '@/lib/offer/read';
import { decideOffer } from '@/lib/offer/rules';
import type { OfferSignals } from '@/lib/offer/types';
import type { LlmPort } from '@/lib/llm/port';
import type { SerpClient } from '@/lib/serp/client';
import { getOfferCase, replayOffer } from './harness';

// Each test pins down something the first live run against SerpApi and Gemini got wrong (September 2026).

const organic = (...results: { link: string; title?: string; snippet?: string }[]) => ({
  search_metadata: { status: 'Success', processed_at: '2026-09-17T16:00:00.000Z' },
  organic_results: results.map((r, i) => ({ position: i + 1, ...r })),
});

/** Answers each Google query with the first response whose key the query contains. */
const fakeSerp =
  (responses: [string, unknown][]): SerpClient =>
  async (engine, params, ctx) => {
    const hit = responses.find(([key]) => `${engine} ${params.q}`.includes(key));
    ctx.budget.used++;
    return { raw: hit ? hit[1] : { error: "Google hasn't returned any results for this query." }, cached: false, fetchedAt: new Date() };
  };

const readingAs = (out: Record<string, unknown>): Partial<LlmPort> => ({ readOffer: async () => ({ urgencyQuotes: [], ...out }) });

describe('live regressions', () => {
  it('reads .bank.in as the bank, not as "bank"', () => {
    expect(registrableDomain('onlinesbi.sbi.bank.in')).toBe('sbi.bank.in');
    expect(registrableDomain('sbi.bank.in')).toBe('sbi.bank.in');
  });

  it('keeps every official domain from ordinary results, since Google often shows no knowledge graph', () => {
    const raw = organic(
      { link: 'https://sbi.bank.in/web/careers/current-openings' },
      { link: 'https://www.sbi.co.in/' },
      { link: 'https://onlinesbi.sbi.bank.in/' },
      { link: 'https://www.sbicard.com/' },
      { link: 'https://en.wikipedia.org/wiki/State_Bank_of_India' },
    );
    expect(findOfficialDomains(raw, 'SBI', false)).toEqual(['sbi.bank.in', 'sbi.co.in']);
  });

  it('never flags a link to another of the organisation’s own domains', () => {
    const s: OfferSignals = {
      type: 'customer_support',
      org: 'SBI',
      officialDomain: 'sbi.bank.in',
      officialDomains: ['sbi.bank.in', 'sbi.co.in'],
      contacts: [{ type: 'email', value: 'customercare@sbi.co.in', host: 'sbi.co.in', scamReports: 0, evidenceIds: [] }],
      urgencyQuotes: [],
      listingFound: false,
      enginesUsed: [],
      enginesFailed: [],
      enginesSkipped: [],
    };
    expect(decideOffer(s).flags).toEqual([]);
  });

  it('confirms a real helpline listed on the official site, and does not count a directory saying "complaint" as a report', async () => {
    const c = getOfferCase('o4-sbi-kyc-reported-number');
    const text = 'SBI customer care: for any help with your account, call the toll-free number 1800 1234.';
    const serp = fakeSerp([
      ['SBI official website', organic({ link: 'https://sbi.bank.in/' }, { link: 'https://www.sbi.co.in/' })],
      [
        '"18001234"',
        organic(
          {
            link: 'https://sbi.bank.in/web/customer-care/contact-centre',
            title: 'Contact Centre - Customer Care',
            snippet: 'SBI Contact Centre: 1. 18001234 ; 2. 18002100. Beware of fraudsters posing as SBI staff.',
          },
          {
            link: 'https://www.indiacustomercare.com/sbi-customer-care-helpline',
            title: 'SBI Customer Care No. 1800 1234',
            snippet: 'For any query/complaint, you can contact at 18001234.',
          },
        ),
      ],
    ]);
    const { dossier } = await replayOffer(c, (d) => ({ serp, llm: { ...d.llm, ...readingAs({ type: 'customer_support', org: 'SBI' }) } }), {
      ...c.input,
      text,
    });
    const phone = dossier!.signals.contacts.find((x) => x.type === 'phone')!;
    expect(phone).toMatchObject({ value: '18001234', scamReports: 0, onOfficialSite: true });
    expect(dossier!.verdict).toBe('NO_RED_FLAGS');
  });

  it('checks a helpline on the official site itself when the contact search does not confirm it', async () => {
    const c = getOfferCase('o4-sbi-kyc-reported-number');
    const text = 'SBI customer care: call the toll-free number 1800 1234.';
    const queries: string[] = [];
    const inner = fakeSerp([
      ['site:sbi.bank.in', organic({ link: 'https://sbi.bank.in/web/customer-care/contact-centre', title: 'Contact Centre' })],
      ['SBI official website', organic({ link: 'https://sbi.bank.in/' })],
      ['"18001234"', organic({ link: 'https://www.onedios.com/sbi', title: 'State Bank of India Customer Care' })],
    ]);
    const serp: SerpClient = (engine, params, ctx) => {
      queries.push(params.q);
      return inner(engine, params, ctx);
    };
    const { dossier } = await replayOffer(c, (d) => ({ serp, llm: { ...d.llm, ...readingAs({ type: 'customer_support', org: 'SBI' }) } }), {
      ...c.input,
      text,
    });
    expect(queries).toEqual(['SBI official website', '"18001234"', 'site:sbi.bank.in "18001234"']);
    expect(dossier!.signals.enginesUsed).not.toContain('google_maps');
    expect(dossier!.signals.contacts.find((x) => x.type === 'phone')?.onOfficialSite).toBe(true);
  });

  it('searches Google Jobs with a location, which answers in India where gl=in does not', async () => {
    const c = getOfferCase('o5-infosys-official-listing');
    const params: Record<string, string>[] = [];
    const { dossier } = await replayOffer(c, (d) => ({
      serp: (engine, p, ctx) => {
        if (engine === 'google_jobs') params.push(p);
        return d.serp(engine, p, ctx);
      },
    }));
    expect(params).toEqual([{ q: 'Systems Engineer Infosys', location: 'India', hl: 'en' }]);
    expect(dossier!.signals.listingFound).toBe(true);
  });

  it('ignores Gemini "urgency" quotes with no urgency in them', async () => {
    const llm = { ...readingAs({ type: 'job', urgencyQuotes: ['confirm your seat', 'Apply today'] }) } as LlmPort;
    const r = await readOfferSafe(llm, { text: 'Please confirm your seat. Apply today', maxCredits: 6 }, 1000);
    expect(r.urgencyQuotes).toEqual(['Apply today']);
  });
});
