// Prints pHashes for local test images and for re-encoded variants of them
// (crop + recompress, small thumbnail), used to author golden-case fixtures.
// Usage: npm run fixtures:hash [dir]   (default: test-images)
import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { hamming, pHash, toGray } from '../lib/media/phash.ts';

async function hashOf(img: sharp.Sharp) {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return pHash(toGray(info.width, info.height, data, 3));
}

const dir = process.argv[2] ?? 'test-images';
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const out: Record<string, Record<string, string | number>> = {};
for (const file of files) {
  const buf = await sharp(path.join(dir, file)).rotate().toBuffer();
  const meta = await sharp(buf).metadata();
  const w = meta.width!, h = meta.height!;
  const original = await hashOf(sharp(buf).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }));
  const cropped = await sharp(buf)
    .extract({ left: Math.round(w * 0.04), top: Math.round(h * 0.04), width: Math.round(w * 0.92), height: Math.round(h * 0.92) })
    .jpeg({ quality: 40 })
    .toBuffer();
  const croppedHash = await hashOf(sharp(cropped));
  const thumb = await sharp(buf).resize({ width: 240 }).jpeg({ quality: 60 }).toBuffer();
  const thumbHash = await hashOf(sharp(thumb));
  out[file] = { original, cropped: croppedHash, dCropped: hamming(original, croppedHash), thumb: thumbHash, dThumb: hamming(original, thumbHash) };
}
console.log(JSON.stringify(out, null, 2));
