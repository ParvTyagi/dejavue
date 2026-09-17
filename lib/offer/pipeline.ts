import { AuditError, type AuditDeps } from '@/lib/orchestrator/pipeline';
import { AuditBudget, SerpError, timedOut, type SearchResult } from '@/lib/serp/client';
import * as engines from '@/lib/serp/engines';
import { toEvidence } from '@/lib/serp/normalize';
import type { Emit, EngineId, Evidence, SkipReason } from '@/lib/shared/types';
import { untilAborted } from '@/lib/shared/time';
import { TTL } from '@/lib/store/types';
import {
  isGovernmentDomain,
  couldBeOwnSite,
  isKnownPlatform,
  isUrlShortener,
  nameMatchesDomain,
  registrableDomain,
  sameOrganisationName,
  sameOrganisationSite,
} from './domains';
import { readOfferSafe } from './read';
import { decideOffer } from './rules';
import { scoreOffer } from './score';
import {
  OFFER_ADVICE,
  OFFER_LIMITATIONS,
  type Contact,
  type OfferDossier,
  type OfferInput,
  type OfferSignals,
  type OfferVerdict,
  type RedFlag,
} from './types';

export type OfferDeps = Pick<
  AuditDeps,
  'serp' | 'llm' | 'store' | 'clock' | 'wallClock' | 'newId' | 'sign' | 'trustedDomains' | 'caseId' | 'timeouts'
>;

type Item = Record<string, unknown>;

// "Complaint" is left out: customer-care directories say "for any complaint, call …" next to real numbers.
const SCAM_WORDS = /\b(scams?|scammers?|fraud|frauds|fraudulent|fraudsters?|fake|cheat|cheated|cheating|phishing|beware|spam|not genuine)\b/i;
const EXCERPT_CHARS = 600;
const MAX_CONTACT_SEARCHES = 2;

const mentionsScam = (e: Evidence) => SCAM_WORDS.test(`${e.title ?? ''} ${e.snippet ?? ''}`);

/** The query that finds pages mentioning a contact, written the ways it usually appears online. */
function contactQuery(c: Contact): string {
  if (c.type === 'phone') {
    const d = c.value.replace(/\D/g, '');
    if (c.value.startsWith('+91')) {
      const ten = d.slice(-10);
      return `"${ten}" OR "${ten.slice(0, 5)} ${ten.slice(5)}"`;
    }
    return `"${d}"`;
  }
  return c.type === 'url' ? `"${c.host}"` : `"${c.value}"`;
}

/** At most one phone and one email or site, skipping contacts already known to be official and short links. */
function contactsToSearch(contacts: Contact[]): Contact[] {
  const open = contacts.filter((c) => c.onOfficialSite !== true);
  const phone = open.find((c) => c.type === 'phone');
  const other = open.find(
    (c) => (c.type === 'email' || c.type === 'url') && c.host && !isKnownPlatform(c.host) && !(c.type === 'url' && isUrlShortener(c.host)),
  );
  return [phone, other].filter((c): c is Contact => !!c).slice(0, MAX_CONTACT_SEARCHES);
}

/**
 * Every domain the search shows to be the organisation's own, most likely first: the knowledge graph's website
 * when there is one, then each result whose domain carries the name. Large organisations have several
 * (amazon.com, amazon.in, amazon.jobs), and banks are moving to .bank.in (sbi.co.in, sbi.bank.in).
 */
export function findOfficialDomains(raw: unknown, name: string, government: boolean): string[] {
  const r = (raw ?? {}) as Item;
  const acceptable = (host: string | undefined): host is string =>
    !!host && couldBeOwnSite(host) && (!government || isGovernmentDomain(host));
  const found: string[] = [];
  const website = (r.knowledge_graph as Item | undefined)?.website;
  const kgHost = typeof website === 'string' ? registrableDomain(website) : undefined;
  if (acceptable(kgHost)) found.push(kgHost);
  for (const result of Array.isArray(r.organic_results) ? (r.organic_results as Item[]) : []) {
    const host = typeof result.link === 'string' ? registrableDomain(result.link) : undefined;
    if (acceptable(host) && nameMatchesDomain(name, host) && !found.includes(host)) found.push(host);
  }
  return found;
}

function offerNarrative(verdict: OfferVerdict, flags: RedFlag[], s: OfferSignals, officialEvidence?: string): OfferDossier['narrative'] {
  const bullets: OfferDossier['narrative']['bullets'] = flags
    .filter((f) => f.strength !== 'weak')
    .map((f) => ({ text: f.detail, evidenceIds: f.evidenceIds }));
  if (s.officialDomain) {
    bullets.push({ text: `The official website is ${s.officialDomain}.`, evidenceIds: officialEvidence ? [officialEvidence] : [] });
  }
  if (s.listingFound) {
    bullets.push({
      text: s.type === 'govt_scheme' ? 'The scheme appears on a government website.' : 'A matching listing was found.',
      evidenceIds: [],
    });
  }
  const who = s.org ?? s.schemeName;
  const summaries: Record<OfferVerdict, string> = {
    LIKELY_SCAM: 'This message shows clear signs of a scam. Do not pay, share documents or click its links.',
    NO_RED_FLAGS: `No warning signs were found${who && s.officialDomain ? `, and ${who}'s official website backs it up` : ''}. That does not prove it is genuine.`,
    UNVERIFIED: 'Not enough evidence was found either way. Check with the organisation through its official website before you act.',
  };
  return { summary: summaries[verdict], bullets, source: 'template' };
}

/**
 * Runs one offer check: read the message, find the official site, search the contacts for scam
 * reports, then look for the offer itself, stopping as soon as the verdict is a likely scam.
 * Patterns alone can still reach a verdict when searches fail, so only an unreadable message ends
 * with no verdict.
 */
export async function runOfferCheck(input: OfferInput, emit: Emit, deps: OfferDeps): Promise<OfferDossier> {
  const auditMs = deps.timeouts?.auditMs ?? 25_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), auditMs);
  try {
    return await checkWithinDeadline(input, emit, deps, deadline.signal, auditMs);
  } finally {
    clearTimeout(timer);
  }
}

async function checkWithinDeadline(
  input: OfferInput,
  emit: Emit,
  deps: OfferDeps,
  auditSignal: AbortSignal,
  auditMs: number,
): Promise<OfferDossier> {
  const startedMs = performance.now();
  const remainingMs = () => Math.max(0, auditMs - (performance.now() - startedMs));
  const llmMs = () => Math.min(deps.timeouts?.llmMs ?? 8_000, remainingMs());
  const id = deps.newId();
  const budget = new AuditBudget(input.maxCredits);
  const used = new Set<EngineId>();
  const failed = new Set<EngineId>();
  const skipped = new Map<EngineId, SkipReason>();
  const skip = (engine: EngineId, reason: SkipReason) => {
    if (!skipped.has(engine)) skipped.set(engine, reason);
  };
  const evidence: Evidence[] = [];
  const stepsRun: number[] = [];
  let partial = false;
  let halt: SerpError | undefined;

  const call = async (req: engines.EngineRequest, signal = auditSignal): Promise<SearchResult | undefined> => {
    if (halt || auditSignal.aborted) {
      partial = true;
      skip(req.engine, halt ? 'halted' : 'deadline');
      return undefined;
    }
    try {
      const search = deps.serp(req.engine, req.params, {
        auditId: id,
        budget,
        caseId: deps.caseId,
        onCredit: (data) => emit({ type: 'credit', data }),
        signal,
      });
      const res = await untilAborted(search, signal, () => timedOut(req.engine));
      used.add(req.engine);
      return res;
    } catch (err) {
      const e = err instanceof SerpError ? err : new SerpError('UPSTREAM_FAILED', req.engine, String(err));
      if (e.code === 'BUDGET_EXCEEDED') {
        skip(req.engine, 'budget');
      } else {
        failed.add(req.engine);
        if (e.code === 'RATE_LIMITED' || e.code === 'CREDITS_EXHAUSTED') halt = e;
        partial = true;
      }
      emit({ type: 'error', data: { code: e.code, message: e.message, recoverable: true } });
      return undefined;
    }
  };

  const collect = (req: engines.EngineRequest, res: SearchResult, idPrefix: string) => {
    const items = toEvidence(req.engine, res.raw, { fetchedAt: res.fetchedAt, trustedDomains: deps.trustedDomains, idPrefix });
    for (const ev of items) {
      evidence.push(ev);
      emit({ type: 'evidence', data: ev });
    }
    return items;
  };

  // Step 0: read the message. No searches.
  emit({ type: 'stage', data: { stage: 'read' } });
  const reading = await readOfferSafe(deps.llm, input, llmMs());
  if (!reading.message) {
    throw new AuditError('UNREADABLE', "No text could be read from the screenshot. Try pasting the message instead.");
  }
  const contacts = reading.contacts.map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] }));
  let officialDomain: string | undefined;
  let officialDomains: string[] = [];
  let officialEvidence: string | undefined;
  let listingFound = false;

  const signals = (): OfferSignals => ({
    type: reading.type,
    org: reading.org,
    role: reading.role,
    schemeName: reading.schemeName,
    officialDomain,
    officialDomains,
    contacts,
    paymentQuote: reading.paymentQuote,
    urgencyQuotes: reading.urgencyQuotes,
    listingFound,
    enginesUsed: [...used],
    enginesFailed: [...failed],
    enginesSkipped: [...skipped].filter(([engine]) => !used.has(engine)).map(([engine, reason]) => ({ engine, reason })),
  });

  let shortCircuited = false;
  const stopIfScam = (afterStep: number) => {
    if (decideOffer(signals()).verdict !== 'LIKELY_SCAM') return;
    shortCircuited = true;
    emit({ type: 'short_circuit', data: { afterTier: afterStep, creditsSaved: budget.remaining } });
  };

  // Step 1: the official website. Always searched when a name is known, even for an obvious
  // scam, because the result page points people to the real site.
  emit({ type: 'stage', data: { stage: 'identity' } });
  stepsRun.push(1);
  const name = reading.org ?? reading.schemeName;
  if (name) {
    const government = reading.type === 'govt_scheme' || (!reading.org && !!reading.schemeName);
    const req = engines.officialSiteSearch(name);
    const res = await call(req);
    if (res) {
      const items = collect(req, res, 'official');
      officialDomains = findOfficialDomains(res.raw, name, government);
      officialDomain = officialDomains[0];
      officialEvidence = officialDomain ? items.find((e) => sameOrganisationSite(e.domain, officialDomain!))?.id : undefined;
    }
  }
  const isOfficial = (host: string) => officialDomains.some((d) => sameOrganisationSite(host, d));
  for (const c of contacts) if (c.host && isOfficial(c.host)) c.onOfficialSite = true;
  stopIfScam(1);

  // Step 2: search contacts for scam reports, in parallel.
  if (!shortCircuited) {
    emit({ type: 'stage', data: { stage: 'contacts' } });
    stepsRun.push(2);
    const targets = contactsToSearch(contacts);
    const affordable = targets.slice(0, Math.max(0, budget.remaining));
    if (affordable.length < targets.length) skip('google', 'budget');
    const stepSignal = AbortSignal.any([auditSignal, AbortSignal.timeout(deps.timeouts?.tier3Ms ?? 10_000)]);
    const reqs = affordable.map((c) => engines.contactSearch(contactQuery(c)));
    const results = await Promise.all(reqs.map((req) => call(req, stepSignal)));
    affordable.forEach((c, i) => {
      const res = results[i];
      if (!res) return;
      const items = collect(reqs[i], res, `contact${i}`);
      // Neither a site describing itself nor the organisation's own pages (which warn about fraud next to their
      // real numbers) count as reports.
      const reports = items.filter((e) => mentionsScam(e) && !(c.host && sameOrganisationSite(e.domain, c.host)) && !isOfficial(e.domain));
      c.scamReports = new Set(reports.map((e) => registrableDomain(e.domain) ?? e.domain)).size;
      c.evidenceIds.push(...reports.map((e) => e.id));
      const onOfficial = items.filter((e) => isOfficial(e.domain));
      if (officialDomain) c.onOfficialSite = onOfficial.length > 0;
      c.evidenceIds.push(...onOfficial.map((e) => e.id));
    });
    stopIfScam(2);
  }

  // Step 3: the offer itself.
  if (!shortCircuited) {
    emit({ type: 'stage', data: { stage: 'offer' } });
    stepsRun.push(3);
    if (reading.type === 'job' && reading.org) {
      const req = engines.jobsSearch([reading.role, reading.org].filter(Boolean).join(' '));
      const res = await call(req);
      if (res) {
        collect(req, res, 'listing');
        const jobs = ((res.raw as Item)?.jobs_results as Item[] | undefined) ?? [];
        listingFound = jobs.some((j) => typeof j.company_name === 'string' && sameOrganisationName(j.company_name, reading.org!));
      }
    } else if (reading.type === 'govt_scheme' && reading.schemeName) {
      const site = officialDomain && isGovernmentDomain(officialDomain) ? officialDomain : 'gov.in';
      const req = engines.schemeSearch(reading.schemeName, site);
      const res = await call(req);
      if (res) listingFound = collect(req, res, 'scheme').some((e) => isGovernmentDomain(e.domain));
    } else if (reading.type === 'customer_support' && officialDomain) {
      // A helpline is real when the official site itself lists the number.
      const phone = contacts.find((c) => c.type === 'phone' && c.onOfficialSite !== true);
      if (phone) {
        const req = engines.contactSearch(`site:${officialDomain} ${contactQuery(phone)}`);
        const res = await call(req);
        if (res) {
          const onOfficial = collect(req, res, 'helpline').filter((e) => isOfficial(e.domain));
          if (onOfficial.length > 0) {
            phone.onOfficialSite = true;
            phone.evidenceIds.push(...onOfficial.map((e) => e.id));
          }
        }
      }
    }
  }

  // Judge.
  emit({ type: 'stage', data: { stage: 'judge' } });
  const final = signals();
  const { verdict, flags } = decideOffer(final);
  const unsigned: Omit<OfferDossier, 'signature'> = {
    kind: 'offer',
    id,
    verdict,
    flags,
    confidence: scoreOffer(final, verdict, flags),
    signals: final,
    reading: { excerpt: reading.message.slice(0, EXCERPT_CHARS), source: reading.source },
    evidence,
    narrative: offerNarrative(verdict, flags, final, officialEvidence),
    advice: OFFER_ADVICE[final.type],
    metrics: { totalMs: Math.round(performance.now() - startedMs), credits: budget.used, maxCredits: budget.max, stepsRun, partial },
    limitations: OFFER_LIMITATIONS,
    createdAt: deps.wallClock().toISOString(),
  };
  const dossier: OfferDossier = { ...unsigned, signature: deps.sign(unsigned) };
  await deps.store.putAudit(dossier, TTL.auditMs);
  emit({ type: 'dossier', data: dossier });
  return dossier;
}
