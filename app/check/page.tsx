import { Image as ImageIcon, MessageSquareText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Investigate, type DemoCase } from '@/components/home/Investigate';
import { OfferCheck, type OfferDemo } from '@/components/home/OfferCheck';
import { listCases, listOfferCases } from '@/lib/fixtures/source';
import { FIXTURES_DIR, fixtureMode, OFFER_FIXTURES_DIR } from '@/lib/server/mode';

type CheckType = 'media' | 'offer';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type?: string }> }): Promise<Metadata> {
  const { type } = await searchParams;
  return { title: type === 'offer' ? 'Check a message — DejaVue' : 'Check media — DejaVue' };
}

const MODES: { id: CheckType; href: string; label: string; hint: string; icon: typeof ImageIcon }[] = [
  { id: 'media', href: '/check', label: 'Photo or video', hint: 'Where did it come from?', icon: ImageIcon },
  { id: 'offer', href: '/check?type=offer', label: 'Message or offer', hint: 'Is this offer for real?', icon: MessageSquareText },
];

const COPY: Record<CheckType, { title: string; blurb: string }> = {
  media: {
    title: 'Where did it come from?',
    blurb: 'Upload a photo or a short video and say what it is being shared as. DejaVue looks for earlier copies and shows you every result behind the verdict.',
  },
  offer: {
    title: 'Is this offer for real?',
    blurb: 'Job offers, government scheme messages and customer-care numbers. DejaVue finds the official website, looks for scam reports and checks for warning signs like asking you to pay.',
  },
};

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const current: CheckType = (await searchParams).type === 'offer' ? 'offer' : 'media';
  const mode = fixtureMode();
  const replay = mode === 'replay';
  const copy = COPY[current];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{copy.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">{copy.blurb}</p>
      </header>

      {/* The choice comes after the promise, so it is clear what is being chosen between. */}
      <nav aria-label="What to check" className="mt-8">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">What are you checking?</p>
        <div className="mt-3 grid gap-3 sm:max-w-2xl sm:grid-cols-2">
          {MODES.map((m) => {
            const active = current === m.id;
            return (
              <Link
                key={m.id}
                href={m.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                  active ? 'border-accent bg-surface' : 'border-line hover:border-line-strong hover:bg-surface'
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${
                    active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'
                  }`}
                >
                  <m.icon className="size-4.5" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${active ? 'text-ink' : 'text-muted'}`}>{m.label}</span>
                  <span className="block text-xs text-faint">{m.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {current === 'offer' ? (
        <OfferCheck
          mode={mode}
          demos={replay ? listOfferCases(OFFER_FIXTURES_DIR).map((c): OfferDemo => ({ id: c.id, title: c.title, input: c.input })) : []}
        />
      ) : (
        <Investigate
          mode={mode}
          demos={
            replay
              ? listCases(FIXTURES_DIR).map((c): DemoCase => ({ id: c.id, title: c.title, kind: c.input.media.kind, input: c.input }))
              : []
          }
        />
      )}
    </div>
  );
}
