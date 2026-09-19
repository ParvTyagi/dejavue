import type { LeakVerdict, OriginSkipReason } from '@/lib/leak/types';
import type { FlagStrength, OfferType, OfferVerdict } from '@/lib/offer/types';
import type { DateTrust, EngineId, SkipReason, Stage, Verdict } from '@/lib/shared/types';

export type Tone = 'bad' | 'warn' | 'good' | 'info' | 'muted';

export const VERDICT_LABEL: Record<Verdict, { title: string; stamp: string; tone: Tone }> = {
  RECYCLED: { title: 'Old media, new claim', stamp: 'Recycled', tone: 'bad' },
  MISPLACED: { title: 'Wrong location', stamp: 'Misplaced', tone: 'warn' },
  CONSISTENT: { title: 'Matches its claim', stamp: 'Consistent', tone: 'good' },
  CONTEXT_PLAUSIBLE: { title: 'Event is real, image unproven', stamp: 'Plausible', tone: 'info' },
  UNVERIFIED: { title: 'Not enough evidence', stamp: 'Unverified', tone: 'muted' },
};

/** No offer verdict uses the "good" tone: finding nothing wrong is not a clean bill of health. */
export const OFFER_VERDICT_LABEL: Record<OfferVerdict, { title: string; stamp: string; tone: Tone }> = {
  LIKELY_SCAM: { title: 'Likely a scam', stamp: 'Likely scam', tone: 'bad' },
  NO_RED_FLAGS: { title: 'No warning signs found', stamp: 'No red flags', tone: 'info' },
  UNVERIFIED: { title: 'Not enough evidence', stamp: 'Unverified', tone: 'muted' },
};

/**
 * No leak verdict uses the "good" tone, and none of them mentions a person: the
 * strongest thing a leak trace can say is where and when public copies appeared.
 */
export const LEAK_VERDICT_LABEL: Record<LeakVerdict, { title: string; stamp: string; tone: Tone }> = {
  LEAK_RECYCLED: { title: 'Old leak, shared as new', stamp: 'Recycled leak', tone: 'bad' },
  LEAK_EARLIEST_FOUND: { title: 'Earliest public copy found', stamp: 'Earliest copy', tone: 'warn' },
  LEAK_NOT_FOUND: { title: 'No public copy found', stamp: 'Not found', tone: 'muted' },
};

export const ORIGIN_SKIP_LABEL: Record<OriginSkipReason, string> = {
  no_original_url: 'the search engine gave no full-size link',
  budget: 'over the fetch limit',
  deadline: 'out of time',
  too_large: 'file too large',
  unreadable: 'could not be read as an image',
  blocked: 'address not allowed',
};

export const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  job: 'Job offer',
  govt_scheme: 'Government scheme',
  customer_support: 'Customer care',
  other: 'Message',
};

export const FLAG_STRENGTH_LABEL: Record<FlagStrength, { text: string; tone: Tone }> = {
  strong: { text: 'Strong sign', tone: 'bad' },
  medium: { text: 'Warning', tone: 'warn' },
  weak: { text: 'Minor', tone: 'muted' },
};

/** Colour tokens per tone, as CSS variables usable in inline styles and SVG. */
export const TONE_VAR: Record<Tone, string> = {
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  good: 'var(--good)',
  info: 'var(--info)',
  muted: 'var(--muted)',
};

export const ENGINE_LABEL: Record<EngineId, string> = {
  google_lens: 'Google Lens',
  bing_reverse_image: 'Bing Reverse Image',
  yandex_images: 'Yandex Images',
  google: 'Google Search',
  google_news: 'Google News',
  google_maps: 'Google Maps',
  youtube: 'YouTube',
  google_jobs: 'Google Jobs',
};

export const STAGES: { id: Stage; label: string; detail: string }[] = [
  { id: 'claim', label: 'Read the claim', detail: 'Event, place and date' },
  { id: 'scene', label: 'Read the scene', detail: 'Signs and landmarks' },
  { id: 'tier1', label: 'Google Lens', detail: 'Exact prior copies' },
  { id: 'tier2', label: 'Bing + Yandex', detail: 'Independent indexes' },
  { id: 'tier3', label: 'News, Maps, YouTube', detail: 'Corroboration' },
  { id: 'judge', label: 'Judge', detail: 'Deterministic rules' },
  { id: 'narrate', label: 'Explain', detail: 'Plain-language summary' },
];

export const OFFER_STAGES: { id: Stage; label: string; detail: string }[] = [
  { id: 'read', label: 'Read the message', detail: 'Contacts, amounts and requests' },
  { id: 'identity', label: 'Official website', detail: 'Who it claims to be' },
  { id: 'contacts', label: 'Scam reports', detail: 'Phone numbers, emails and links' },
  { id: 'offer', label: 'The offer itself', detail: 'Job listings, scheme pages, helplines' },
  { id: 'judge', label: 'Judge', detail: 'Fixed rules' },
];

export const LEAK_STAGES: { id: Stage; label: string; detail: string }[] = [
  { id: 'trace', label: 'Read the claim', detail: 'Date and claimed source' },
  { id: 'copies', label: 'Find public copies', detail: 'Lens, Bing, Yandex' },
  { id: 'dates', label: 'Date the copies', detail: 'When each one appeared' },
  { id: 'origin', label: 'Compare the copies', detail: 'Size, compression, cropping' },
  { id: 'judge', label: 'Judge', detail: 'Fixed rules' },
  { id: 'narrate', label: 'Explain', detail: 'Plain-language summary' },
];

/** Leak stages that spend searches, by the step number the trace reports in stepsRun. */
export const LEAK_STEP_NUMBER: Partial<Record<Stage, number>> = { copies: 1, dates: 2, origin: 3 };

/** Offer stages that spend searches, by the step number the check reports in stepsRun. */
export const OFFER_STEP_NUMBER: Partial<Record<Stage, number>> = { identity: 1, contacts: 2, offer: 3 };

const ENGINE_ID = new RegExp(String.raw`\b(${Object.keys(ENGINE_LABEL).join('|')})\b`, 'g');

/** Replaces engine ids in server messages ("Skipped google_maps: …") with their names. */
export const humanizeEngines = (message: string) => message.replace(ENGINE_ID, (id) => ENGINE_LABEL[id as EngineId]);

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  budget: 'over budget',
  deadline: 'out of time',
  halted: 'SerpApi refused',
};

export const DEFAULT_MAX_CREDITS = 6;

export const DATE_TRUST_LABEL: Record<DateTrust, string> = {
  metadata: 'page metadata',
  absolute_text: 'date in text',
  relative_text: 'relative date',
  none: 'no date',
};

export const displayDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
