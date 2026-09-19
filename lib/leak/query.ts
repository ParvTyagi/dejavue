import { redactPersonalData } from '@/lib/shared/redact';

// The last thing every leak-trace search passes through.
//
// A leaked document is somebody's payroll, admissions list or medical form. Searching a
// phone number or an employee id out of one would publish it to a search engine, tie it
// to the leak in that engine's logs, and do the exact harm the trace exists to limit. So
// no query is built from text read out of the image at all, and the one query built from
// a search result's own page title still goes through here first.

/** Letters left after redaction, below which there is no query worth sending. */
const MIN_MEANINGFUL_LETTERS = 3;

/**
 * A query with personal data taken out, or undefined when nothing usable is left. The
 * caller must skip the search when it gets undefined rather than fall back to the
 * original text.
 */
export function scrubQuery(query: string): string | undefined {
  const cleaned = redactPersonalData(query)
    .replace(/\[(?:email|number|id)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const letters = cleaned.replace(/[^\p{L}]/gu, '').length;
  return letters >= MIN_MEANINGFUL_LETTERS ? cleaned : undefined;
}
