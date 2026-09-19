import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Backdrop } from '@/components/site/Backdrop';
import { NumberTicker, ShimmerButton } from '@/components/ui/motion';
import { EngineMarquee } from './EngineMarquee';
import { HeroPreview } from './HeroPreview';

const STATS = [
  { value: 1, unit: 'search', label: 'settles most recycled photos' },
  { value: 6, unit: 'searches', label: 'the hard cap on any one check' },
  { value: 0, unit: 'points', label: 'of the score come from the AI' },
];

const delay = (s: number) => ({ '--rise-delay': `${s}s` }) as React.CSSProperties;

/**
 * Server-rendered so the headline, the page's largest paint, is visible in the first HTML
 * rather than after hydration. Entrances are CSS; only the ticker and button hydrate.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-10 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div>
          <a
            href="#how"
            className="rise group inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-xs text-muted hover:border-line-strong"
          >
            <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-ink uppercase">
              SerpApi
            </span>
            Six search engines, one evidence trail
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1 className="mt-6 font-serif text-[clamp(2.9rem,5.6vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            <span className="whitespace-nowrap">Has this photo been</span>
            <br />
            <span className="inline-block pr-2 italic">seen before?</span>
          </h1>

          <p style={delay(0.1)} className="rise mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Most viral misinformation isn&apos;t AI. It&apos;s a real photo with a new caption. DejaVue finds where
            media appeared first, then shows you every piece of evidence behind the verdict.
          </p>

          <div style={delay(0.2)} className="rise mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/check">
              <ShimmerButton type="button" className="flex items-center gap-2">
                Check a photo
                <ArrowRight className="size-4" />
              </ShimmerButton>
            </Link>
            <Link
              href="/check?type=offer"
              className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              Check a job offer or message
            </Link>
          </div>

          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6"
          >
            {STATS.map((s, i) => (
              <div key={s.label} style={delay(0.3 + i * 0.08)} className="rise">
                <dt className="sr-only">{`${s.value} ${s.unit} ${s.label}`}</dt>
                <dd aria-hidden className="flex items-baseline gap-1.5">
                  <span className="font-serif text-4xl">
                    <NumberTicker value={s.value} />
                  </span>
                  <span className="text-sm text-muted">{s.unit}</span>
                </dd>
                <dd aria-hidden className="mt-1 text-xs leading-snug text-faint">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroPreview />
      </div>
      <EngineMarquee />
    </section>
  );
}
