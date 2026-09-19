import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { measureImage } from '@/lib/leak/features';
import { estimateJpegQuality, isJpeg, readLuminanceTable } from '@/lib/leak/jpeg';
import { compareCopies, MAX_ORIGINALS, type FullImageFetcher } from '@/lib/leak/originals';
import { cropCoverage, rankCopies, type MeasuredCopy } from '@/lib/leak/rank';
import type { Evidence } from '@/lib/shared/types';

const W = 900;
const H = 640;

/**
 * A stand-in for a photographed document: paper-coloured, with dark bands where the
 * lines of text would be and a heading block, so crops of it differ from each other.
 */
async function sourceDocument(): Promise<Buffer> {
  const rows: string[] = [];
  for (let i = 0; i < 14; i++) {
    const y = 60 + i * 38;
    const width = 120 + ((i * 97) % 600);
    rows.push(`<rect x="70" y="${y}" width="${width}" height="16" fill="#2a2a2a" opacity="${0.55 + (i % 4) * 0.1}" />`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#efe9dd" />
    <rect x="60" y="20" width="420" height="26" fill="#111" />
    <circle cx="760" cy="120" r="70" fill="#8a8a8a" opacity="0.5" />
    ${rows.join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 96 }).toBuffer();
}

const resized = (bytes: Buffer, width: number, quality = 92) =>
  sharp(bytes).resize({ width }).jpeg({ quality }).toBuffer();

const recompressed = (bytes: Buffer, quality: number) => sharp(bytes).jpeg({ quality }).toBuffer();

const cropped = (bytes: Buffer, fraction: number, quality = 92) =>
  sharp(bytes)
    .extract({
      left: Math.round((W * (1 - fraction)) / 2),
      top: Math.round((H * (1 - fraction)) / 2),
      width: Math.round(W * fraction),
      height: Math.round(H * fraction),
    })
    .jpeg({ quality })
    .toBuffer();

async function measured(evidenceId: string, bytes: Buffer): Promise<MeasuredCopy> {
  const features = await measureImage(bytes);
  if (!features) throw new Error(`Could not measure ${evidenceId}`);
  return { ...features, evidenceId, domain: `${evidenceId}.example` };
}

describe('estimating JPEG quality from the quantisation tables', () => {
  it('reads back roughly the quality an image was saved at', async () => {
    const source = await sourceDocument();
    for (const quality of [40, 60, 75, 90]) {
      const bytes = await recompressed(source, quality);
      expect(isJpeg(bytes)).toBe(true);
      expect(estimateJpegQuality(bytes)).toBeGreaterThan(quality - 6);
      expect(estimateJpegQuality(bytes)).toBeLessThan(quality + 6);
    }
  });

  it('orders two copies of the same image by how hard they were compressed', async () => {
    const source = await sourceDocument();
    const [light, heavy] = await Promise.all([recompressed(source, 95), recompressed(source, 35)]);
    expect(estimateJpegQuality(light)!).toBeGreaterThan(estimateJpegQuality(heavy)!);
  });

  it('reads a 64-entry luminance table and skips formats that have none', async () => {
    const source = await sourceDocument();
    expect(readLuminanceTable(source)).toHaveLength(64);
    const png = await sharp(source).png().toBuffer();
    expect(isJpeg(png)).toBe(false);
    expect(estimateJpegQuality(png)).toBeUndefined();
    expect(readLuminanceTable(Buffer.from('not an image at all'))).toBeUndefined();
  });
});

describe('measuring one copy', () => {
  it('reports true pixel dimensions and a comparable grayscale', async () => {
    const source = await sourceDocument();
    const features = await measureImage(source);
    expect(features).toMatchObject({ width: W, height: H });
    expect(features!.luma).toHaveLength(64 * 64);
    expect(features!.jpegQuality).toBeGreaterThan(80);
  });

  it('returns nothing for bytes that are not an image', async () => {
    expect(await measureImage(Buffer.from('<html>not an image</html>'))).toBeUndefined();
  });
});

describe('crop coverage', () => {
  it('measures how much of the scene each copy shows', async () => {
    const source = await sourceDocument();
    const [full, half] = await Promise.all([
      measured('full', source),
      measured('half', await cropped(source, 0.6)),
    ]);
    const [fullCoverage, halfCoverage] = cropCoverage([full, half]);
    expect(fullCoverage).toBe(1);
    // 0.6 of each side is 0.36 of the area.
    expect(halfCoverage).toBeGreaterThan(0.3);
    expect(halfCoverage).toBeLessThan(0.42);
  });

  it('is not fooled by a copy that was only resized', async () => {
    const source = await sourceDocument();
    const copies = await Promise.all([measured('big', source), measured('small', await resized(source, 320))]);
    expect(cropCoverage(copies)).toEqual([1, 1]);
  });

  it('still measures the widest framing as 1 when the largest file is itself a crop', async () => {
    const source = await sourceDocument();
    // The cropped copy is upscaled, so it has the most pixels while showing the least.
    const copies = await Promise.all([
      measured('wide', await resized(source, 700)),
      measured('zoomed', await sharp(await cropped(source, 0.5)).resize({ width: 1400 }).jpeg().toBuffer()),
    ]);
    const [wide, zoomed] = cropCoverage(copies);
    expect(wide).toBe(1);
    // Half of each side, so a quarter of the scene, however many pixels it was blown up to.
    expect(zoomed).toBeGreaterThan(0.2);
    expect(zoomed).toBeLessThan(0.32);
  });

  it('leaves framing uncompared when two copies are not the same picture', async () => {
    const source = await sourceDocument();
    const other = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#204080' } })
      .jpeg()
      .toBuffer();
    expect(cropCoverage(await Promise.all([measured('a', source), measured('b', other)]))).toEqual([1, 1]);
  });
});

describe('ranking copies of one source', () => {
  it('puts the untouched source first and says why', async () => {
    const source = await sourceDocument();
    const copies = await Promise.all([
      measured('c-small', await resized(source, 300)),
      measured('a-source', source),
      measured('d-cropped', await cropped(source, 0.55)),
      measured('b-recompressed', await recompressed(source, 30)),
    ]);
    const ranked = rankCopies(copies);
    expect(ranked[0].evidenceId).toBe('a-source');
    expect(ranked[0].reasons).toEqual(['largest resolution', 'least compressed', 'least cropped']);
    expect(ranked.map((r) => r.evidenceId)).toHaveLength(4);
    // The cropped copy shows least of the scene, so it ranks last.
    expect(ranked[ranked.length - 1].evidenceId).toBe('d-cropped');
  });

  it('gives the same order however the copies arrive', async () => {
    const source = await sourceDocument();
    const copies = await Promise.all([
      measured('a', source),
      measured('b', await resized(source, 450)),
      measured('c', await recompressed(source, 45)),
    ]);
    const order = (list: MeasuredCopy[]) => rankCopies(list).map((r) => r.evidenceId);
    expect(order([...copies].reverse())).toEqual(order(copies));
    expect(rankCopies(copies)).toEqual(rankCopies([...copies].reverse()));
  });

  it('names no leader on a measure the copies do not differ on', async () => {
    const source = await sourceDocument();
    const copies = await Promise.all([measured('a', source), measured('b', await recompressed(source, 40))]);
    const ranked = rankCopies(copies);
    // Same pixels and same framing: only compression tells these two apart.
    expect(ranked[0].reasons).toEqual(['least compressed']);
  });

  it('ranks a lossless copy on what can be measured, without inventing a quality for it', async () => {
    const source = await sourceDocument();
    const png = await sharp(source).png().toBuffer();
    const ranked = rankCopies(await Promise.all([measured('png', png), measured('jpeg', await recompressed(source, 40))]));
    expect(ranked[0].evidenceId).toBe('png');
    expect(ranked[0].jpegQuality).toBeUndefined();
    expect(ranked[0].reasons).not.toContain('least compressed');
  });

  it('handles having nothing, or only one copy, to compare', async () => {
    expect(rankCopies([])).toEqual([]);
    const only = await measured('only', await sourceDocument());
    expect(rankCopies([only])).toEqual([{ ...only, luma: undefined, coverage: 1, reasons: [] }].map(({ luma: _l, ...c }) => c));
  });
});

const confirmedCopy = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id,
  engine: 'bing_reverse_image',
  kind: 'visual_match',
  url: `https://${id}.example/page`,
  domain: `${id}.example`,
  dateTrust: 'none',
  trustedSource: false,
  match: { hamming: 2, confirmed: true },
  original: { url: `https://${id}.example/full.jpg` },
  ...over,
});

describe('fetching the full-size copies', () => {
  const never = new AbortController().signal;

  it('fetches only engine-supplied originals, never thumbnails, and ranks what it got', async () => {
    const source = await sourceDocument();
    const asked: string[] = [];
    const fetchOriginal: FullImageFetcher = async (url) => {
      asked.push(url);
      return { ok: true, bytes: url.includes('small') ? await resized(source, 300) : source };
    };
    const hint = await compareCopies(
      [
        confirmedCopy('small'),
        confirmedCopy('big'),
        confirmedCopy('lens', { engine: 'google_lens', original: undefined, thumbnailUrl: 'https://t.example/thumb.jpg' }),
      ],
      { fetchOriginal, timeoutMs: 1_000, signal: never },
    );
    expect(asked).toEqual(['https://small.example/full.jpg', 'https://big.example/full.jpg']);
    expect(asked.some((u) => u.includes('thumb'))).toBe(false);
    expect(hint.fetched).toBe(2);
    expect(hint.ranked[0].evidenceId).toBe('big');
    expect(hint.skipped).toEqual([{ evidenceId: 'lens', reason: 'no_original_url' }]);
  });

  it('records a reason for every copy it could not measure', async () => {
    const fetchOriginal: FullImageFetcher = async (url) => {
      if (url.includes('huge')) return { ok: false, reason: 'too_large' };
      if (url.includes('private')) return { ok: false, reason: 'blocked' };
      if (url.includes('broken')) return { ok: true, bytes: Buffer.from('not an image') };
      throw new Error('network died');
    };
    const hint = await compareCopies(
      [confirmedCopy('huge'), confirmedCopy('private'), confirmedCopy('broken'), confirmedCopy('offline')],
      { fetchOriginal, timeoutMs: 1_000, signal: never },
    );
    expect(hint).toEqual({
      ranked: [],
      fetched: 0,
      skipped: [
        { evidenceId: 'huge', reason: 'too_large' },
        { evidenceId: 'private', reason: 'blocked' },
        { evidenceId: 'broken', reason: 'unreadable' },
        { evidenceId: 'offline', reason: 'unreadable' },
      ],
    });
  });

  it('stops at the fetch limit and records the rest as over budget', async () => {
    const source = await sourceDocument();
    const fetchOriginal: FullImageFetcher = async () => ({ ok: true, bytes: source });
    const many = Array.from({ length: MAX_ORIGINALS + 3 }, (_, i) => confirmedCopy(`c${String(i).padStart(2, '0')}`));
    const hint = await compareCopies(many, { fetchOriginal, timeoutMs: 1_000, signal: never });
    expect(hint.fetched).toBe(MAX_ORIGINALS);
    expect(hint.skipped).toEqual([
      { evidenceId: 'c08', reason: 'budget' },
      { evidenceId: 'c09', reason: 'budget' },
      { evidenceId: 'c10', reason: 'budget' },
    ]);
  });

  it('skips everything left when the audit deadline has passed', async () => {
    const aborted = AbortSignal.abort();
    const fetchOriginal: FullImageFetcher = async () => {
      throw new Error('should not be called');
    };
    const hint = await compareCopies([confirmedCopy('a'), confirmedCopy('b')], {
      fetchOriginal,
      timeoutMs: 1_000,
      signal: aborted,
    });
    expect(hint.fetched).toBe(0);
    expect(hint.skipped).toEqual([
      { evidenceId: 'a', reason: 'deadline' },
      { evidenceId: 'b', reason: 'deadline' },
    ]);
  });
});
