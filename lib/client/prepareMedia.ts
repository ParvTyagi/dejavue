'use client';

import { laplacianVariance, pickKeyframes, rgbHistogram, type FrameStats } from '@/lib/media/keyframes';
import { pHash, toGray } from '@/lib/media/phash';
import { MEDIA_LIMITS } from '@/lib/shared/limits';

export interface PreparedFrame {
  blob: Blob;
  pHash: string;
  sharpness: number;
  tMs?: number;
  previewUrl: string;
}

export interface PreparedUpload {
  kind: 'image' | 'video';
  frames: PreparedFrame[];
  exif?: { takenAt?: string; gps?: [number, number] };
}

export class MediaError extends Error {}

type Drawable = CanvasImageSource & { width?: number; height?: number };

function canvasFor(source: Drawable, srcW: number, srcH: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaError('Could not encode frame'))), 'image/jpeg', 0.9),
  );
}

async function frameFrom(source: Drawable, srcW: number, srcH: number, tMs?: number): Promise<PreparedFrame> {
  const { canvas, ctx, w, h } = canvasFor(source, srcW, srcH, MEDIA_LIMITS.maxEdgePx);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = toGray(w, h, rgba, 4);
  const blob = await toBlob(canvas);
  if (blob.size > MEDIA_LIMITS.frameBytes) throw new MediaError('Prepared frame is larger than 2 MB.');
  return {
    blob,
    pHash: pHash(gray),
    sharpness: Math.round(laplacianVariance(gray.data, w, h).sharpness * 10) / 10,
    tMs,
    previewUrl: URL.createObjectURL(blob),
  };
}

async function readExif(file: File): Promise<PreparedUpload['exif']> {
  try {
    const exifr = (await import('exifr')).default;
    const data = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] });
    if (!data) return undefined;
    const gps: [number, number] | undefined =
      typeof data.latitude === 'number' && typeof data.longitude === 'number' ? [data.latitude, data.longitude] : undefined;
    const takenAt = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.toISOString() : undefined;
    return gps || takenAt ? { gps, takenAt } : undefined;
  } catch {
    return undefined;
  }
}

export async function prepareImage(file: File): Promise<PreparedUpload> {
  if (file.size > MEDIA_LIMITS.imageBytes) throw new MediaError('Images must be 10 MB or smaller.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new MediaError("Couldn't read this image. Try a JPEG, PNG or WebP file.");
  }
  const frame = await frameFrom(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return { kind: 'image', frames: [frame], exif: await readExif(file) };
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => reject(new MediaError('Video seek failed'));
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = t;
  });
}

const VIDEO_ERROR = "Couldn't read this video. Try MP4 (H.264) or a screenshot.";

/** Samples 1 fps (max 120) at 320 px, picks up to 3 keyframes, re-extracts them at ≤1024 px. */
export async function prepareVideo(file: File, onProgress?: (fraction: number) => void): Promise<PreparedUpload> {
  if (file.size > MEDIA_LIMITS.videoBytes) throw new MediaError('Videos must be 50 MB or smaller.');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new MediaError(VIDEO_ERROR));
    });
    if (!video.videoWidth || !Number.isFinite(video.duration)) throw new MediaError(VIDEO_ERROR);

    const samples = Math.min(120, Math.max(1, Math.floor(video.duration)));
    const stats: FrameStats[] = [];
    for (let i = 0; i < samples; i++) {
      const t = Math.min(video.duration - 0.05, i + 0.5);
      await seek(video, t);
      const { ctx, w, h } = canvasFor(video, video.videoWidth, video.videoHeight, 320);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const { sharpness, meanLuma } = laplacianVariance(toGray(w, h, rgba, 4).data, w, h);
      stats.push({ tMs: Math.round(t * 1000), histogram: rgbHistogram(rgba), sharpness, meanLuma });
      onProgress?.((i + 1) / (samples + 3));
    }

    const frames: PreparedFrame[] = [];
    for (const pick of pickKeyframes(stats, 3)) {
      await seek(video, pick.tMs / 1000);
      frames.push(await frameFrom(video, video.videoWidth, video.videoHeight, pick.tMs));
      onProgress?.((samples + frames.length) / (samples + 3));
    }
    return { kind: 'video', frames };
  } catch (err) {
    throw err instanceof MediaError ? err : new MediaError(VIDEO_ERROR);
  } finally {
    URL.revokeObjectURL(url);
  }
}
