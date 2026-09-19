import { FileWarning, Image as ImageIcon, MessageSquareText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Investigate, type DemoCase } from '@/components/home/Investigate';
import { LeakTrace, type LeakDemo } from '@/components/home/LeakTrace';
import { OfferCheck, type OfferDemo } from '@/components/home/OfferCheck';
import { listCases, listLeakCases, listOfferCases } from '@/lib/fixtures/source';
import { FIXTURES_DIR, fixtureMode, LEAK_FIXTURES_DIR, OFFER_FIXTURES_DIR } from '@/lib/server/mode';

type CheckType = 'media' | 'offer' | 'leak';

const TITLES: Record<CheckType, string> = {
  media: 'Check media — DejaVue',
  offer: 'Check a message — DejaVue',
  leak: 'Trace a leaked document — DejaVue',
};

const asType = (value: string | undefined): CheckType => (value === 'offer' || value === 'leak' ? value : 'media');

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type?: string }> }): Promise<Metadata> {
  const { type } = await searchParams;
  return { title: TITLES[asType(type)] };
}

/** The three checks, each named by the question it answers rather than by what it does. */
const MODES: { id: CheckType; href: string; label: string; question: string; hint: string; icon: typeof ImageIcon }[] = [
  {
    id: 'media',
    href: '/check',
    label: 'A photo or video',
    question: 'Where did it come from?',
    hint: 'Finds earlier copies, then checks them against the place and date claimed.',
    icon: ImageIcon,
  },
  {
    id: 'offer',
    href: '/check?type=offer',
    label: 'A message or offer',
    question: 'Is this offer real?',
    hint: 'Finds the organisation’s official site and looks for scam reports.',
    icon: MessageSquareText,
  },
  {
    id: 'leak',
    href: '/check?type=leak',
    label: 'A leaked document',
    question: 'Is this leak actually new?',
    hint: 'Finds public copies and when each one appeared. Never who leaked it.',
    icon: FileWarning,
  },
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
  leak: {
    title: 'Is this leak actually new?',
    blurb:
      'A screenshot or photo of a leaked document. DejaVue looks for public copies of the same image and shows when and where each one appeared. It never identifies who leaked anything.',
  },
};

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const current = asType((await searchParams).type);
  const mode = fixtureMode();
  const replay = mode === 'replay';
  const copy = COPY[current];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      {/*
        One question, asked first. The three checks answer genuinely different questions,
        so the choice is the page's opening move rather than a toggle above a form.
      */}
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">What do you want to check?</h1>
      </header>

      <nav aria-label="What to check" className="mt-8">
        <ul className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => {
            const active = current === m.id;
            return (
              <li key={m.id}>
                <Link
                  href={m.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full flex-col gap-3 rounded-2xl border p-5 transition-colors ${
                    active ? 'border-accent bg-surface' : 'border-line hover:border-line-strong hover:bg-surface'
                  }`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${
                      active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-muted'
                    }`}
                  >
                    <m.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm text-muted">{m.label}</span>
                    <span className={`mt-0.5 block font-serif text-xl leading-snug ${active ? 'text-ink' : 'text-ink/80'}`}>
                      {m.question}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-faint">{m.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={copy.title} className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-2xl leading-tight sm:text-3xl">{copy.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{copy.blurb}</p>
      </section>

      {current === 'leak' ? (
        <LeakTrace
          mode={mode}
          demos={replay ? listLeakCases(LEAK_FIXTURES_DIR).map((c): LeakDemo => ({ id: c.id, title: c.title, input: c.input })) : []}
        />
      ) : current === 'offer' ? (
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
