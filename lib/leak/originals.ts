import type { Evidence } from '@/lib/shared/types';
import { measureImage } from './features';
import { rankCopies, type MeasuredCopy } from './rank';
import type { OriginHint, OriginSkipReason } from './types';

// Fetching the full-size copies so they can be compared.
//
// These are ordinary image downloads, not SerpApi searches, so they cost no credits —
// but they are still work done on someone else's server, so they are counted and every
// one that is not done is recorded with a reason, exactly as skipped searches are.

/** At most this many full-size images per trace. */
export const MAX_ORIGINALS = 8;
/** A leaked scan can be large; anything past this is not worth the bandwidth. */
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

export type FetchedImage = { ok: true; bytes: Buffer } | { ok: false; reason: OriginSkipReason };

/**
 * Downloads one full-size image. Implementations must refuse anything that is not a
 * public https address (SSRF) and anything over `maxBytes`.
 */
export type FullImageFetcher = (url: string, opts: { timeoutMs: number; maxBytes: number }) => Promise<FetchedImage>;

export interface CompareOptions {
  fetchOriginal: FullImageFetcher;
  /** Per-image timeout, already clamped to what is left of the audit deadline. */
  timeoutMs: number;
  /** The audit deadline. Copies still unfetched when it fires are skipped, not waited for. */
  signal: AbortSignal;
  maxCopies?: number;
  maxBytes?: number;
}

/**
 * Measures the full-size image behind each confirmed copy and ranks them by how close
 * each looks to an undegraded original.
 *
 * Only an engine-supplied original URL is ever fetched. Thumbnails are deliberately
 * ignored: every engine resizes and re-encodes them, so they would measure the engine's
 * pipeline rather than the copy. Decoded pixels live in memory for the length of one
 * measurement and are then dropped.
 */
export async function compareCopies(confirmed: Evidence[], opts: CompareOptions): Promise<OriginHint> {
  const maxCopies = opts.maxCopies ?? MAX_ORIGINALS;
  const maxBytes = opts.maxBytes ?? MAX_ORIGINAL_BYTES;
  const skipped: { evidenceId: string; reason: OriginSkipReason }[] = [];
  const candidates: { evidence: Evidence; url: string }[] = [];

  for (const e of confirmed) {
    const url = e.original?.url;
    if (!url) {
      // Google Lens documents no original URL for exact matches, only the thumbnail and
      // the dimensions, so its copies land here rather than being fetched.
      skipped.push({ evidenceId: e.id, reason: 'no_original_url' });
    } else if (candidates.length >= maxCopies) {
      skipped.push({ evidenceId: e.id, reason: 'budget' });
    } else {
      candidates.push({ evidence: e, url });
    }
  }

  const measured = await Promise.all(
    candidates.map(async ({ evidence, url }): Promise<MeasuredCopy | { reason: OriginSkipReason }> => {
      if (opts.signal.aborted) return { reason: 'deadline' };
      const got = await opts.fetchOriginal(url, { timeoutMs: opts.timeoutMs, maxBytes }).catch(
        (): FetchedImage => ({ ok: false, reason: 'unreadable' }),
      );
      if (!got.ok) return { reason: got.reason };
      const features = await measureImage(got.bytes);
      return features ? { ...features, evidenceId: evidence.id, domain: evidence.domain } : { reason: 'unreadable' };
    }),
  );

  const copies: MeasuredCopy[] = [];
  measured.forEach((result, i) => {
    if ('reason' in result) skipped.push({ evidenceId: candidates[i].evidence.id, reason: result.reason });
    else copies.push(result);
  });
  // Skips are reported in the order the evidence arrived, whichever step added them.
  const order = new Map(confirmed.map((e, i) => [e.id, i]));
  skipped.sort((a, b) => (order.get(a.evidenceId) ?? 0) - (order.get(b.evidenceId) ?? 0));

  return { ranked: rankCopies(copies), fetched: copies.length, skipped };
}
