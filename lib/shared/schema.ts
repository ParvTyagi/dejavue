import { z } from 'zod';

// One schema validates both the browser form payload and the API body.

const hex64 = z.string().regex(/^[0-9a-f]{16}$/, 'pHash must be 16 lowercase hex chars');

export const frameSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith('https://'), 'Frame URLs must use https'),
  pHash: hex64.optional(),
  sharpness: z.number().nonnegative().default(0),
  tMs: z.number().int().nonnegative().optional(),
});

export const auditInputSchema = z.object({
  media: z.object({
    kind: z.enum(['image', 'video']),
    frames: z.array(frameSchema).min(1).max(3),
    exif: z
      .object({
        takenAt: z.string().optional(),
        gps: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]).optional(),
      })
      .nullable()
      .optional(),
  }),
  claim: z.object({
    text: z.string().trim().min(5).max(500),
    place: z.string().trim().max(200).optional(),
    date: z.string().datetime({ offset: true }).optional(),
  }),
  options: z
    .object({
      maxCredits: z.number().int().min(1).max(6).default(6),
      useExifLocation: z.boolean().default(false),
    })
    .default({}),
});

export type AuditInputBody = z.infer<typeof auditInputSchema>;

export const MEDIA_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  frameBytes: 2 * 1024 * 1024,
  maxEdgePx: 1024,
} as const;
