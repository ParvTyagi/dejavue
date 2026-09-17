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
          <Link href="/check" className="hidden text-sm text-muted transition-colors hover:text-ink sm:inline">
            Check a photo
          </Link>
          <Link href="/check?type=offer" className="text-sm text-muted transition-colors hover:text-ink">
            Check a message
          </Link>
          {/* Visitors only need to know when they're looking at example cases, not how the server is configured. */}
          {replay && (
            <span
              title="This site shows example cases with saved search results."
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] text-muted"
            >
              <span className="size-1.5 rounded-full bg-accent" />
              Demo
            </span>
          )}
        </nav>
      </div>
      <div className="nav-rule h-px bg-line" />
    </header>
  );
}
