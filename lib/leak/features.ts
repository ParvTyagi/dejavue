import sharp from 'sharp';
import { estimateJpegQuality } from './jpeg';

// What one full-size copy of a leaked image looks like, measured in memory. The pixels
// are used to compute these numbers and are then dropped: nothing decoded here is ever
// written to the store, the dossier or a log.

/** Side of the coarse grayscale used to compare framing. Small on purpose: this is alignment, not matching. */
export const LUMA_GRID = 64;

export interface ImageFeatures {
  width: number;
  height: number;
  /** Estimated JPEG quality (1–100), absent for PNG, WebP and anything else. */
  jpegQuality?: number;
  /** LUMA_GRID × LUMA_GRID grayscale of the whole frame, row-major, 0–255. */
  luma: number[];
}

/**
 * Measures one image in memory. Returns undefined when the bytes are not an image we
 * can decode, which is reported as a skip rather than being treated as a missing copy.
 */
export async function measureImage(bytes: Buffer): Promise<ImageFeatures | undefined> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return undefined;
    // EXIF orientations 5–8 turn the image on its side, so the stored size is transposed.
    const rotated = (meta.orientation ?? 1) >= 5;
    const { data } = await sharp(bytes)
      .rotate()
      .removeAlpha()
      .resize(LUMA_GRID, LUMA_GRID, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: rotated ? meta.height : meta.width,
      height: rotated ? meta.width : meta.height,
      jpegQuality: estimateJpegQuality(bytes),
      luma: Array.from(data),
    };
  } catch {
    return undefined;
  }
}
