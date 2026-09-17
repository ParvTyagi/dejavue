// Pure frame-scoring helpers for video keyframe selection. Frames are ranked
// rather than thresholded, so selection works at any resolution.

export interface FrameStats {
  tMs: number;
  histogram: Float32Array;
  sharpness: number;
  meanLuma: number;
}

const BINS = 32;
export const CUT_THRESHOLD = 0.35;

/** 32-bin-per-channel RGB histogram, normalised to sum to 1 per channel. */
export function rgbHistogram(rgba: ArrayLike<number>): Float32Array {
  const hist = new Float32Array(BINS * 3);
  const pixels = rgba.length / 4;
  for (let p = 0; p < rgba.length; p += 4) {
    hist[rgba[p] >> 3]++;
    hist[BINS + (rgba[p + 1] >> 3)]++;
    hist[2 * BINS + (rgba[p + 2] >> 3)]++;
  }
  for (let i = 0; i < hist.length; i++) hist[i] /= pixels;
  return hist;
}

export function chiSquare(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const s = a[i] + b[i];
    if (s > 0) d += ((a[i] - b[i]) ** 2) / s;
  }
  return d / 3;
}

/** Variance of the 3×3 Laplacian (0,1,0 / 1,−4,1 / 0,1,0) over grayscale pixels. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): { sharpness: number; meanLuma: number } {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let luma = 0;
  for (let i = 0; i < gray.length; i++) luma += gray[i];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = n ? sum / n : 0;
  return { sharpness: n ? sumSq / n - mean * mean : 0, meanLuma: gray.length ? luma / gray.length : 0 };
}

/**
 * Splits frames into scenes at histogram cuts, keeps the sharpest well-exposed
 * frame per scene, then the top `k` scenes by sharpness × scene length.
 */
export function pickKeyframes(frames: FrameStats[], k = 3): FrameStats[] {
  if (frames.length === 0) return [];
  const scenes: FrameStats[][] = [[frames[0]]];
  for (let i = 1; i < frames.length; i++) {
    if (chiSquare(frames[i - 1].histogram, frames[i].histogram) > CUT_THRESHOLD) scenes.push([]);
    scenes[scenes.length - 1].push(frames[i]);
  }
  const candidates = scenes
    .map((scene) => {
      const usable = scene.filter((f) => f.meanLuma >= 20 && f.meanLuma <= 235);
      const best = (usable.length ? usable : scene).reduce((a, b) => (b.sharpness > a.sharpness ? b : a));
      return { best, rank: best.sharpness * scene.length };
    })
    .sort((a, b) => b.rank - a.rank);
  return candidates.slice(0, k).map((c) => c.best);
}
