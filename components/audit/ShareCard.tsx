'use client';

import { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogoMark } from '@/components/site/Logo';
import { displayDate, TONE_VAR, VERDICT_LABEL } from '@/lib/client/labels';
import type { Dossier } from '@/lib/shared/types';

/**
 * A 1200×630 summary card rendered off-screen and exported as a PNG, sized for
 * replying to a forward or posting to social media.
 */
export const ShareCard = forwardRef<HTMLDivElement, { dossier: Dossier }>(function ShareCard({ dossier }, ref) {
  // Rendered into <body> so no animated ancestor can pull the off-screen card into the layout.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const label = VERDICT_LABEL[dossier.verdict];
  const color = TONE_VAR[label.tone];
  const s = dossier.signals;
  const facts = [
    { label: 'First seen', value: s.firstSeen ? displayDate(s.firstSeen.at) : '—' },
    { label: 'Claimed', value: displayDate(s.claim.claimedAt) },
    s.deltaSKm !== undefined
      ? { label: 'Scene vs. claim', value: `${s.deltaSKm.toLocaleString()} km` }
      : { label: 'Gap', value: s.deltaTDays !== undefined ? `${s.deltaTDays.toLocaleString()} days` : '—' },
    { label: 'Confidence', value: `${dossier.confidence.value} · ${dossier.confidence.band}` },
  ];

  if (!mounted) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
      <div
        ref={ref}
        className="relative flex h-[630px] w-[1200px] flex-col overflow-hidden p-16 font-sans text-ink"
        style={{ background: 'radial-gradient(900px 500px at 0% 0%, color-mix(in oklab, ' + color + ' 22%, #08080a), #08080a 70%)' }}
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
            {label.stamp}
          </span>
          <p className="mt-6 font-serif text-7xl leading-none">{label.title}</p>
          <p className="mt-5 line-clamp-2 max-w-[1000px] font-serif text-3xl leading-snug text-muted">“{s.claim.rawText}”</p>
        </div>

        <div className="relative mt-auto grid grid-cols-4 gap-6 border-t border-line pt-6">
          {facts.map((f) => (
            <div key={f.label}>
              <p className="text-base text-faint">{f.label}</p>
              <p className="mt-1 font-serif text-4xl">{f.value}</p>
            </div>
          ))}
        </div>
        <p className="relative mt-6 text-sm text-faint">
          Based on {dossier.evidence.length} search results · signed dossier · does not detect deepfakes; no earlier copy never proves
          authenticity.
        </p>
      </div>
    </div>,
    document.body,
  );
});
