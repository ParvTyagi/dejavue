'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FixtureMode } from '@/lib/shared/types';
import { LogoMark } from './Logo';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/check', label: 'Check a photo' },
  { href: '/check?type=offer', label: 'Check a message' },
];

export function SiteNav({ mode }: { mode: FixtureMode }) {
  const replay = mode === 'replay';
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The panel is a page-level overlay, so it must not outlive the page that opened it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-bg supports-[backdrop-filter]:bg-bg/85 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 rounded-lg">
          <span className="transition-transform duration-300 ease-out group-hover:-rotate-[18deg]">
            <LogoMark className="size-7" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DejaVue</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
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

          <nav aria-label="Main" className="hidden items-center gap-5 sm:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded text-sm text-muted transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 flex size-9 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-surface-2 sm:hidden"
          >
            {open ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
          </button>
        </div>
      </div>

      {/* Every destination stays reachable on a phone, where the inline links are hidden. */}
      {open && (
        <nav id="site-menu" aria-label="Main" className="border-t border-line bg-bg px-4 py-2 sm:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-lg px-2 py-3 text-sm text-ink transition-colors hover:bg-surface-2"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="nav-rule h-px bg-line" />
    </header>
  );
}
