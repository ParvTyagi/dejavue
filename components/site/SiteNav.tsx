'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import type { FixtureMode } from '@/lib/shared/types';
import { LogoMark } from './Logo';

export function SiteNav({ mode }: { mode: FixtureMode }) {
  const { scrollY } = useScroll();
  const borderOpacity = useTransform(scrollY, [0, 80], [0, 1]);
  const replay = mode === 'replay';

  return (
    <motion.header className="sticky top-0 z-50 backdrop-blur-xl" style={{ backgroundColor: 'rgb(8 8 10 / 0.72)' }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <motion.span whileHover={{ rotate: -18 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
            <LogoMark className="size-7" />
          </motion.span>
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
      <motion.div className="h-px bg-line" style={{ opacity: borderOpacity }} />
    </motion.header>
  );
}
