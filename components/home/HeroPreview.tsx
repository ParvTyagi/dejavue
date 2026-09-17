'use client';

import { Check, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { EASE_OUT, ScrambleText } from '@/components/ui/motion';
import { ENGINE_LABEL } from '@/lib/client/labels';

const STEPS = [
  { label: ENGINE_LABEL.google_lens, found: '3 copies' },
  { label: 'Trusted archive', found: 'dated 12 yrs ago' },
  { label: 'Decisive', found: 'stopped early' },
];

const MATCHES = [8, 17, 22, 70];

/** A looping, illustrative audit: scan → search → verdict stamp. */
export function HeroPreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 5), 1400);
    return () => clearInterval(id);
  }, []);

  const stamped = step >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: EASE_OUT }}
      style={{ perspective: 1200 }}
      className="relative mx-auto w-full max-w-md lg:max-w-none"
    >
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(212_247_92/0.12),transparent)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-[#0d0d10]/90 shadow-2xl shadow-black/60 backdrop-blur">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
          </div>
          <span className="font-mono text-[10px] text-faint">example audit</span>
        </div>

        <div className="grid grid-cols-[104px_1fr] gap-4 p-4 sm:grid-cols-[150px_1fr] sm:p-5">
          <div className="relative aspect-[4/5] self-start overflow-hidden rounded-xl border border-line bg-[linear-gradient(160deg,#1f2a36,#0f1419_55%,#2a2215)]">
            <svg viewBox="0 0 100 125" className="absolute inset-0 size-full opacity-70" aria-hidden>
              <path d="M0 80 Q20 70 35 78 T70 74 T100 80 V125 H0Z" fill="#35506a" opacity="0.6" />
              <path d="M0 92 Q25 84 50 92 T100 90 V125 H0Z" fill="#6b8aa6" opacity="0.35" />
              <rect x="18" y="48" width="14" height="26" fill="#11161c" />
              <rect x="38" y="40" width="18" height="34" fill="#141a21" />
              <rect x="62" y="52" width="12" height="22" fill="#11161c" />
            </svg>
            <div className="absolute inset-x-0 h-12 animate-scan bg-gradient-to-b from-transparent via-accent/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1.5 font-mono text-[10px] text-accent backdrop-blur">
              <ScrambleText text="166e7c2677c88b14" duration={1400} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <p className="text-[11px] tracking-wide text-faint uppercase">Claim</p>
            <p className="mt-1 font-serif text-xl leading-tight text-ink">“Flash flood hits the valley today”</p>

            <ul className="mt-4 space-y-2">
              {STEPS.map((s, i) => {
                const done = step > i;
                const active = step === i;
                return (
                  <li key={s.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex size-5 items-center justify-center rounded-full border transition-colors duration-500 ${
                        done ? 'border-accent bg-accent text-accent-ink' : active ? 'border-accent text-accent' : 'border-line text-faint'
                      }`}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : <Search className="size-2.5" />}
                    </span>
                    <span className={done || active ? 'text-ink' : 'text-faint'}>{s.label}</span>
                    <AnimatePresence>
                      {done && (
                        <motion.span
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="ml-auto font-mono text-[11px] text-muted"
                        >
                          {s.found}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>

            <div className="relative mt-5 h-10">
              <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {MATCHES.map((left, i) => (
                <motion.span
                  key={left}
                  className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ${i === 0 ? 'bg-warn' : 'bg-good'}`}
                  style={{ left: `${left}%` }}
                  animate={{ scale: step > 1 ? 1 : 0, opacity: step > 1 ? 1 : 0 }}
                  transition={{ delay: i * 0.08, type: 'spring', stiffness: 400, damping: 18 }}
                />
              ))}
              <span className="absolute top-0 bottom-0 left-[92%] w-px border-l border-dashed border-bad" />
              <span className="absolute -top-3 left-[92%] -translate-x-1/2 font-mono text-[9px] text-bad">claimed</span>
            </div>
          </div>
        </div>

        <div className="relative flex h-20 items-center justify-center border-t border-line">
          <AnimatePresence mode="wait">
            {stamped ? (
              <motion.div
                key="stamp"
                initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
                animate={{ opacity: 1, scale: 1, rotate: -6 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                className="rounded-lg border-2 border-bad px-4 py-1.5 font-mono text-sm font-bold tracking-[0.2em] text-bad uppercase shadow-[0_0_40px_-6px_rgb(255_107_79/0.6)]"
              >
                Old media · new claim
              </motion.div>
            ) : (
              <motion.span key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-faint">
                Searching the visual web…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
