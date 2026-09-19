import type { ImageFeatures } from './features';
import { LUMA_GRID } from './features';
import type { RankedCopy } from './types';

// Which public copy is least degraded: largest, least compressed, least cropped.
//
// This is a display hint and nothing else. It never reaches decideLeak() or scoreLeak(),
// because a big clean copy can be posted years after a small cropped one: pixels say how
// much a copy has been through, not when it appeared.

export interface MeasuredCopy extends ImageFeatures {
  evidenceId: string;
  domain: string;
}

/**
 * Below this correlation the two copies are not the same framing at all, so cropping is
 * left uncompared. Every copy that gets this far was already confirmed as the same image
 * by its thumbnail hash, so this is a guard against a wrong original URL, not a matcher.
 */
const MIN_ALIGN = 0.7;
/** The framings tried first: every square window from 40 % to 100 % of a side, on a 5 % grid. */
const MIN_SCALE = 0.4;
const COARSE_STEP = 0.05;
/** Local sweeps after the coarse scan: half a coarse step at half its resolution, then a last fine pass. */
const REFINE_SWEEPS = [
  [-0.05, -0.025, 0, 0.025, 0.05],
  [-0.0125, 0, 0.0125],
];
/** How many of the best coarse windows are then refined. */
const REFINE_FROM = 4;
/** Both sides are compared between these sizes: coarse enough to ignore encoder noise, fine enough to tell framings apart. */
const MIN_COMPARE = 8;
const MAX_COMPARE = 32;
/**
 * The coarse scan compares at this size whatever the window. Blurring both sides to the
 * same handful of cells widens the peak around the right framing, so it survives being a
 * grid step off; the refinement afterwards compares at full detail.
 */
const COARSE_COMPARE = 12;

/** Zero mean, unit variance, so brightness and contrast shifts from re-encoding do not matter. */
function normalise(luma: ArrayLike<number>): Float64Array {
  const n = luma.length;
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += luma[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    out[i] = luma[i] - mean;
    variance += out[i] * out[i];
  }
  const sd = Math.sqrt(variance / n);
  if (sd > 1e-9) for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

/**
 * Summed-area table of the grid, with a zero row and column, so the average over any
 * rectangle - including one with fractional edges - costs four lookups instead of a loop
 * over its pixels. That is what makes a dense search over framings affordable.
 */
function summedArea(luma: ArrayLike<number>): Float64Array {
  const g = LUMA_GRID;
  const sat = new Float64Array((g + 1) * (g + 1));
  for (let y = 0; y < g; y++) {
    let row = 0;
    for (let x = 0; x < g; x++) {
      row += luma[y * g + x];
      sat[(y + 1) * (g + 1) + x + 1] = sat[y * (g + 1) + x + 1] + row;
    }
  }
  return sat;
}

/**
 * The integral over [0, x] x [0, y] in grid units. Bilinear interpolation of the table is
 * exact here, not an approximation: pixels are constant over their own square, so a part
 * of one contributes in proportion to the area covered.
 */
function integral(sat: Float64Array, x: number, y: number): number {
  const g = LUMA_GRID;
  const cx = Math.max(0, Math.min(g, x));
  const cy = Math.max(0, Math.min(g, y));
  const x0 = Math.min(g - 1, Math.floor(cx));
  const y0 = Math.min(g - 1, Math.floor(cy));
  const fx = cx - x0;
  const fy = cy - y0;
  const at = (px: number, py: number) => sat[py * (g + 1) + px];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
}

/** Resamples the square window at (x0, y0) of side `s` (all in 0-1) to `out` x `out` cell averages. */
function sampleWindow(sat: Float64Array, x0: number, y0: number, s: number, out: number): Float64Array {
  const g = LUMA_GRID;
  const result = new Float64Array(out * out);
  const edges = (start: number) => {
    const list = new Array<number>(out + 1);
    for (let k = 0; k <= out; k++) list[k] = Math.max(0, Math.min(g, (start + (k / out) * s) * g));
    return list;
  };
  const xs = edges(x0);
  const ys = edges(y0);
  for (let j = 0; j < out; j++) {
    const [top, bottom] = [ys[j], ys[j + 1]];
    for (let i = 0; i < out; i++) {
      const [left, right] = [xs[i], xs[i + 1]];
      const area = (right - left) * (bottom - top);
      result[j * out + i] =
        area <= 0
          ? 0
          : (integral(sat, right, bottom) - integral(sat, left, bottom) - integral(sat, right, top) + integral(sat, left, top)) /
            area;
    }
  }
  return result;
}

/** Normalised cross-correlation of two already-normalised grids: 1 is identical. */
function correlation(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum / a.length;
}

interface Alignment {
  score: number;
  scale: number;
}

/** One candidate framing: a square window of the scene, and how well it matched. */
interface Window extends Alignment {
  x: number;
  y: number;
}

/**
 * The window of `scene` that looks most like `part`: how much of the wider picture the
 * narrower one shows. Scanned over a grid of framings, then refined around the most
 * promising of them.
 *
 * Both sides are always compared at the same resolution. Without that, a window of the
 * scene would be an upsampled blur held against a full-detail copy, and the correlation
 * would collapse on exactly the crops this is meant to catch.
 */
export function bestAlignment(scene: ArrayLike<number>, part: ArrayLike<number>): Alignment {
  const sceneSat = summedArea(scene);
  const partSat = summedArea(part);
  const partAt = new Map<number, Float64Array>();
  const target = (size: number) => {
    let cached = partAt.get(size);
    if (!cached) {
      cached = normalise(sampleWindow(partSat, 0, 0, 1, size));
      partAt.set(size, cached);
    }
    return cached;
  };
  const scoreAt = (x: number, y: number, s: number, at?: number): number => {
    if (s <= 0 || s > 1 || x < -1e-9 || y < -1e-9 || x + s > 1 + 1e-9 || y + s > 1 + 1e-9) return -Infinity;
    const size = at ?? Math.max(MIN_COMPARE, Math.min(MAX_COMPARE, Math.round(LUMA_GRID * s)));
    return correlation(normalise(sampleWindow(sceneSat, x, y, s, size)), target(size));
  };

  const coarse: Window[] = [];
  for (let scale = 1; scale >= MIN_SCALE - 1e-9; scale -= COARSE_STEP) {
    const steps = Math.round((1 - scale) / COARSE_STEP);
    for (let iy = 0; iy <= steps; iy++) {
      for (let ix = 0; ix <= steps; ix++) {
        const x = ix * COARSE_STEP;
        const y = iy * COARSE_STEP;
        coarse.push({ score: scoreAt(x, y, scale, COARSE_COMPARE), x, y, scale });
      }
    }
  }
  // Refining only the single best coarse window loses a framing that sits between two of
  // them, so the best few are each refined and the winner taken.
  coarse.sort((a, b) => b.score - a.score || b.scale - a.scale || a.x - b.x || a.y - b.y);
  let best: Window = { ...coarse[0], score: scoreAt(coarse[0].x, coarse[0].y, coarse[0].scale) };
  for (const candidate of coarse.slice(0, REFINE_FROM)) {
    // Re-scored at full detail, since the coarse ranking was made on blurred cells.
    let local: Window = { ...candidate, score: scoreAt(candidate.x, candidate.y, candidate.scale) };
    // Two exhaustive local sweeps rather than a downhill walk: the score surface of a
    // page of text is sharp, and stepping one axis at a time stops just short of the
    // right window on any framing that does not sit on the coarse grid.
    for (const offsets of REFINE_SWEEPS) {
      const { x, y, scale } = local;
      for (const ds of offsets) {
        for (const dy of offsets) {
          for (const dx of offsets) {
            const score = scoreAt(x + dx, y + dy, scale + ds);
            // A strict improvement only, so equal scores keep the larger, earlier window.
            if (score > local.score + 1e-12) local = { score, x: x + dx, y: y + dy, scale: scale + ds };
          }
        }
      }
    }
    if (local.score > best.score + 1e-12) best = local;
  }
  return { score: best.score, scale: best.scale };
}

/**
 * How much of the scene each copy shows, against the copy that shows the most: 1 is the
 * fullest framing found, 0.6 is a copy showing about 60 % of it.
 *
 * Each copy is compared with the largest one both ways round, so a copy that shows *more*
 * than the largest is measured too. Copies that align with nothing are given 1, which is
 * neutral: they neither win nor lose on framing, and resolution decides them instead.
 */
export function cropCoverage(copies: MeasuredCopy[]): number[] {
  if (copies.length === 0) return [];
  const area = (c: MeasuredCopy) => c.width * c.height;
  const reference = copies.reduce((a, b) => (area(b) > area(a) || (area(b) === area(a) && b.evidenceId < a.evidenceId) ? b : a));
  const raw = copies.map((c) => {
    if (c.evidenceId === reference.evidenceId) return 1;
    const forward = bestAlignment(reference.luma, c.luma);
    const reverse = bestAlignment(c.luma, reference.luma);
    if (Math.max(forward.score, reverse.score) < MIN_ALIGN) return 1;
    return forward.score >= reverse.score ? forward.scale ** 2 : 1 / reverse.scale ** 2;
  });
  const most = Math.max(...raw);
  return raw.map((v) => Math.round((v / most) * 100) / 100);
}

/** Weights for the composite rank. Framing counts most: a crop has lost pixels no resave can restore. */
const WEIGHT = { coverage: 0.5, resolution: 0.3, quality: 0.2 };

/**
 * Copies ordered by how close each looks to an undegraded original, with the reasons the
 * leader leads on. Deterministic: equal scores fall back to resolution, then quality,
 * then evidence id.
 */
export function rankCopies(copies: MeasuredCopy[]): RankedCopy[] {
  if (copies.length === 0) return [];
  const coverage = cropCoverage(copies);
  const pixels = copies.map((c) => c.width * c.height);
  const maxPixels = Math.max(...pixels);
  const maxCoverage = Math.max(...coverage);
  const qualities = copies.map((c) => c.jpegQuality).filter((q): q is number => q !== undefined);
  const maxQuality = qualities.length ? Math.max(...qualities) : undefined;
  // Only worth naming a leader when the copies actually differ on that measure.
  const differs = (values: (number | undefined)[]) => new Set(values.filter((v) => v !== undefined)).size > 1;
  const cropsDiffer = differs(coverage);
  const qualitiesDiffer = differs(copies.map((c) => c.jpegQuality));
  const sizesDiffer = differs(pixels);

  const scored = copies.map((c, i) => {
    // A copy in a lossless format has no quality reading, so its score is shared out over
    // the measures it does have rather than guessing a number for it.
    const weights = c.jpegQuality === undefined ? { ...WEIGHT, quality: 0 } : WEIGHT;
    const total = weights.coverage + weights.resolution + weights.quality;
    const score =
      (weights.coverage * coverage[i] +
        weights.resolution * Math.sqrt(pixels[i] / maxPixels) +
        weights.quality * ((c.jpegQuality ?? 0) / 100)) /
      total;
    const reasons: string[] = [];
    if (sizesDiffer && pixels[i] === maxPixels) reasons.push('largest resolution');
    if (qualitiesDiffer && c.jpegQuality !== undefined && c.jpegQuality === maxQuality) reasons.push('least compressed');
    if (cropsDiffer && coverage[i] === maxCoverage) reasons.push('least cropped');
    return {
      evidenceId: c.evidenceId,
      domain: c.domain,
      width: c.width,
      height: c.height,
      jpegQuality: c.jpegQuality,
      coverage: coverage[i],
      reasons,
      score,
      pixels: pixels[i],
    };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.pixels - a.pixels ||
      (b.jpegQuality ?? 0) - (a.jpegQuality ?? 0) ||
      a.evidenceId.localeCompare(b.evidenceId),
  );
  return scored.map(({ score: _score, pixels: _pixels, ...copy }) => copy);
}
