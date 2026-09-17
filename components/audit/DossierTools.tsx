'use client';

import { BadgeCheck, Download, Loader2, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Dossier } from '@/lib/shared/types';
import { Panel } from './Panel';

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'valid' } | { state: 'invalid' } | { state: 'error'; message: string };

export function DossierTools({ dossier }: { dossier: Dossier }) {
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${dossier.id}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const verify = async () => {
    setCheck({ state: 'checking' });
    const res = await fetch('/api/dossier/verify', { method: 'POST', body: JSON.stringify(dossier) });
    const data = await res.json().catch(() => ({}));
    setCheck(res.ok ? { state: data.valid ? 'valid' : 'invalid' } : { state: 'error', message: data?.error?.message ?? 'Could not verify' });
  };

  const button =
    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs text-ink transition-colors hover:border-line-strong hover:bg-surface-2';

  return (
    <Panel title="Signed dossier" subtitle="HMAC-SHA256 over the full result">
      <p className="truncate font-mono text-[11px] text-faint">{dossier.signature}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={download} className={button}>
          <Download className="size-3.5" /> JSON
        </button>
        <button type="button" onClick={verify} className={button} disabled={check.state === 'checking'}>
          {check.state === 'checking' ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} Verify
        </button>
      </div>
      <AnimatePresence mode="wait">
        {check.state !== 'idle' && check.state !== 'checking' && (
          <motion.p
            key={check.state}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-3 flex items-center gap-1.5 text-xs ${check.state === 'valid' ? 'text-good' : check.state === 'invalid' ? 'text-bad' : 'text-warn'}`}
          >
            {check.state === 'valid' ? (
              <>
                <BadgeCheck className="size-3.5" /> Signature valid: nothing was changed
              </>
            ) : check.state === 'invalid' ? (
              <>
                <ShieldAlert className="size-3.5" /> Signature does not match
              </>
            ) : (
              <>
                <ShieldQuestion className="size-3.5" /> {check.message}
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </Panel>
  );
}
