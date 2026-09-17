import { NextResponse } from 'next/server';
import { appStore, fixtureMode } from '@/lib/server/deps';
import { MONTHLY_CREDIT_LIMIT, monthStartIso } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ledger totals, cache hit rate and (outside replay) SerpApi's own searches-left figure. */
export async function GET() {
  const mode = fixtureMode();
  const stats = await appStore().ledgerStats(monthStartIso());
  const calls = stats.creditsThisMonth + stats.cachedThisMonth;

  let serpapiSearchesLeft: number | undefined;
  if (mode !== 'replay' && process.env.SERPAPI_API_KEY) {
    // The Account API does not consume search credits.
    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(process.env.SERPAPI_API_KEY)}`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    const account = (await res?.json().catch(() => undefined)) as { total_searches_left?: number } | undefined;
    serpapiSearchesLeft = account?.total_searches_left;
  }

  return NextResponse.json({
    mode,
    monthlyLimit: MONTHLY_CREDIT_LIMIT,
    creditsThisMonth: stats.creditsThisMonth,
    cacheHitRate: calls ? stats.cachedThisMonth / calls : 0,
    serpapiSearchesLeft,
  });
}
