import { z } from 'zod';
import { OFFER_LIMITS } from '@/lib/shared/limits';

// Validates the Message / Offer form payload and the API body.

export const offerInputSchema = z
  .object({
    text: z.string().trim().min(10, 'Paste at least a sentence of the message').max(OFFER_LIMITS.textChars).optional(),
    screenshotUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), 'Screenshot URLs must use https')
      .optional(),
    claimedOrg: z.string().trim().min(2).max(OFFER_LIMITS.orgChars).optional(),
    maxCredits: z.number().int().min(1).max(6).default(6),
  })
  .refine((v) => v.text !== undefined || v.screenshotUrl !== undefined, {
    message: 'Paste the message or upload a screenshot',
    path: ['text'],
  });

export type OfferInputBody = z.infer<typeof offerInputSchema>;
