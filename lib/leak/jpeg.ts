// Estimates how hard a JPEG was compressed, by reading its quantisation tables.
//
// A copy that has been saved and re-saved by several apps is further from the
// original than one that has not. The encoder's quality setting is not stored in the
// file, but the quantisation table it produced is, and the table is a direct function
// of that setting in every encoder that follows the IJG (libjpeg) formula, which is
// almost all of them. Pure and dependency-free so it can be unit-tested on bytes.

/** Annex K luminance quantisation table, in natural (row-major) order. */
const STANDARD_LUMINANCE = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/** Natural index of each position in the zig-zag order tables are stored in. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47,
  55, 62, 63,
];

const SOI = 0xd8;
const SOS = 0xda;
const DQT = 0xdb;
const EOI = 0xd9;

export const isJpeg = (bytes: Buffer): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * The luminance quantisation table (id 0) in natural order, or undefined when the file
 * carries none before its first scan.
 */
export function readLuminanceTable(bytes: Buffer): number[] | undefined {
  if (!isJpeg(bytes)) return undefined;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    // Padding between segments, and markers that carry no payload.
    if (marker === 0xff || marker === 0x00) {
      i++;
      continue;
    }
    if (marker === SOI || marker === EOI || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Entropy-coded data starts here; no more headers worth reading.
    if (marker === SOS) return undefined;
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return undefined;
    if (marker === DQT) {
      let p = i + 4;
      const end = i + 2 + length;
      while (p < end) {
        const precision = bytes[p] >> 4;
        const id = bytes[p] & 0x0f;
        p++;
        const step = precision === 0 ? 1 : 2;
        if (p + 64 * step > end) return undefined;
        if (id === 0) {
          const table = new Array<number>(64);
          for (let k = 0; k < 64; k++) {
            table[ZIGZAG[k]] = precision === 0 ? bytes[p + k] : bytes.readUInt16BE(p + k * 2);
          }
          return table;
        }
        p += 64 * step;
      }
    }
    i += 2 + length;
  }
  return undefined;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Estimated IJG quality (1–100) from a JPEG's luminance table, or undefined for any
 * other format. The encoder built each entry as `(standard × scale + 50) / 100`, so
 * every entry is its own estimate of `scale`; the median of them shrugs off the few
 * that clipped at 1 or 255.
 *
 * This is an estimate, not a reading: two encoders at the same setting can differ by a
 * point or two, which is why it is only ever shown as a ranking hint.
 */
export function estimateJpegQuality(bytes: Buffer): number | undefined {
  const table = readLuminanceTable(bytes);
  if (!table) return undefined;
  const scales: number[] = [];
  for (let i = 0; i < 64; i++) {
    const q = table[i];
    // 255 and 65535 are saturated: the real value was higher, so they understate the
    // compression and must not drag the estimate down.
    if (!Number.isFinite(q) || q <= 0 || q >= 255) continue;
    scales.push((q * 100 - 50) / STANDARD_LUMINANCE[i]);
  }
  if (scales.length === 0) return undefined;
  const scale = median(scales);
  const quality = scale <= 0 ? 100 : scale > 100 ? 5000 / scale : (200 - scale) / 2;
  return Math.max(1, Math.min(100, Math.round(quality)));
}
