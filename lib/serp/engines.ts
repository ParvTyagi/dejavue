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

// Offer checks. Searches are set to India.
const INDIA = { gl: 'in', hl: 'en' };

/** Finds an organisation's or scheme's own website. */
export const officialSiteSearch = (name: string): EngineRequest => ({
  engine: 'google',
  params: { q: `${name.slice(0, 100)} official website`, ...INDIA },
});

/** Pages mentioning a phone number, email or domain, used to find scam reports. */
export const contactSearch = (q: string): EngineRequest => ({ engine: 'google', params: { q, ...INDIA } });

export const jobsSearch = (q: string): EngineRequest => ({ engine: 'google_jobs', params: { q: q.slice(0, 120), ...INDIA } });

/** A scheme's page on a government site. */
export const schemeSearch = (scheme: string, site: string): EngineRequest => ({
  engine: 'google',
  params: { q: `site:${site} "${scheme.slice(0, 100)}"`, ...INDIA },
});

/** Google results published before a date, used to date a match that has none. */
export const datedSearch = (title: string, before: string): EngineRequest => {
  const d = new Date(before);
  const mdy = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  return { engine: 'google', params: { q: `"${title.slice(0, 120)}"`, tbs: `cdr:1,cd_max:${mdy}` } };
};
