// Hides personal data in text that is about to be shown, shared or exported.
//
// Leaked documents are full of it, and a result card is made to be forwarded, so
// anything that leaves DejaVue goes through here first. Kept free of imports so the
// browser, the API routes and the audit pipeline can all use it.

/** A written phone number: digits with spaces or dashes between them. */
const PHONE_LIKE = /\+?\d[\d\s-]{7,}\d/g;
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
/** Indian PAN: five letters, four digits, one letter. */
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
/**
 * Any run of six or more digits: Aadhaar numbers, account numbers, employee ids and
 * customer references are all written this way. Prices and years are shorter or
 * carry separators ("40,000", "2026"), so they stay readable.
 */
const LONG_NUMBER = /\b\d{6,}\b/g;

/**
 * Dates written with dashes, which the phone pattern would otherwise swallow: 2024-01-08
 * and 12-10-2026 are both digits joined by dashes. Every result here is built around
 * dates, so redacting them would make the answer unreadable. A phone number written in
 * groups (98765-43210, 123-456-7890) does not fit either shape.
 */
const DASHED_DATE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}-\d{2,4})$/;

/**
 * Replaces emails, phone numbers and id-like numbers with labels. Deliberately blunt:
 * over-redacting a shared card costs nothing, while leaking one real number does.
 * Running it twice changes nothing, so callers can redact without tracking whether some
 * earlier step already did.
 */
export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(PAN, '[id]')
    .replace(PHONE_LIKE, (match) => (DASHED_DATE.test(match.trim()) ? match : '[number]'))
    .replace(LONG_NUMBER, '[number]');
}
