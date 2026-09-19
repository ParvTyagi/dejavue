import { hamming, HAMMING } from '@/lib/media/phash';
import type { Evidence } from '@/lib/shared/types';

/** Fetches a thumbnail and returns its pHash, or undefined if it can't be read. */
export type ThumbnailHasher = (url: string) => Promise<string | undefined>;

const MAX_PER_ENGINE = 8;

/**
 * A search result only counts as a visual match after its thumbnail is
 * re-hashed and found within Hamming 10 of one of the input frames.
 */
export async function confirmMatches(
  evidence: Evidence[],
  inputHashes: (string | undefined)[],
  hashThumbnail: ThumbnailHasher,
): Promise<Evidence[]> {
  // A frame whose hash could not be computed cannot confirm anything, and comparing
  // against it would throw. Dropping it leaves the remaining frames to decide.
  const hashes = inputHashes.filter((h): h is string => !!h);
  if (hashes.length === 0) {
    return evidence.map((ev) =>
      ev.kind === 'visual_match' || ev.kind === 'video' ? { ...ev, match: { hamming: 64, confirmed: false } } : ev,
    );
  }
  return Promise.all(
    evidence.map(async (ev, i) => {
      if (ev.kind !== 'visual_match' && ev.kind !== 'video') return ev;
      if (!ev.thumbnailUrl || i >= MAX_PER_ENGINE) return { ...ev, match: { hamming: 64, confirmed: false } };
      const h = await hashThumbnail(ev.thumbnailUrl).catch(() => undefined);
      if (!h) return { ...ev, match: { hamming: 64, confirmed: false } };
      const distance = Math.min(...hashes.map((f) => hamming(f, h)));
      return { ...ev, match: { hamming: distance, confirmed: distance <= HAMMING.confirmedMatch } };
    }),
  );
}
