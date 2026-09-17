import { describe, expect, it } from 'vitest';
import { lookalikeReason, posesAsGovernment, registrableDomain } from '@/lib/offer/domains';
import { decideOffer } from '@/lib/offer/rules';
import { offerInputSchema } from '@/lib/offer/schema';
import { scoreOffer } from '@/lib/offer/score';
import type { Contact, OfferSignals } from '@/lib/offer/types';

const signals = (patch: Partial<OfferSignals>): OfferSignals => ({
  type: 'job',
  contacts: [],
  urgencyQuotes: [],
  listingFound: false,
  enginesUsed: ['google'],
  enginesFailed: [],
  enginesSkipped: [],
  ...patch,
});

const contact = (type: Contact['type'], value: string, patch: Partial<Contact> = {}): Contact => ({
  type,
  value,
  host: type === 'email' ? value.split('@')[1] : type === 'url' ? registrableHost(value) : undefined,
  scamReports: 0,
  evidenceIds: [],
  ...patch,
});
const registrableHost = (url: string) => new URL(url).hostname.replace(/^www\./, '');

const ids = (s: OfferSignals) => decideOffer(s).flags.map((f) => f.id);

describe('domains', () => {
  it('finds the registrable domain under Indian second-level suffixes', () => {
    expect(registrableDomain('https://careers.amazon.in/jobs')).toBe('amazon.in');
    expect(registrableDomain('x.pmkisan.gov.in')).toBe('pmkisan.gov.in');
    expect(registrableDomain('hr@mail.tata.co.in')).toBe('tata.co.in');
  });

  it('flags imitations of the official name', () => {
    expect(lookalikeReason('amazon-careers-india.com', 'amazon.in')).toMatch(/adds words/);
    expect(lookalikeReason('amaz0n.in', 'amazon.in')).toMatch(/look-alike characters/);
    expect(lookalikeReason('infosis.com', 'infosys.com')).toMatch(/misspelling/);
    expect(lookalikeReason('amazon.in.job-verify.com', 'amazon.in')).toMatch(/in front of an unrelated domain/);
  });

  it('leaves the organisation, its other TLDs and job platforms alone', () => {
    expect(lookalikeReason('careers.amazon.in', 'amazon.in')).toBeUndefined();
    expect(lookalikeReason('amazon.jobs', 'amazon.com')).toBeUndefined();
    expect(lookalikeReason('linkedin.com', 'amazon.com')).toBeUndefined();
    expect(lookalikeReason('flipkart.com', 'amazon.in')).toBeUndefined();
  });

  it('spots non-government sites dressed as government ones', () => {
    expect(posesAsGovernment('pmkisan-gov.online')).toBe(true);
    expect(posesAsGovernment('govt-yojana.in')).toBe(true);
    expect(posesAsGovernment('pmkisan.gov.in')).toBe(false);
    expect(posesAsGovernment('governance-today.com')).toBe(false);
  });
});

describe('offer verdicts (the six planned demo cases)', () => {
  it('1. a job that asks for a registration fee is a likely scam', () => {
    const s = signals({ org: 'Amazon', officialDomain: 'amazon.in', paymentQuote: 'pay ₹999 registration fee' });
    expect(decideOffer(s).verdict).toBe('LIKELY_SCAM');
    expect(ids(s)).toEqual(['payment_request']);
  });

  it('2. a Gmail recruiter who moves you to WhatsApp adds up to a likely scam', () => {
    const s = signals({
      org: 'TCS',
      contacts: [contact('email', 'tcs-hiring@gmail.com'), contact('chat', 'wa.me/919876543210')],
    });
    expect(ids(s)).toEqual(['free_email', 'chat_only']);
    expect(decideOffer(s).verdict).toBe('LIKELY_SCAM');
  });

  it('3. a scheme link on a fake government domain is a likely scam, even with no official site found', () => {
    const s = signals({ type: 'govt_scheme', schemeName: 'PM-Kisan', contacts: [contact('url', 'https://pmkisan-gov.online/claim')] });
    expect(ids(s)).toEqual(['lookalike_domain']);
    expect(decideOffer(s).verdict).toBe('LIKELY_SCAM');
  });

  it('4. a support number reported on two sites is a likely scam', () => {
    const s = signals({ type: 'customer_support', org: 'SBI', contacts: [contact('phone', '+919812345678', { scamReports: 2 })] });
    expect(decideOffer(s).verdict).toBe('LIKELY_SCAM');
    expect(decideOffer(signals({ ...s, contacts: [contact('phone', '+919812345678', { scamReports: 1 })] })).verdict).toBe('UNVERIFIED');
  });

  it('5. a listing on the official site with official contacts has no red flags', () => {
    const s = signals({
      org: 'Infosys',
      officialDomain: 'infosys.com',
      listingFound: true,
      contacts: [contact('url', 'https://career.infosys.com/jobdesc?jobReferenceCode=123', { onOfficialSite: true })],
    });
    expect(decideOffer(s)).toEqual({ verdict: 'NO_RED_FLAGS', flags: [] });
  });

  it('6. an unknown company with nothing found stays unverified', () => {
    expect(decideOffer(signals({ org: 'Brightpath Solutions' })).verdict).toBe('UNVERIFIED');
  });
});

describe('offer verdict edges', () => {
  it('never says no red flags without an official site, whatever else was found', () => {
    const s = signals({ org: 'Acme', listingFound: true, contacts: [contact('phone', '+911234567890', { onOfficialSite: true })] });
    expect(decideOffer(s).verdict).toBe('UNVERIFIED');
  });

  it('keeps one medium sign at unverified rather than a scam or a pass', () => {
    const s = signals({ org: 'Wipro', officialDomain: 'wipro.com', listingFound: true, contacts: [contact('url', 'https://bit.ly/wipro-apply')] });
    expect(ids(s)).toEqual(['unofficial_link']);
    expect(decideOffer(s).verdict).toBe('UNVERIFIED');
  });

  it('does not count one fake domain twice when both the email and the link use it', () => {
    const s = signals({
      org: 'Amazon',
      officialDomain: 'amazon.in',
      contacts: [contact('email', 'hr@amazon-careers-india.com'), contact('url', 'https://amazon-careers-india.com/apply')],
    });
    expect(ids(s)).toEqual(['lookalike_domain']);
  });

  it('shows urgency but never decides on it', () => {
    const s = signals({ org: 'Infosys', officialDomain: 'infosys.com', listingFound: true, urgencyQuotes: ['apply today only'] });
    const { verdict, flags } = decideOffer(s);
    expect(verdict).toBe('NO_RED_FLAGS');
    expect(flags.map((f) => f.id)).toEqual(['urgency']);
  });

  it('accepts job platforms and the organisation’s other domains as links', () => {
    const s = signals({
      org: 'Amazon',
      officialDomain: 'amazon.com',
      contacts: [contact('url', 'https://www.linkedin.com/jobs/view/1'), contact('url', 'https://amazon.jobs/en/jobs/2')],
    });
    expect(ids(s)).toEqual([]);
  });
});

describe('offer score', () => {
  it('explains every point of a scam verdict', () => {
    const s = signals({ org: 'Amazon', officialDomain: 'amazon.in', paymentQuote: 'pay ₹999', urgencyQuotes: ['today only'] });
    const { verdict, flags } = decideOffer(s);
    const c = scoreOffer(s, verdict, flags);
    expect(c.reasons.map((r) => r.points)).toEqual([45, 5]);
    expect(c).toMatchObject({ value: 50, band: 'Medium' });
  });

  it('keeps no red flags below the High band', () => {
    const s = signals({
      officialDomain: 'infosys.com',
      listingFound: true,
      contacts: [contact('url', 'https://career.infosys.com/x', { onOfficialSite: true })],
    });
    const { verdict, flags } = decideOffer(s);
    expect(scoreOffer(s, verdict, flags)).toMatchObject({ value: 75, band: 'Medium' });
  });

  it('takes points off for engines that failed', () => {
    const s = signals({ enginesFailed: ['google'] });
    const { verdict, flags } = decideOffer(s);
    expect(scoreOffer(s, verdict, flags).reasons).toContainEqual({ label: 'google failed or timed out', points: -10 });
  });
});

describe('offer input', () => {
  it('needs the message text or a screenshot', () => {
    expect(offerInputSchema.safeParse({}).success).toBe(false);
    expect(offerInputSchema.safeParse({ text: 'Work from home, earn ₹40,000 a week' }).success).toBe(true);
    expect(offerInputSchema.safeParse({ screenshotUrl: 'https://example.com/s.jpg' }).success).toBe(true);
    expect(offerInputSchema.safeParse({ screenshotUrl: 'http://example.com/s.jpg' }).success).toBe(false);
  });

  it('caps the message length', () => {
    expect(offerInputSchema.safeParse({ text: 'x'.repeat(2001) }).success).toBe(false);
  });
});
