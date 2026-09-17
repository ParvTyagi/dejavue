// Kept free of imports so the browser can read the limits without bundling zod.
export const MEDIA_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  frameBytes: 2 * 1024 * 1024,
  maxEdgePx: 1024,
} as const;
