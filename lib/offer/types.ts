// Types for Offer Check: fake job offers, government scheme messages and support numbers.

import type { EngineId, Evidence, ScoreReason, SkipReason } from '@/lib/shared/types';

export type OfferType = 'job' | 'govt_scheme' | 'customer_support' | 'other';

/** There is deliberately no "genuine" verdict: finding nothing wrong never proves an offer is real. */
export type OfferVerdict = 'LIKELY_SCAM' | 'NO_RED_FLAGS' | 'UNVERIFIED';

export type FlagStrength = 'strong' | 'medium' | 'weak';

export type RedFlagId =
  | 'payment_request'
  | 'lookalike_domain'
  | 'reported_contact'
  | 'free_email'
  | 'chat_only'
  | 'unofficial_link'
  | 'urgency';

export interface RedFlag {
  id: RedFlagId;
  strength: FlagStrength;
  /** What was found, quoting the message or naming the contact. */
  detail: string;
  evidenceIds: string[];
}

export type ContactType = 'phone' | 'email' | 'url' | 'chat';

export interface Contact {
  type: ContactType;
  /** Normalised: digits with country code for phones, lowercase for emails and hosts. */
  value: string;
  /** Host of a URL or chat link, or the part after @ in an email. */
  host?: string;
  /** Whether the contact is on the official site or its Maps listing; undefined when that was not checked. */
  onOfficialSite?: boolean;
  /** Distinct sites that mention this contact next to scam words. */
  scamReports: number;
  evidenceIds: string[];
}

export interface OfferSignals {
  type: OfferType;
  org?: string;
  role?: string;
  schemeName?: string;
  /** Registrable domain of the organisation's official site, when one was found. */
  officialDomain?: string;
  contacts: Contact[];
  /** Verbatim quote from the message asking for money. */
  paymentQuote?: string;
  /** Verbatim quotes pressuring the reader to act fast. */
  urgencyQuotes: string[];
  /** A matching job listing, or the scheme on a government site. */
  listingFound: boolean;
  enginesUsed: EngineId[];
  enginesFailed: EngineId[];
  enginesSkipped: { engine: EngineId; reason: SkipReason }[];
}

export interface OfferInput {
  /** Pasted message text. */
  text?: string;
  /** Uploaded screenshot, read once and not stored. */
  screenshotUrl?: string;
  /** Who the message claims to be from, as typed by the user. */
  claimedOrg?: string;
  maxCredits: number;
}

export interface OfferConfidence {
  value: number;
  band: 'High' | 'Medium' | 'Low';
  reasons: ScoreReason[];
}

/** The result of an offer check, stored and streamed like a media dossier. */
export interface OfferDossier {
  kind: 'offer';
  id: string;
  verdict: OfferVerdict;
  flags: RedFlag[];
  confidence: OfferConfidence;
  signals: OfferSignals;
  /** What was read from the message. The screenshot itself is never kept. */
  reading: { excerpt: string; source: 'llm' | 'patterns' };
  evidence: Evidence[];
  narrative: { summary: string; bullets: { text: string; evidenceIds: string[] }[]; source: 'template' };
  advice: string;
  metrics: { totalMs: number; credits: number; maxCredits: number; stepsRun: number[]; partial: boolean };
  limitations: string[];
  signature: string;
  createdAt: string;
}

export const OFFER_ADVICE = 'Apply only through the official website. A real employer never asks you to pay.';

export const OFFER_LIMITATIONS = [
  'DejaVue looks for warning signs using public search results. It cannot confirm that an offer is genuine.',
  'A new scam may not have been reported anywhere yet, so finding no warning signs is not proof of safety.',
];
