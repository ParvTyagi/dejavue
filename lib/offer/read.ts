import { z } from 'zod';
import type { LlmPort } from '@/lib/llm/port';
import { withTimeLimit } from '@/lib/shared/time';
import { appearsIn, extractFromMessage, PAYMENT_WORDS } from './extract';
import type { Contact, OfferInput, OfferType } from './types';

const offerOut = z.object({
  screenshotText: z.string().max(4000).nullish(),
  type: z.enum(['job', 'govt_scheme', 'customer_support', 'other']),
  org: z.string().max(100).nullish(),
  role: z.string().max(150).nullish(),
  schemeName: z.string().max(150).nullish(),
  paymentQuote: z.string().max(300).nullish(),
  urgencyQuotes: z.array(z.string().max(200)).max(5).default([]),
});

export interface OfferReading {
  /** Pasted text and screenshot text together: everything quotes are checked against. */
  message: string;
  type: OfferType;
  org?: string;
  role?: string;
  schemeName?: string;
  contacts: Contact[];
  paymentQuote?: string;
  urgencyQuotes: string[];
  /** 'patterns' when Gemini failed and only pattern extraction ran. */
  source: 'llm' | 'patterns';
}

/** A value the LLM returned, kept only when the message really contains it. */
const grounded = (message: string, value: string | null | undefined) => {
  const v = value?.trim();
  return v && appearsIn(message, v) ? v : undefined;
};

/**
 * Reads a message with Gemini, then keeps only what the message backs up: names and quotes must appear in it
 * verbatim, and contacts come from patterns alone. Patterns run even when Gemini fails, so a payment request
 * in pasted text is never missed.
 */
export async function readOfferSafe(llm: LlmPort, input: OfferInput, timeoutMs: number): Promise<OfferReading> {
  const pasted = input.text?.trim() ?? '';
  let out: z.infer<typeof offerOut> | undefined;
  try {
    const req = { text: pasted || undefined, screenshotUrl: input.screenshotUrl, claimedOrg: input.claimedOrg };
    out = offerOut.parse(await withTimeLimit(timeoutMs, (signal) => llm.readOffer(req, signal)));
  } catch {
    out = undefined;
  }

  const message = [pasted, input.screenshotUrl ? out?.screenshotText?.trim() : undefined].filter(Boolean).join('\n\n');
  const found = extractFromMessage(message);

  // Patterns win; an LLM quote is only a fallback, and must both appear in the message and name a payment.
  const llmPayment = grounded(message, out?.paymentQuote);
  const paymentQuote = found.paymentQuote ?? (llmPayment && PAYMENT_WORDS.test(llmPayment) ? llmPayment : undefined);

  const urgencyQuotes = [...found.urgencyQuotes];
  for (const q of out?.urgencyQuotes ?? []) {
    const kept = grounded(message, q);
    if (kept && urgencyQuotes.length < 3 && !urgencyQuotes.some((u) => appearsIn(u, kept) || appearsIn(kept, u))) urgencyQuotes.push(kept);
  }

  return {
    message,
    type: out?.type ?? 'other',
    // What the user typed always wins over what was read.
    org: input.claimedOrg?.trim() || grounded(message, out?.org),
    role: grounded(message, out?.role),
    schemeName: grounded(message, out?.schemeName),
    contacts: found.contacts,
    paymentQuote,
    urgencyQuotes,
    source: out ? 'llm' : 'patterns',
  };
}
