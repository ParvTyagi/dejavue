'use client';

import { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogoMark } from '@/components/site/Logo';
import { displayDate, LEAK_VERDICT_LABEL, OFFER_VERDICT_LABEL, TONE_VAR, VERDICT_LABEL } from '@/lib/client/labels';
import { LEAK_LIMITATIONS } from '@/lib/leak/types';
import { redactContacts } from '@/lib/offer/redact';
import { redactPersonalData } from '@/lib/shared/redact';
import { isLeakDossier, isOfferDossier, type AnyDossier } from '@/lib/shared/types';

export interface CardContent {
  stamp: string;
  title: string;
  color: string;
  quote: string;
  facts: { label: string; value: string }[];
  footer: string;
}

const results = (n: number) => `${n} search result${n === 1 ? '' : 's'}`;

/** Exported for tests: the card is the most-shared surface, so its redaction is checked directly. */
export function cardContent(dossier: AnyDossier): CardContent {
  const confidence = { label: 'Confidence', value: `${dossier.confidence.value} · ${dossier.confidence.band}` };
  if (isOfferDossier(dossier)) {
    const label = OFFER_VERDICT_LABEL[dossier.verdict];
    const signs = dossier.flags.filter((f) => f.strength !== 'weak').length;
    return {
      ...label,
      color: TONE_VAR[label.tone],
      // The card is made to be forwarded, so it must not spread the links and numbers it warns about.
      quote: redactContacts(dossier.reading.excerpt, dossier.signals.contacts),
      facts: [
        { label: 'Official site', value: dossier.signals.officialDomain ?? 'Not found' },
        { label: 'Warning signs', value: String(signs) },
        { label: 'Searches', value: String(dossier.metrics.credits) },
        confidence,
      ],
      footer: `Based on ${results(dossier.evidence.length)} · signed dossier · ${dossier.advice} Finding no warning signs never proves an offer is genuine.`,
    };
  }
  if (isLeakDossier(dossier)) {
    const label = LEAK_VERDICT_LABEL[dossier.verdict];
    const s = dossier.signals;
    const copies = s.confirmedMatches.length;
    return {
      ...label,
      color: TONE_VAR[label.tone],
      // A leaked document is full of personal data, and this card exists to be forwarded.
      quote: redactPersonalData(s.claim.rawText),
      facts: [
        { label: 'Earliest public copy', value: s.firstSeen ? displayDate(s.firstSeen.at) : 'None found' },
        { label: 'Claimed', value: displayDate(s.claim.claimedAt) },
        { label: 'Public copies', value: String(copies) },
        confidence,
      ],
      footer: `Based on ${results(dossier.evidence.length)} · signed dossier · ${LEAK_LIMITATIONS.join(' ')}`,
    };
  }
  const label = VERDICT_LABEL[dossier.verdict];
  const s = dossier.signals;
  return {
    ...label,
    color: TONE_VAR[label.tone],
    quote: s.claim.rawText,
    facts: [
      { label: 'First seen', value: s.firstSeen ? displayDate(s.firstSeen.at) : '—' },
      { label: 'Claimed', value: displayDate(s.claim.claimedAt) },
      s.deltaSKm !== undefined
        ? { label: 'Scene vs. claim', value: `${s.deltaSKm.toLocaleString()} km` }
        : { label: 'Gap', value: s.deltaTDays !== undefined ? `${s.deltaTDays.toLocaleString()} days` : '—' },
      confidence,
    ],
    footer: `Based on ${results(dossier.evidence.length)} · signed dossier · does not detect deepfakes; no earlier copy never proves authenticity.`,
  };
}

/**
 * A 1200×630 summary card rendered off-screen and exported as a PNG, sized for
 * replying to a forward or posting to social media.
 */
export const ShareCard = forwardRef<HTMLDivElement, { dossier: AnyDossier }>(function ShareCard({ dossier }, ref) {
  // Rendered into <body> so no animated ancestor can pull the off-screen card into the layout.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { stamp, title, color, quote, facts, footer } = cardContent(dossier);

  if (!mounted) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
      <div
        ref={ref}
        className="relative flex h-[630px] w-[1200px] flex-col overflow-hidden p-16 font-sans text-ink"
        style={{ background: '#ffffff' }}
      >
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" />
            <span className="text-2xl font-semibold tracking-tight">DejaVue</span>
          </div>
          <span className="font-mono text-lg text-faint">{dossier.id}</span>
        </div>

        <div className="relative mt-12">
          <span
            className="inline-block -rotate-3 rounded-xl border-4 px-5 py-2 font-mono text-2xl font-bold tracking-[0.25em] uppercase"
            style={{ borderColor: color, color }}
          >
            {stamp}
          </span>
          <p className="mt-6 font-serif text-7xl leading-none">{title}</p>
          <p className="mt-5 line-clamp-2 max-w-[1000px] font-serif text-3xl leading-snug text-muted">“{quote}”</p>
        </div>

        <div className="relative mt-auto grid grid-cols-4 gap-6 border-t border-line pt-6">
          {facts.map((f) => (
            <div key={f.label}>
              <p className="text-base text-faint">{f.label}</p>
              <p className="mt-1 truncate font-serif text-4xl">{f.value}</p>
            </div>
          ))}
        </div>
        <p className="relative mt-6 text-sm text-faint">{footer}</p>
      </div>
    </div>,
    document.body,
  );
});
