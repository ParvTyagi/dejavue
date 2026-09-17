import { extractDate } from '@/lib/evidence/dates';
import { scaleFromPlaceType } from '@/lib/evidence/geo';
import type { EngineId, Evidence, GeoPoint } from '@/lib/shared/types';

// Response field names follow SerpApi's documented JSON. Engines whose shapes
// vary (Bing, Yandex) accept several candidate arrays; confirm against
// recorded responses before relying on them.

type Item = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const arr = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);

function firstArray(raw: Item, keys: string[]): Item[] {
  for (const k of keys) {
    const a = arr(raw[k]);
    if (a.length) return a;
  }
  return [];
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isTrusted(domain: string, trusted: ReadonlySet<string>): boolean {
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (trusted.has(parts.slice(i).join('.'))) return true;
  return false;
}

function thumbnailOf(item: Item): string | undefined {
  const t = item.thumbnail;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return str((t as Item).static) ?? str((t as Item).rich);
  return str(item.image);
}

export interface NormalizeContext {
  fetchedAt: Date;
  trustedDomains: ReadonlySet<string>;
  /** Prefix that keeps evidence ids unique and stable within one audit. */
  idPrefix: string;
}

function build(
  engine: EngineId,
  kind: Evidence['kind'],
  items: Item[],
  ctx: NormalizeContext,
  pick: (item: Item) => { url?: string; title?: string; snippet?: string; iso?: string; text: (string | undefined)[] },
): Evidence[] {
  const out: Evidence[] = [];
  items.forEach((item, i) => {
    const p = pick(item);
    if (!p.url) return;
    const domain = domainOf(p.url);
    if (!domain) return;
    const date = extractDate({ iso: p.iso, text: p.text.filter((t): t is string => !!t) }, ctx.fetchedAt);
    out.push({
      id: `${ctx.idPrefix}-${i}`,
      engine,
      kind,
      url: p.url,
      domain,
      title: p.title?.slice(0, 200),
      snippet: p.snippet?.slice(0, 400),
      thumbnailUrl: thumbnailOf(item),
      publishedAt: date.publishedAt,
      dateTrust: date.dateTrust,
      trustedSource: isTrusted(domain, ctx.trustedDomains),
    });
  });
  return out;
}

export function toEvidence(engine: EngineId, raw: unknown, ctx: NormalizeContext): Evidence[] {
  const r = (raw ?? {}) as Item;
  switch (engine) {
    case 'google_lens':
      return build(engine, 'visual_match', firstArray(r, ['exact_matches', 'visual_matches']), ctx, (it) => ({
        url: str(it.link),
        title: str(it.title),
        text: [str(it.date)],
      }));
    case 'bing_reverse_image':
      return build(
        engine,
        'visual_match',
        firstArray(r, ['related_content', 'pages_including', 'page_with_similar_images', 'visual_search_results']),
        ctx,
        (it) => ({ url: str(it.link), title: str(it.title), text: [str(it.date)] }),
      );
    case 'yandex_images':
      return build(engine, 'visual_match', firstArray(r, ['image_results', 'sites', 'similar_images']), ctx, (it) => ({
        url: str(it.link) ?? str(it.source),
        title: str(it.title),
        snippet: str(it.snippet),
        text: [str(it.date)],
      }));
    case 'google_news':
      return build(engine, 'article', arr(r.news_results), ctx, (it) => ({
        url: str(it.link),
        title: str(it.title),
        snippet: str(it.snippet),
        iso: str(it.iso_date),
        text: [str(it.date)],
      }));
    case 'google':
      return build(engine, 'article', arr(r.organic_results), ctx, (it) => ({
        url: str(it.link),
        title: str(it.title),
        snippet: str(it.snippet),
        text: [str(it.date)],
      }));
    case 'youtube':
      return build(engine, 'video', arr(r.video_results), ctx, (it) => ({
        url: str(it.link),
        title: str(it.title),
        snippet: str(it.description),
        text: [str(it.published_date)],
      }));
    case 'google_jobs':
      return build(engine, 'listing', arr(r.jobs_results), ctx, (it) => ({
        url: str(arr(it.apply_options)[0]?.link) ?? str(it.share_link),
        title: [str(it.title), str(it.company_name)].filter(Boolean).join(' · '),
        snippet: [str(it.location), str(it.via)].filter(Boolean).join(' · '),
        text: [str((it.detected_extensions as Item | undefined)?.posted_at)],
      }));
    case 'google_trends':
      return [];
    case 'google_maps':
      return [];
  }
}

/** Last address segment that names a country rather than a postcode. */
function countryFromAddress(address: string | undefined): string | undefined {
  const parts = (address ?? '').split(',').map((p) => p.trim()).reverse();
  return parts.find((p) => /[a-z]/i.test(p) && !/\d/.test(p));
}

/** Top place from a Google Maps search, or undefined when Maps found nothing. */
export function toPlace(raw: unknown): GeoPoint | undefined {
  const r = (raw ?? {}) as Item;
  const place = (r.place_results as Item | undefined) ?? arr(r.local_results)[0];
  if (!place) return undefined;
  const gps = place.gps_coordinates as { latitude?: number; longitude?: number } | undefined;
  if (typeof gps?.latitude !== 'number' || typeof gps?.longitude !== 'number') return undefined;
  const address = str(place.address);
  const type = str(place.type) ?? arr(place.types).map(String)[0];
  return {
    lat: gps.latitude,
    lng: gps.longitude,
    label: str(place.title) ?? address ?? 'Unknown place',
    scale: scaleFromPlaceType(type),
    country: countryFromAddress(address) ?? (scaleFromPlaceType(type) === 'country' ? str(place.title) : undefined),
  };
}
