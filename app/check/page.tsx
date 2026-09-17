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

const MODES: { id: CheckType; href: string; label: string; icon: typeof ImageIcon }[] = [
  { id: 'media', href: '/check', label: 'Photo / Video', icon: ImageIcon },
  { id: 'offer', href: '/check?type=offer', label: 'Message / Offer', icon: MessageSquareText },
];

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const current: CheckType = (await searchParams).type === 'offer' ? 'offer' : 'media';
  const mode = fixtureMode();
  const replay = mode === 'replay';

  return (
    <>
      <nav aria-label="What to check" className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
          {MODES.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              aria-current={current === m.id ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                current === m.id ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
              }`}
            >
              <m.icon className="size-4" />
              {m.label}
            </Link>
          ))}
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
    </>
  );
}
