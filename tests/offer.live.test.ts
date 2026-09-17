import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runOfferCheck } from '@/lib/offer/pipeline';
import type { OfferDossier, OfferInput } from '@/lib/offer/types';
import { appStore, createAuditDeps } from '@/lib/server/deps';
import type { SerpClient } from '@/lib/serp/client';

// Spends real SerpApi searches (about 8 in total) and Gemini calls. Run with `npm run test:live`.
// The messages use real organisations and their published helpline numbers, never a private person's number.
try {
  process.loadEnvFile('.env.local');
} catch {
  // Keys can come from the environment instead.
}
const live = !!process.env.SERPAPI_API_KEY && !!process.env.GEMINI_API_KEY;
/** Set to a folder to save every raw SerpApi response, for checking field names. */
const dumpDir = process.env.LIVE_DUMP_DIR;

async function check(name: string, input: OfferInput): Promise<OfferDossier> {
  const base = createAuditDeps({ mode: 'live', store: appStore() });
  const serp: SerpClient = async (engine, params, ctx) => {
    const res = await base.serp(engine, params, ctx);
    if (dumpDir) {
      mkdirSync(dumpDir, { recursive: true });
      writeFileSync(path.join(dumpDir, `${name}-${engine}-${ctx.budget.used}.json`), JSON.stringify(res.raw, null, 2));
    }
    return res;
  };
  const dossier = await runOfferCheck(input, () => {}, { ...base, serp });
  const s = dossier.signals;
  console.log(
    JSON.stringify(
      {
        name,
        verdict: dossier.verdict,
        confidence: dossier.confidence.value,
        read: { source: dossier.reading.source, type: s.type, org: s.org, role: s.role, scheme: s.schemeName },
        officialDomain: s.officialDomain,
        listingFound: s.listingFound,
        flags: dossier.flags.map((f) => `${f.strength}: ${f.detail}`),
        contacts: s.contacts.map((c) => ({ value: c.value, onOfficialSite: c.onOfficialSite, scamReports: c.scamReports })),
        engines: { used: s.enginesUsed, failed: s.enginesFailed, skipped: s.enginesSkipped },
        credits: dossier.metrics.credits,
        evidence: dossier.evidence.map((e) => `${e.id} ${e.domain} ${e.title ?? ''}`.slice(0, 110)),
      },
      null,
      2,
    ),
  );
  return dossier;
}

describe.skipIf(!live)('offer check against live SerpApi and Gemini', () => {
  it('flags a fee-charging job and finds the real company site', async () => {
    const d = await check('amazon-fee', {
      text: 'Amazon work from home job! Earn ₹30,000 per month part time. Pay ₹499 registration fee to confirm your seat and send documents to amazon.hr.jobs@gmail.com',
      maxCredits: 2,
    });
    expect(d.verdict).toBe('LIKELY_SCAM');
    expect(d.reading.source).toBe('llm');
    expect(d.signals.org).toMatch(/amazon/i);
    expect(d.signals.officialDomain).toMatch(/^amazon\./);
    expect(d.flags.map((f) => f.id)).toEqual(expect.arrayContaining(['payment_request', 'free_email']));
    expect(d.flags.map((f) => f.id)).not.toContain('urgency');
    expect(d.signals.enginesFailed).toEqual([]);
  });

  it('confirms a careers link on the official site and reads Google Jobs', async () => {
    const d = await check('infosys-careers', {
      text: 'Infosys is hiring Systems Engineer freshers in Bengaluru. Apply only through the official careers portal https://career.infosys.com/',
      maxCredits: 3,
    });
    expect(d.signals.officialDomain).toBe('infosys.com');
    expect(d.signals.contacts.find((c) => c.type === 'url')?.onOfficialSite).toBe(true);
    expect(d.signals.enginesUsed).toContain('google_jobs');
    expect(d.signals.listingFound).toBe(true);
    expect(d.signals.enginesFailed).toEqual([]);
    expect(d.verdict).toBe('NO_RED_FLAGS');
  });

  it('confirms a real bank helpline on its official site', async () => {
    const d = await check('sbi-helpline', {
      text: 'SBI customer care: for any help with your account, call the toll-free number 1800 1234 or 1800 2100.',
      maxCredits: 3,
    });
    expect(d.signals.type).toBe('customer_support');
    expect(d.signals.officialDomains).toEqual(expect.arrayContaining(['sbi.bank.in', 'sbi.co.in']));
    expect(d.signals.contacts.find((c) => c.value === '18001234')).toMatchObject({ onOfficialSite: true, scamReports: 0 });
    expect(d.signals.enginesFailed).toEqual([]);
    expect(d.verdict).toBe('NO_RED_FLAGS');
  });

  it('finds a government scheme on its official government site', async () => {
    const d = await check('pmkisan-official', {
      text: 'PM Kisan Samman Nidhi: check your beneficiary status only on the official website pmkisan.gov.in',
      maxCredits: 3,
    });
    expect(d.signals.type).toBe('govt_scheme');
    expect(d.signals.officialDomain).toBe('pmkisan.gov.in');
    expect(d.signals.enginesFailed).toEqual([]);
    expect(d.verdict).not.toBe('LIKELY_SCAM');
  });
});
