import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SIGNED_URL_TTL_S = 15 * 60;

let client: SupabaseClient | undefined;

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required outside replay mode');
  return (client ??= createClient(url, key, { auth: { persistSession: false } }));
}

const bucket = () => process.env.SUPABASE_BUCKET ?? 'dejavue-tmp';

/**
 * Stores a prepared frame under a random key and returns a 15-minute signed
 * URL that SerpApi's servers can fetch.
 */
export async function putTemporaryFrame(bytes: ArrayBuffer, contentType: string) {
  const path = `tmp/${randomBytes(16).toString('hex')}.jpg`;
  const { error } = await supabase().storage.from(bucket()).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data, error: signError } = await supabase().storage.from(bucket()).createSignedUrl(path, SIGNED_URL_TTL_S);
  if (signError || !data) throw new Error(`Could not sign upload URL: ${signError?.message}`);
  return { path, url: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_S };
}

/** Deletes frames once an audit ends; signed URLs expire regardless. */
export async function deleteTemporaryFrames(urls: string[]) {
  const host = process.env.SUPABASE_URL && new URL(process.env.SUPABASE_URL).host;
  const paths = urls
    .map((u) => new URL(u))
    .filter((u) => u.host === host)
    .map((u) => decodeURIComponent(u.pathname.split(`/${bucket()}/`)[1] ?? ''))
    .filter(Boolean);
  if (paths.length) await supabase().storage.from(bucket()).remove(paths);
}

export function isTemporaryStoreUrl(raw: string): boolean {
  const base = process.env.SUPABASE_URL;
  return !!base && new URL(raw).host === new URL(base).host;
}
