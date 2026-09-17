import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'FRAME_TOO_LARGE'
  | 'FRAME_UNREADABLE'
  | 'NO_FIXTURE'
  | 'RATE_LIMITED'
  | 'CREDITS_EXHAUSTED'
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'UPSTREAM_FAILED';

export function apiError(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

export const MONTHLY_CREDIT_LIMIT = Number(process.env.MONTHLY_CREDIT_LIMIT ?? 250);
export const MONTHLY_CREDIT_FLOOR = 20;

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
