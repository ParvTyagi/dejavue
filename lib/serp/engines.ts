import type { Claim, EngineId } from '@/lib/shared/types';

// Request parameters for each engine. Names follow SerpApi's docs; confirm in
// the SerpApi playground before recording fixtures.

export interface EngineRequest {
  engine: EngineId;
  params: Record<string, string>;
  frameIndex?: number;
}

export const lensExact = (url: string, frameIndex: number): EngineRequest => ({
  engine: 'google_lens',
  params: { url, type: 'exact_matches' },
  frameIndex,
});

export const bingReverse = (url: string, frameIndex: number): EngineRequest => ({
  engine: 'bing_reverse_image',
  params: { image_url: url },
  frameIndex,
});

export const yandexByUrl = (url: string, frameIndex: number): EngineRequest => ({
  engine: 'yandex_images',
  params: { url },
  frameIndex,
});

export const newsFor = (claim: Claim): EngineRequest | undefined => {
  const q = [claim.event, claim.place].filter(Boolean).join(' ').trim();
  return q ? { engine: 'google_news', params: { q } } : undefined;
};

export const mapsPlace = (q: string): EngineRequest => ({
  engine: 'google_maps',
  params: { q, type: 'search' },
});

export const youtubeFor = (claim: Claim): EngineRequest => ({
  engine: 'youtube',
  params: { search_query: (claim.event ?? claim.rawText).slice(0, 100) },
});

/** Google results published before a date, used to date a match that has none. */
export const datedSearch = (title: string, before: string): EngineRequest => {
  const d = new Date(before);
  const mdy = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  return { engine: 'google', params: { q: `"${title.slice(0, 120)}"`, tbs: `cdr:1,cd_max:${mdy}` } };
};
