// 64-bit DCT perceptual hash. Pure and dependency-free so the browser and the
// server produce comparable hashes from the same grayscale pixels.

export interface GrayImage {
  width: number;
  height: number;
  /** One luma value (0–255) per pixel, row-major. */
  data: ArrayLike<number>;
}

const SIZE = 32;
const LOW = 8;

/** Converts interleaved RGB or RGBA bytes to luma with L = 0.299R + 0.587G + 0.114B. */
export function toGray(width: number, height: number, pixels: ArrayLike<number>, channels: 3 | 4): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += channels) {
    data[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }
  return { width, height, data };
}

function resizeArea(img: GrayImage): Float64Array {
  const out = new Float64Array(SIZE * SIZE);
  for (let ty = 0; ty < SIZE; ty++) {
    const y0 = Math.floor((ty * img.height) / SIZE);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.height) / SIZE));
    for (let tx = 0; tx < SIZE; tx++) {
      const x0 = Math.floor((tx * img.width) / SIZE);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.width) / SIZE));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < Math.min(y1, img.height); y++) {
        for (let x = x0; x < Math.min(x1, img.width); x++) {
          sum += img.data[y * img.width + x];
          n++;
        }
      }
      out[ty * SIZE + tx] = n ? sum / n : 0;
    }
  }
  return out;
}

const COS = (() => {
  const table = new Float64Array(LOW * SIZE);
  for (let u = 0; u < LOW; u++) {
    for (let x = 0; x < SIZE; x++) table[u * SIZE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE));
  }
  return table;
})();

export function pHash(img: GrayImage): string {
  const px = resizeArea(img);
  const coeffs: number[] = [];
  for (let v = 0; v < LOW; v++) {
    for (let u = 0; u < LOW; u++) {
      let sum = 0;
      for (let y = 0; y < SIZE; y++) {
        const cy = COS[v * SIZE + y];
        for (let x = 0; x < SIZE; x++) sum += px[y * SIZE + x] * COS[u * SIZE + x] * cy;
      }
      const au = u === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE);
      const av = v === 0 ? Math.sqrt(1 / SIZE) : Math.sqrt(2 / SIZE);
      coeffs.push(sum * au * av);
    }
  }
  const ac = coeffs.slice(1);
  const sorted = [...ac].sort((a, b) => a - b);
  // 63 AC coefficients, so the median is the single middle element. Averaging
  // elements 31 and 32 (the even-length formula) biased the threshold upwards
  // and left the hash with slightly fewer set bits than it should have.
  const median = sorted[31];
  // Bit 0 is the dropped DC coefficient and is always 0.
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < 64; i++) {
    if (coeffs[i] <= median) continue;
    if (i < 32) hi |= 1 << (31 - i);
    else lo |= 1 << (63 - i);
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

function popcount32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hamming(a: string, b: string): number {
  const d =
    popcount32((parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0) +
    popcount32((parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0);
  return d;
}

export const HAMMING = {
  sameImage: 6,
  confirmedMatch: 10,
} as const;

/** True when any of the hashes is the same image as `pHash` (Hamming ≤ 6). */
export function isSameImage(hashes: string[], pHash: string): boolean {
  return hashes.some((h) => hamming(h, pHash) <= HAMMING.sameImage);
}
