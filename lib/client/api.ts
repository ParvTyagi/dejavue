'use client';

/** POSTs JSON and returns the parsed body, throwing the server's error message on failure. */
export async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  return data;
}

/** Uploads one image to the temporary store and returns its short-lived URL. */
export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('frame', blob, name);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed.');
  return data.url;
}

export const FIELD_CLASS =
  'w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint transition-colors outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10';
