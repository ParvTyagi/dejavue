'use client';

import { ArrowDown, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Backdrop } from '@/components/site/Backdrop';
import { EASE_OUT, NumberTicker, ShimmerButton, WordReveal } from '@/components/ui/motion';
import { EngineMarquee } from './EngineMarquee';
import { HeroPreview } from './HeroPreview';

const STATS = [
  { value: 1, label: 'search for most recycled media', suffix: '' },
  { value: 6, label: 'searches at most, ever', suffix: '' },
  { value: 0, label: 'verdicts decided by AI', suffix: '' },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-10 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div>
          <motion.a
            href="#how"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-xs text-muted backdrop-blur hover:border-line-strong"
          >
            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-accent uppercase">
              SerpApi
            </span>
            Six search engines, one evidence trail
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </motion.a>

          <h1 className="mt-6 font-serif text-[clamp(2.9rem,5.6vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            <WordReveal text="Has this photo been" className="text-gradient whitespace-nowrap" />
            <br />
            <WordReveal text="seen before?" delay={0.3} className="text-accent italic" />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55, ease: EASE_OUT }}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Most viral misinformation isn&apos;t AI. It&apos;s a real photo with a new caption. DejaVue finds where
            media appeared first, then shows you every piece of evidence behind the verdict.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: EASE_OUT }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a href="#check">
              <ShimmerButton type="button" className="flex items-center gap-2">
                Check a photo
                <ArrowDown className="size-4" />
              </ShimmerButton>
            </a>
            <a
              href="#how"
              className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              How it works
            </a>
          </motion.div>

          <motion.dl
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.9 } } }}
            className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6"
          >
            {STATS.map((s) => (
              <motion.div key={s.label} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-serif text-4xl text-ink">
                  <NumberTicker value={s.value} />
                </dd>
                <dd className="mt-1 text-xs leading-snug text-faint">{s.label}</dd>
              </motion.div>
            ))}
          </motion.dl>
        </div>

        <HeroPreview />
      </div>
      <EngineMarquee />
    </section>
  );
}
