// Pattern extraction from message text. Rules only trust what this finds, so the LLM cannot invent a contact.

import { normaliseHost } from './domains';
import type { Contact } from './types';

export interface Amount {
  raw: string;
  value: number;
  currency: 'INR' | 'USD';
  index: number;
}

export interface Extraction {
  contacts: Contact[];
  amounts: Amount[];
  /** The sentence asking the reader to pay, copied from the message. */
  paymentQuote?: string;
  urgencyQuotes: string[];
}

const QUOTE_MAX = 200;

/** Lowercase, Unicode-normalised, straight quotes, single spaces: used to compare quotes with the message. */
export function normaliseForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Whether `quote` appears in `message`, ignoring case, spacing and quote styles. */
export const appearsIn = (message: string, quote: string) => {
  const q = normaliseForMatch(quote);
  return q.length >= 3 && normaliseForMatch(message).includes(q);
};

/** Blanks out a match so later patterns do not see it again, keeping every other index in place. */
const blank = (text: string, start: number, length: number) => text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);

const trimUrl = (s: string) => s.replace(/[.,;:!?'")\]}>]+$/, '');

// wa.me/<number>, api.whatsapp.com/send?phone=<number>, chat.whatsapp.com/<invite>, t.me/<name>
const CHAT_LINK =
  /\b(?:https?:\/\/)?(?:www\.)?(wa\.me\/\+?\d{6,15}|api\.whatsapp\.com\/send\/?\?phone=\+?\d{6,15}|chat\.whatsapp\.com\/[a-z0-9]{10,}|(?:t|telegram)\.me\/[a-z0-9_+]{3,})\S*/gi;
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const URL_WITH_SCHEME = /\bhttps?:\/\/[^\s<>"']+/gi;
const BARE_TLDS =
  'com|in|org|net|co|io|ai|me|ly|gl|cc|info|biz|online|site|xyz|top|live|shop|club|work|jobs|store|website|tech|app|link|today|space|fun|click|icu|vip|pro|world|news|cloud';
const BARE_DOMAIN = new RegExp(`(?<![@\\w.-])(?:www\\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${BARE_TLDS})\\b(?:\\/[^\\s<>"']*)?`, 'gi');

// Indian mobiles (with or without +91 / 0), toll-free 1800 numbers, and other numbers written with a + country code.
const INDIAN_MOBILE = /(?<![\d+])(?:\+?91[\s-]?|0)?([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}|[6-9]\d{4}[\s-]?\d{5})(?!\d)/g;
const TOLL_FREE = /(?<!\d)1800[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g;
const INTERNATIONAL = /(?<![\d+])\+(?!91)\d{1,3}[\s-]?\d[\d\s-]{6,13}\d(?!\d)/g;

/** "WhatsApp: ", "WhatsApp only on ", "Telegram - " just before a number. */
const CHAT_APP_NEAR = /(whats\s?app|telegram)(\W+[a-z]+){0,2}\W*$/i;

export function extractContacts(message: string): Contact[] {
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  const push = (type: Contact['type'], value: string, host?: string) => {
    const key = `${type}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    contacts.push({ type, value, ...(host ? { host } : {}), scamReports: 0, evidenceIds: [] });
  };
  let rest = message;

  for (const m of message.matchAll(CHAT_LINK)) {
    const value = trimUrl(m[1]).toLowerCase().replace('api.whatsapp.com/send?phone=', 'wa.me/').replace('api.whatsapp.com/send/?phone=', 'wa.me/').replace('telegram.me/', 't.me/').replace('wa.me/+', 'wa.me/');
    push('chat', value, normaliseHost(value));
    rest = blank(rest, m.index, m[0].length);
    // The number inside a WhatsApp link can be searched like any other phone.
    const digits = /^wa\.me\/(\d+)/.exec(value)?.[1];
    if (digits) push('phone', `+${digits.length === 10 ? `91${digits}` : digits}`);
  }

  for (const m of rest.matchAll(EMAIL)) {
    const value = m[0].toLowerCase();
    push('email', value, normaliseHost(value));
    rest = blank(rest, m.index, m[0].length);
  }

  for (const pattern of [URL_WITH_SCHEME, BARE_DOMAIN]) {
    for (const m of rest.matchAll(pattern)) {
      const value = trimUrl(m[0]);
      const host = normaliseHost(value);
      if (!host) continue;
      push('url', value, host);
      rest = blank(rest, m.index, m[0].length);
    }
  }

  const phone = (m: RegExpMatchArray, value: string) => {
    push('phone', value);
    // "WhatsApp 98765 43210" is a chat contact as well as a phone.
    const before = rest.slice(Math.max(0, m.index! - 30), m.index);
    if (CHAT_APP_NEAR.test(before)) push('chat', `${/telegram/i.test(before) ? 'telegram' : 'whatsapp'}:${value}`);
    rest = blank(rest, m.index!, m[0].length);
  };
  for (const m of rest.matchAll(INDIAN_MOBILE)) phone(m, `+91${m[1].replace(/\D/g, '')}`);
  for (const m of rest.matchAll(TOLL_FREE)) phone(m, m[0].replace(/\D/g, ''));
  for (const m of rest.matchAll(INTERNATIONAL)) phone(m, `+${m[0].replace(/\D/g, '')}`);

  return contacts;
}

const AMOUNT =
  /(?:₹|\b(?:rs|inr)\.?(?![a-z])|\$)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|lakhs?|lacs?)\b)?|\b(\d[\d,]*(?:\.\d+)?)\s?(?:\/-|rs\b\.?|rupees\b|inr\b)/gi;

export function extractAmounts(message: string): Amount[] {
  return [...message.matchAll(AMOUNT)].map((m) => {
    const digits = Number((m[1] ?? m[3]).replace(/,/g, ''));
    const unit = m[2]?.toLowerCase();
    const multiplier = unit === 'k' ? 1_000 : unit?.startsWith('la') ? 100_000 : 1;
    return { raw: m[0].trim(), value: digits * multiplier, currency: m[0].includes('$') ? 'USD' : 'INR', index: m.index };
  });
}

/** Words that ask the reader to pay. Devanagari has no \b, so those words match anywhere. */
export const PAYMENT_WORDS =
  /\b(pay|paying|payment|paid|fees?|deposit|charges?|refundable|transfer|upi|gpay|google pay|phonepe|paytm|advance|jama|bhejo|bhejein)\b|जमा|शुल्क|फीस|भुगतान/i;
const EARNING_WORDS =
  /\b(salary|earn|earning|earnings|income|stipend|per month|monthly|per day|daily|per week|weekly|ctc|lpa|package|win|won|prize|cashback|bonus|benefit|receive|get|claim|kamao|kamaye)\b|वेतन|कमाएं|कमाई/i;
const FEE_PHRASE =
  /\b(registration|processing|security|training|joining|verification|documentation|interview|application|onboarding|kit)\s+(fees?|charges?|deposit|amount)\b|\brefundable\s+(fees?|deposit|amount)\b/i;
const URGENCY =
  /\b(today only|only today|last date (is )?today|limited (seats|slots|vacancies|offer)|few (seats|slots) left|hurry|urgent(ly)?|immediately|act now|within \d+ (hours?|hrs?|minutes?)|expires? (today|tonight|soon)|don'?t miss|last chance|abhi apply)\b/i;

/** Splits into sentences without breaking at "Rs." or inside numbers. */
function sentences(message: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^\n!?।]+?(?:[!?।]+|\.(?=\s+[A-Z\u0900-\u097F])|\n|$)/g;
  for (const m of message.matchAll(re)) {
    const text = m[0].trim();
    if (text) out.push({ text, start: m.index + m[0].indexOf(text) });
  }
  return out;
}

const clip = (sentence: string, around = 0) => {
  if (sentence.length <= QUOTE_MAX) return sentence;
  const start = Math.max(0, Math.min(around - QUOTE_MAX / 2, sentence.length - QUOTE_MAX));
  return sentence.slice(start, start + QUOTE_MAX).trim();
};

/** Distance in characters from a span to the closest match of a pattern, or Infinity. */
function nearest(text: string, pattern: RegExp, from: number, to: number): number {
  let best = Infinity;
  for (const m of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    const end = m.index + m[0].length;
    best = Math.min(best, end <= from ? from - end : m.index >= to ? m.index - to : 0);
  }
  return best;
}

const NEAR_CHARS = 40;

/**
 * The sentence asking the reader to pay: a named fee ("registration fee"), or an amount whose
 * closest keyword is a payment word rather than an earning word ("pay ₹999" but not "earn ₹40,000").
 */
export function findPaymentQuote(message: string): string | undefined {
  for (const s of sentences(message)) {
    const fee = FEE_PHRASE.exec(s.text);
    if (fee) return clip(s.text, fee.index);
    for (const a of extractAmounts(s.text)) {
      const end = a.index + a.raw.length;
      const pay = nearest(s.text, PAYMENT_WORDS, a.index, end);
      const earn = nearest(s.text, EARNING_WORDS, a.index, end);
      // A tie goes to earning: a false payment request is a strong warning sign, so it must be unambiguous.
      if (pay <= NEAR_CHARS && pay < earn) return clip(s.text, a.index);
    }
  }
  return undefined;
}

export function findUrgencyQuotes(message: string): string[] {
  return sentences(message)
    .filter((s) => URGENCY.test(s.text))
    .map((s) => clip(s.text, URGENCY.exec(s.text)!.index))
    .slice(0, 3);
}

export function extractFromMessage(message: string): Extraction {
  return {
    contacts: extractContacts(message),
    amounts: extractAmounts(message),
    paymentQuote: findPaymentQuote(message),
    urgencyQuotes: findUrgencyQuotes(message),
  };
}
