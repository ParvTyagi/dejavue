import Link from 'next/link';
import type { FixtureMode } from '@/lib/shared/types';
import { LogoMark } from './Logo';

export function SiteNav({ mode }: { mode: FixtureMode }) {
  const replay = mode === 'replay';

  return (
    <header className="sticky top-0 z-50 bg-bg/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="transition-transform duration-300 ease-out group-hover:-rotate-[18deg]">
            <LogoMark className="size-7" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DejaVue</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5">
          <Link href="/#how" className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline">
            How it works
          </Link>
          <Link href="/#check" className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline">
            Check media
          </Link>
          <span
            title={
              replay
                ? 'Replay mode: results come from recorded demo cases. No search credits are used.'
                : `${mode} mode: every audit searches SerpApi for real.`
            }
            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] ${
              replay ? 'border-line text-muted' : 'border-warn/40 bg-warn-soft text-warn'
            }`}
          >
            <span className="relative flex size-1.5">
              <span className={`absolute inset-0 animate-pulse-ring rounded-full ${replay ? 'bg-accent' : 'bg-warn'}`} />
              <span className={`relative size-1.5 rounded-full ${replay ? 'bg-accent' : 'bg-warn'}`} />
            </span>
            {replay ? 'replay · 0 credits' : `${mode} · uses credits`}
          </span>
        </nav>
      </div>
      <div className="nav-rule h-px bg-line" />
    </header>
  );
}
