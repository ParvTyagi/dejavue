import type { DateTrust, EngineId, Stage, Verdict } from '@/lib/shared/types';

export type Tone = 'bad' | 'warn' | 'good' | 'info' | 'muted';

export const VERDICT_LABEL: Record<Verdict, { title: string; stamp: string; tone: Tone }> = {
  RECYCLED: { title: 'Old media, new claim', stamp: 'Recycled', tone: 'bad' },
  MISPLACED: { title: 'Wrong location', stamp: 'Misplaced', tone: 'warn' },
  CONSISTENT: { title: 'Matches its claim', stamp: 'Consistent', tone: 'good' },
  CONTEXT_PLAUSIBLE: { title: 'Event is real, image unproven', stamp: 'Plausible', tone: 'info' },
  UNVERIFIED: { title: 'Not enough evidence', stamp: 'Unverified', tone: 'muted' },
};

/** Colour tokens per tone, as CSS variables usable in inline styles and SVG. */
export const TONE_VAR: Record<Tone, string> = {
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  good: 'var(--good)',
  info: 'var(--info)',
  muted: 'var(--muted)',
};

export const TONE_CLASS: Record<Tone, string> = {
  bad: 'text-bad border-bad/40 bg-bad-soft',
  warn: 'text-warn border-warn/40 bg-warn-soft',
  good: 'text-good border-good/40 bg-good-soft',
  info: 'text-info border-info/40 bg-info-soft',
  muted: 'text-muted border-line-strong bg-surface-2',
};

export const ENGINE_LABEL: Record<EngineId, string> = {
  google_lens: 'Google Lens',
  bing_reverse_image: 'Bing Reverse Image',
  yandex_images: 'Yandex Images',
  google: 'Google Search',
  google_news: 'Google News',
  google_maps: 'Google Maps',
  youtube: 'YouTube',
  google_trends: 'Google Trends',
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

export const DATE_TRUST_LABEL: Record<DateTrust, string> = {
  metadata: 'page metadata',
  absolute_text: 'date in text',
  relative_text: 'relative date',
  none: 'no date',
};

export const displayDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
