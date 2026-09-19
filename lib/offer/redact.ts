import { redactPersonalData } from '@/lib/shared/redact';
import type { Contact } from './types';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Hides a message's links, emails and phone numbers, so a shared result never spreads the contact
 * details it warns about. Long runs of digits are hidden too, since numbers are written many ways.
 */
export function redactContacts(text: string, contacts: Contact[]): string {
  let out = text;
  // Longest first, so a full URL is replaced before a shorter host inside it.
  const written = contacts
    .filter((c) => c.type === 'url' || c.type === 'email' || (c.type === 'chat' && !c.value.includes(':')))
    .map((c) => ({ value: c.value, label: c.type === 'email' ? '[email]' : '[link]' }))
    .sort((a, b) => b.value.length - a.value.length);
  for (const { value, label } of written) {
    // Any rest of the link is hidden too, but punctuation ending the sentence stays.
    const rest = label === '[link]' ? String.raw`(?:[/?#]\S*?)?(?=[.,;:!?)"']*(?:\s|$))` : '';
    out = out.replace(new RegExp(`(https?://)?(www\\.)?${escape(value.replace(/^https?:\/\/(www\.)?/i, ''))}${rest}`, 'gi'), label);
  }
  // Whatever the contact list missed still goes: numbers, emails and id-like numbers.
  return redactPersonalData(out);
}
