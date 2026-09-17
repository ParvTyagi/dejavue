import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hamming, HAMMING, pHash, toGray } from '@/lib/media/phash';
import { hashImageBuffer } from '@/lib/server/deps';

// The browser worker and the server both hash grayscale pixels with pHash(),
// so these pairs pin down the shared behaviour on real encode/decode paths.

const W = 640;
const H = 480;

/** Deterministic synthetic scenes: blobs, stripes and gradients seeded per id. */
function scene(seed: number): Promise<Buffer> {
  const rand = (() => {
    let s = seed * 2654435761;
    return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  })();
  const shapes = Array.from({ length: 14 }, () => {
    const x = Math.round(rand() * W);
    const y = Math.round(rand() * H);
    const r = Math.round(20 + rand() * 120);
    const c = `rgb(${Math.round(rand() * 255)},${Math.round(rand() * 255)},${Math.round(rand() * 255)})`;
    return rand() > 0.5
      ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`
      : `<rect x="${x}" y="${y}" width="${r * 2}" height="${r}" fill="${c}" transform="rotate(${Math.round(rand() * 90)} ${x} ${y})"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="${rand().toFixed(2)}" y2="1">
      <stop offset="0" stop-color="rgb(${Math.round(rand() * 255)},90,40)"/><stop offset="1" stop-color="rgb(20,${Math.round(rand() * 255)},160)"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${shapes.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const variants: [string, (b: Buffer) => Promise<Buffer>][] = [
  ['JPEG quality 35', (b) => sharp(b).jpeg({ quality: 35 }).toBuffer()],
  ['downscaled to 240 px thumbnail', (b) => sharp(b).resize({ width: 240 }).jpeg({ quality: 60 }).toBuffer()],
  ['WebP re-encode', (b) => sharp(b).webp({ quality: 50 }).toBuffer()],
  ['3% border crop', (b) =>
    sharp(b).extract({ left: 19, top: 14, width: W - 38, height: H - 28 }).jpeg({ quality: 80 }).toBuffer()],
  ['slight brightness change', (b) => sharp(b).modulate({ brightness: 1.08 }).jpeg().toBuffer()],
];

describe('pHash', () => {
  it('produces 16 hex chars with the DC bit clear', async () => {
    const h = await hashImageBuffer(await scene(1));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(parseInt(h[0], 16) & 0x8).toBe(0);
  });

  it('matches the same result from raw RGBA pixels, as the browser canvas provides', async () => {
    const png = await scene(2);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(pHash(toGray(info.width, info.height, data, 4))).toBe(await hashImageBuffer(png));
  });

  describe.each([3, 4, 5, 6])('scene %i', (seed) => {
    it.each(variants)('treats a %s as the same image', async (_name, transform) => {
      const original = await scene(seed);
      const d = hamming(await hashImageBuffer(original), await hashImageBuffer(await transform(original)));
      expect(d).toBeLessThanOrEqual(HAMMING.confirmedMatch);
    });
  });

  it('tells different scenes apart', async () => {
    const hashes = await Promise.all([10, 11, 12, 13, 14, 15].map(async (s) => hashImageBuffer(await scene(s))));
    for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) expect(hamming(hashes[i], hashes[j])).toBeGreaterThan(HAMMING.confirmedMatch);
    }
  });

  it('measures Hamming distance bit by bit', () => {
    expect(hamming('0000000000000000', '0000000000000000')).toBe(0);
    expect(hamming('7fffffffffffffff', '0000000000000000')).toBe(63);
    expect(hamming('00000000000000f0', '000000000000000f')).toBe(8);
  });
});
