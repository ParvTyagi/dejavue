import {
  isFreeEmailDomain,
  isKnownPlatform,
  lookalikeReason,
  posesAsGovernment,
  sameNameOtherTld,
  sameOrganisationSite,
} from './domains';
import type { Contact, OfferSignals, OfferVerdict, RedFlag } from './types';

export interface OfferDecision {
  verdict: OfferVerdict;
  flags: RedFlag[];
}

/** Distinct sites reporting a contact before it counts as reported. */
export const REPORTS_NEEDED = 2;

const hostOf = (c: Contact) => (c.type === 'email' || c.type === 'url' ? c.host : undefined);

/** Every warning sign in the signals, in the order they are shown. Pure; the LLM never influences this. */
export function redFlags(s: OfferSignals): RedFlag[] {
  const flags: RedFlag[] = [];
  const add = (flag: RedFlag) => flags.push(flag);
  // One flag per host, so an email and a link on the same fake domain are not counted twice.
  const flaggedHosts = new Set<string>();

  if (s.paymentQuote) {
    add({ id: 'payment_request', strength: 'strong', detail: `Asks for money: "${s.paymentQuote}"`, evidenceIds: [] });
  }

  for (const c of s.contacts) {
    const host = hostOf(c);
    if (!host || flaggedHosts.has(host)) continue;
    const reason = s.officialDomain ? lookalikeReason(host, s.officialDomain) : undefined;
    if (reason) {
      add({ id: 'lookalike_domain', strength: 'strong', detail: `${host} ${reason} (official site: ${s.officialDomain})`, evidenceIds: c.evidenceIds });
      flaggedHosts.add(host);
    } else if (posesAsGovernment(host)) {
      add({ id: 'lookalike_domain', strength: 'strong', detail: `${host} looks like a government site but is not one`, evidenceIds: c.evidenceIds });
      flaggedHosts.add(host);
    }
  }

  for (const c of s.contacts) {
    if (c.scamReports >= REPORTS_NEEDED) {
      add({
        id: 'reported_contact',
        strength: 'strong',
        detail: `${c.value} is reported as a scam on ${c.scamReports} different sites`,
        evidenceIds: c.evidenceIds,
      });
    }
  }

  // A personal mailbox only matters when the message claims to come from an organisation.
  const claimsOrganisation = !!s.org || s.type !== 'other';
  for (const c of s.contacts) {
    if (c.type === 'email' && c.host && claimsOrganisation && isFreeEmailDomain(c.host)) {
      add({ id: 'free_email', strength: 'medium', detail: `Uses a personal email address: ${c.value}`, evidenceIds: c.evidenceIds });
    }
  }

  const hasOrganisationalContact = s.contacts.some((c) => {
    const host = hostOf(c);
    return !!host && !isFreeEmailDomain(host) && !flaggedHosts.has(host);
  });
  const chats = s.contacts.filter((c) => c.type === 'chat');
  if (chats.length > 0 && !hasOrganisationalContact) {
    add({
      id: 'chat_only',
      strength: 'medium',
      detail: `Can only be reached on chat apps: ${chats.map((c) => c.value).join(', ')}`,
      evidenceIds: chats.flatMap((c) => c.evidenceIds),
    });
  }

  if (s.officialDomain) {
    for (const c of s.contacts) {
      const host = hostOf(c);
      if (!host || flaggedHosts.has(host) || isFreeEmailDomain(host)) continue;
      if (sameOrganisationSite(host, s.officialDomain) || sameNameOtherTld(host, s.officialDomain) || isKnownPlatform(host)) continue;
      add({
        id: 'unofficial_link',
        strength: 'medium',
        detail: `${host} is not the official site (${s.officialDomain})`,
        evidenceIds: c.evidenceIds,
      });
      flaggedHosts.add(host);
    }
  }

  if (s.urgencyQuotes.length > 0) {
    add({ id: 'urgency', strength: 'weak', detail: `Pressure to act fast: ${s.urgencyQuotes.map((q) => `"${q}"`).join(', ')}`, evidenceIds: [] });
  }

  return flags;
}

/** Deterministic verdict over the warning signs and what the searches confirmed. */
export function decideOffer(s: OfferSignals): OfferDecision {
  const flags = redFlags(s);
  const strong = flags.filter((f) => f.strength === 'strong').length;
  const medium = flags.filter((f) => f.strength === 'medium').length;

  if (strong > 0 || medium >= 2) return { verdict: 'LIKELY_SCAM', flags };

  const confirmedOfficially = s.listingFound || s.contacts.some((c) => c.onOfficialSite === true);
  // A single medium sign still blocks "no red flags"; absence of evidence alone never earns it.
  if (s.officialDomain && confirmedOfficially && medium === 0) return { verdict: 'NO_RED_FLAGS', flags };

  return { verdict: 'UNVERIFIED', flags };
}
