import { describe, expect, it } from 'vitest';
import { extractContacts } from '@/lib/offer/extract';
import { redactContacts } from '@/lib/offer/redact';

const redact = (text: string) => redactContacts(text, extractContacts(text));

describe('redacting a message for sharing', () => {
  it('hides links, emails and numbers however they are written', () => {
    expect(redact('Claim now at pmkisan-gov.online/claim or https://www.Amazon-Careers.in/apply?id=7')).toBe(
      'Claim now at [link] or [link]',
    );
    expect(redact('Mail HR.Team@Gmail.com, call 98765 43210 or +91-98765-43211')).toBe('Mail [email], call [number] or [number]');
    expect(redact('Join https://chat.whatsapp.com/KqT7sLm2XyZpQ9 today')).toBe('Join [link] today');
  });

  it('keeps amounts, dates and the rest of the message readable', () => {
    expect(redact('Pay ₹999 registration fee by 12/10/2026. Salary ₹40,000.')).toBe('Pay ₹999 registration fee by 12/10/2026. Salary ₹40,000.');
  });
});
