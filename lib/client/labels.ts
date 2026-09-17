import type { DateTrust, EngineId, Stage, Verdict } from '@/lib/shared/types';

export const VERDICT_LABEL: Record<Verdict, { title: string; tone: 'bad' | 'warn' | 'good' | 'info' | 'muted' }> = {
  RECYCLED: { title: 'Old media, new claim', tone: 'bad' },
  MISPLACED: { title: 'Wrong location', tone: 'bad' },
  CONSISTENT: { title: 'Matches its claim', tone: 'good' },
  CONTEXT_PLAUSIBLE: { title: 'Event is real, image unproven', tone: 'info' },
  UNVERIFIED: { title: 'Not enough evidence', tone: 'muted' },
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

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'claim', label: 'Read claim' },
  { id: 'scene', label: 'Read scene' },
  { id: 'tier1', label: 'Google Lens' },
  { id: 'tier2', label: 'Bing + Yandex' },
  { id: 'tier3', label: 'News, Maps, YouTube' },
  { id: 'judge', label: 'Judge' },
  { id: 'narrate', label: 'Explain' },
];

export const DATE_TRUST_LABEL: Record<DateTrust, string> = {
  metadata: 'page metadata',
  absolute_text: 'date in text',
  relative_text: 'relative date',
  none: 'no date',
};

export const TONE_CLASS = {
  bad: 'bg-bad-soft text-bad border-bad/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  good: 'bg-good-soft text-good border-good/30',
  info: 'bg-info-soft text-info border-info/30',
  muted: 'bg-surface-2 text-muted border-line',
} as const;

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
