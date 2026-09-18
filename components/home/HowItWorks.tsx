'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Reveal, SpotlightCard, useVisibleInterval } from '@/components/ui/motion';
import { ENGINE_LABEL } from '@/lib/client/labels';

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">How it works</p>
        <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
          Search is the evidence. <span className="text-muted italic">Code is the judge.</span>
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Reveal delay={0}>
          <Step n="01" color="#171717" title="Fingerprint" body="Your browser shrinks the media and computes a 64-bit perceptual hash. Only resized frames ever leave your device.">
            <BitGrid />
          </Step>
        </Reveal>
        <Reveal delay={0.1}>
          <Step n="02" color="#171717" title="Escalate, don't broadcast" body="Google Lens first. Bing and Yandex only if needed, then News, Maps and YouTube. It stops the moment the evidence is decisive.">
            <TierLadder />
          </Step>
        </Reveal>
        <Reveal delay={0.2}>
          <Step n="03" color="#171717" title="Judge by rules" body="Every match is re-verified by its thumbnail, and every point of the score is a rule you can read. The AI reads the claim and the scene; it never scores and never picks the verdict.">
            <VerdictCycle />
          </Step>
        </Reveal>
      </div>
    </section>
  );
}

function Step({ n, color, title, body, children }: { n: string; color: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <SpotlightCard className="flex h-full flex-col">
      <div
        className="relative flex h-44 items-center justify-center overflow-hidden border-b border-line"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}0a, transparent 70%)` }}
      >
        <div aria-hidden className="absolute inset-x-10 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        {children}
      </div>
      <div className="p-5">
        <p className="font-mono text-xs" style={{ color }}>
          {n}
        </p>
        <h3 className="mt-1 text-lg font-medium">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </SpotlightCard>
  );
}

/** 8×8 bits flickering, then settling into a hash. */
function BitGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const [bits, setBits] = useState<boolean[]>(() => Array.from({ length: 64 }, (_, i) => (i * 37) % 5 < 2));
  useVisibleInterval(ref, () => setBits((prev) => prev.map((b) => (Math.random() < 0.12 ? !b : b))), 360);

  return (
    <div ref={ref} className="grid grid-cols-8 gap-1" aria-hidden>
      {bits.map((on, i) => (
        <span
          key={i}
          className={`size-3.5 rounded-[3px] transition-[background-color,transform] duration-300 ${
            on ? (i % 9 === 0 ? 'scale-100 bg-muted' : 'scale-100 bg-ink') : 'scale-80 bg-black/[0.06]'
          }`}
        />
      ))}
    </div>
  );
}

const TIERS = [
  { label: ENGINE_LABEL.google_lens, tier: 1 },
  { label: 'Bing · Yandex', tier: 2 },
  { label: 'News · Maps · YouTube', tier: 3 },
];

/** A search pulse climbing the tiers and stopping early. */
function TierLadder() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useVisibleInterval(ref, () => setActive((a) => (a + 1) % 4), 1100);

  return (
    <div ref={ref} className="w-56 space-y-2" aria-hidden>
      {TIERS.map((t, i) => {
        const lit = i < active;
        return (
          <div key={t.label} className="relative overflow-hidden rounded-lg border border-line px-3 py-2 text-xs">
            <motion.div
              className="absolute inset-0 origin-left bg-black/[0.06]"
              animate={{ scaleX: lit ? 1 : 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            <div className="relative flex justify-between">
              <span className={lit ? 'text-ink' : 'text-faint'}>{t.label}</span>
              <span className="font-mono text-faint">T{t.tier}</span>
            </div>
          </div>
        );
      })}
      <AnimatePresence>
        {active === 3 && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center font-mono text-[11px] text-accent"
          >
            decisive · stopped early
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

const VERDICTS = [
  { label: 'Recycled', cls: 'border-bad text-bad' },
  { label: 'Misplaced', cls: 'border-warn text-warn' },
  { label: 'Consistent', cls: 'border-good text-good' },
  { label: 'Context plausible', cls: 'border-info text-info' },
  { label: 'Unverified', cls: 'border-faint text-muted' },
];

/** Verdict stamps landing one after another. */
function VerdictCycle() {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useVisibleInterval(ref, () => setI((n) => (n + 1) % VERDICTS.length), 1600);
  const v = VERDICTS[i];
  return (
    <div ref={ref} className="flex items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={v.label}
          initial={{ opacity: 0, scale: 1.7, rotate: -16 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 8, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 360, damping: 15 }}
          className={`rounded-lg border-2 px-4 py-1.5 font-mono text-sm font-bold tracking-[0.18em] uppercase ${v.cls}`}
        >
          {v.label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
