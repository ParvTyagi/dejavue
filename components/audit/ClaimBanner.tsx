'use client';

import { Building2, CalendarDays, Film, Image as ImageIcon, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/ui/motion';
import type { AuditIntro } from '@/lib/client/auditIntro';
import { displayDate } from '@/lib/client/labels';
import type { Claim } from '@/lib/shared/types';

/**
 * The claim under investigation, with media previews when the upload came from this tab.
 * Shared by media audits and leak traces: both start from an image and a claim about it,
 * and a leak trace adds who the post says the document came from.
 */
export function ClaimBanner({
  intro,
  claim,
  source,
  scanning,
}: {
  intro?: AuditIntro;
  claim?: Claim;
  /** Who a leak trace's post says the document leaked from, as typed. */
  source?: string;
  /** Whether the audit is still running, which keeps the scan band moving over the previews. */
  scanning?: boolean;
}) {
  const text = claim?.rawText ?? intro?.claim;
  const place = claim?.place ?? intro?.place;
  const previews = intro?.previews ?? [];
  const Kind = intro?.kind === 'video' ? Film : ImageIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
      className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end"
    >
      {previews.length > 0 && (
        <div className="flex shrink-0 -space-x-6">
          {previews.slice(0, 3).map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, rotate: 0, y: 10 }}
              animate={{ opacity: 1, rotate: (i - 1) * 6, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 200, damping: 18 }}
              className="relative size-24 overflow-hidden rounded-xl border border-line-strong shadow-sm sm:size-28"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
              {scanning && <div className="scan-band animate-scan" />}
            </motion.div>
          ))}
        </div>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs tracking-wide text-faint uppercase">
          <Kind className="size-3.5" /> Claim under investigation
        </p>
        {text ? (
          <h1 className="mt-2 font-serif text-3xl leading-tight text-balance text-ink sm:text-4xl">
            “
            {text}
            ”
          </h1>
        ) : (
          <div className="mt-3 h-9 w-3/4 animate-pulse rounded-lg bg-surface-2" />
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {source && (
            <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <Building2 className="size-3" /> claimed source: {source}
            </span>
          )}
          {place && (
            <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <MapPin className="size-3" /> {place}
            </span>
          )}
          {claim && (
            <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <CalendarDays className="size-3" /> {displayDate(claim.claimedAt)}
              {claim.claimedAtSource === 'default_now' && <span className="text-faint">(assumed now)</span>}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
