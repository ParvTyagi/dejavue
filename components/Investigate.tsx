'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MediaError, prepareImage, prepareVideo, type PreparedUpload } from '@/lib/client/prepareMedia';
import type { AuditInput, FixtureMode } from '@/lib/shared/types';

export interface DemoCase {
  id: string;
  title: string;
  kind: 'image' | 'video';
  input: AuditInput;
}

type Source = 'upload' | 'url' | 'demo';

const REPLAY_FRAME_URL = (i: number) => `https://replay.dejavue.invalid/upload/frame-${i}.jpg`;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  return data;
}

export function Investigate({ mode, demos }: { mode: FixtureMode; demos: DemoCase[] }) {
  const router = useRouter();
  const replay = mode === 'replay';
  const [source, setSource] = useState<Source>(replay ? 'demo' : 'upload');
  const [prepared, setPrepared] = useState<PreparedUpload>();
  const [imageUrl, setImageUrl] = useState('');
  const [claim, setClaim] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [useExif, setUseExif] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  const busy = !!status;

  async function onFile(file: File | undefined) {
    setError(undefined);
    setPrepared(undefined);
    if (!file) return;
    try {
      if (file.type.startsWith('video/')) {
        setStatus('Picking keyframes…');
        setPrepared(await prepareVideo(file, (f) => setStatus(`Picking keyframes… ${Math.round(f * 100)}%`)));
      } else {
        setStatus('Preparing image…');
        setPrepared(await prepareImage(file));
      }
    } catch (err) {
      setError(err instanceof MediaError ? err.message : "Couldn't read this file.");
    } finally {
      setStatus(undefined);
    }
  }

  async function start(input: unknown) {
    const { auditId } = await postJson('/api/investigate', input);
    router.push(`/audit/${auditId}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const claimBody = {
      text: claim.trim(),
      ...(place.trim() ? { place: place.trim() } : {}),
      ...(date ? { date: new Date(date).toISOString() } : {}),
    };
    try {
      if (source === 'upload') {
        if (!prepared) throw new Error('Choose an image or video first.');
        const frames = [];
        for (const [i, f] of prepared.frames.entries()) {
          let url = REPLAY_FRAME_URL(i);
          if (!replay) {
            setStatus(`Uploading frame ${i + 1} of ${prepared.frames.length}…`);
            const form = new FormData();
            form.append('frame', f.blob, `frame-${i}.jpg`);
            const res = await fetch('/api/upload', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed.');
            url = data.url;
          }
          frames.push({ url, pHash: f.pHash, sharpness: f.sharpness, tMs: f.tMs });
        }
        setStatus('Starting audit…');
        await start({
          media: { kind: prepared.kind, frames, exif: useExif ? prepared.exif ?? null : null },
          claim: claimBody,
          options: { maxCredits: 6, useExifLocation: useExif && !!prepared.exif?.gps },
        });
      } else if (source === 'url') {
        setStatus('Starting audit…');
        await start({ media: { kind: 'image', frames: [{ url: imageUrl.trim(), sharpness: 0 }] }, claim: claimBody });
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus(undefined);
    }
  }

  async function runDemo(demo: DemoCase) {
    setError(undefined);
    setStatus(`Starting “${demo.title}”…`);
    try {
      await start(demo.input);
    } catch (err) {
      setError((err as Error).message);
      setStatus(undefined);
    }
  }

  const tabs: { id: Source; label: string }[] = [
    ...(replay ? [{ id: 'demo' as const, label: 'Demo cases' }] : []),
    { id: 'upload', label: 'Upload' },
    { id: 'url', label: 'Image URL' },
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={source === t.id}
            onClick={() => setSource(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm ${
              source === t.id ? 'border border-b-0 border-line bg-bg font-medium' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        {source === 'demo' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Replay mode runs the full pipeline on recorded search results, so it costs no credits. These cases are
              synthetic: invented scenarios in SerpApi's response format, not real publication histories.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {demos.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runDemo(d)}
                    className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line p-3 text-left hover:border-accent disabled:opacity-50"
                  >
                    <span className="text-sm font-medium">{d.title}</span>
                    <span className="font-mono text-xs text-muted">
                      {d.id} · {d.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              {source === 'upload' ? (
                <>
                  <label className="block text-sm font-medium" htmlFor="media">
                    Image or short video
                  </label>
                  <input
                    id="media"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    disabled={busy}
                    onChange={(e) => onFile(e.target.files?.[0])}
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-ink"
                  />
                  <p className="text-xs text-muted">Up to 10 MB for images and 50 MB for video. Only resized frames leave your browser.</p>
                  {prepared && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {prepared.frames.map((f) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={f.previewUrl} src={f.previewUrl} alt="Prepared frame" className="h-24 rounded-lg border border-line object-cover" />
                        ))}
                      </div>
                      <p className="font-mono text-xs text-muted">
                        {prepared.frames.length} frame(s) · pHash {prepared.frames.map((f) => f.pHash).join(', ')}
                      </p>
                      {prepared.exif && (
                        <label className="flex items-start gap-2 rounded-lg bg-surface-2 p-2 text-xs">
                          <input type="checkbox" checked={useExif} onChange={(e) => setUseExif(e.target.checked)} className="mt-0.5" />
                          <span>
                            This photo contains
                            {prepared.exif.gps ? ` GPS ${prepared.exif.gps.map((n) => n.toFixed(4)).join(', ')}` : ''}
                            {prepared.exif.takenAt ? ` a capture date of ${prepared.exif.takenAt.slice(0, 10)}` : ''}. Use
                            photo location as evidence? It is only sent if you tick this.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  {replay && (
                    <p className="text-xs text-warn">
                      Replay mode only recognises the demo case images. Set FIXTURE_MODE=live to search for any image.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium" htmlFor="imageUrl">
                    Public image URL
                  </label>
                  <input
                    id="imageUrl"
                    type="url"
                    required
                    placeholder="https://…/photo.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
                  />
                  {replay && <p className="text-xs text-warn">Image URLs need FIXTURE_MODE=live.</p>}
                </>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium" htmlFor="claim">
                What does the post claim?
              </label>
              <textarea
                id="claim"
                required
                minLength={5}
                maxLength={500}
                rows={3}
                placeholder="Drone strike on port facilities in Dubai tonight"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-muted" htmlFor="place">
                    Claimed place (optional)
                  </label>
                  <input
                    id="place"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="Dubai, UAE"
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted" htmlFor="date">
                    Claimed date (defaults to now)
                  </label>
                  <input
                    id="date"
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy || (source === 'upload' && !prepared)}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink disabled:opacity-50"
              >
                Check where it came from
              </button>
            </div>
          </form>
        )}

        {(status || error) && (
          <p role="status" className={`mt-4 text-sm ${error ? 'text-bad' : 'text-muted'}`}>
            {error ?? status}
          </p>
        )}
      </div>
    </div>
  );
}
