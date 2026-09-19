import { z } from 'zod';
import { frameSchema } from '@/lib/shared/schema';

// Validates the Leak trace form payload and the API body.

export const leakInputSchema = z.object({
  media: z.object({
    kind: z.enum(['image', 'video']),
    frames: z.array(frameSchema).min(1).max(3),
  }),
  claim: z.object({
    text: z.string().trim().min(5).max(500),
    /** Who the post says it leaked from. Shown with the result; never sent to a search engine. */
    source: z.string().trim().max(200).optional(),
    date: z.string().datetime({ offset: true }).optional(),
  }),
  maxCredits: z.number().int().min(1).max(6).default(6),
});

export type LeakInputBody = z.infer<typeof leakInputSchema>;
