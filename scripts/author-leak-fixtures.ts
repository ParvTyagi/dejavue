// Authors the SYNTHETIC leak-trace fixtures in fixtures/leaks/<caseId>/.
//
// Every response here is hand-written in SerpApi's documented JSON shape so the whole
// Leak trace feature, including the closest-to-original ranking, runs with zero SerpApi
// credits and no network. Sites use reserved `.example` domains and every document,
// company and date is invented: nothing here is a claim about a real leak, a real
// organisation or a real person.
//
// The images under originals/ are drawn here as well - plain blocks standing in for lines
// of text - and then resized, recompressed and cropped, so the ranking has real pixels to
// measure without any real document being committed.
//
// Usage: node scripts/author-leak-fixtures.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { datedSearch } from '../lib/serp/engines.ts';
import { fixtureName } from '../lib/serp/fixtureName.ts';

const OUT = path.join(process.cwd(), 'fixtures', 'leaks');

const frameUrl = (caseId: string, i: number) => `https://replay.dejavue.invalid/${caseId}/frame-${i}.jpg`;
const thumbUrl = (caseId: string, slug: string) => `https://thumbs.dejavue.invalid/${caseId}/${slug}.jpg`;

/** Flips `bits` evenly spaced bits of a 16-hex hash (bit 0 is never used). */
function near(hash: string, bits: number): string {
  let v = BigInt('0x' + hash);
  for (let i = 0; i < bits; i++) v ^= 1n << BigInt(62 - ((i * 7) % 62));
  return v.toString(16).padStart(16, '0');
}
const far = (hash: string) => (BigInt('0x' + hash) ^ 0x5a5a5a5a5a5a5a5an).toString(16).padStart(16, '0');

// ---------- stand-in documents ----------

const DOC_W = 480;
const DOC_H = 340;

/** A page of "text": bands whose widths vary with the seed, so two documents differ. */
async function document(seed: number): Promise<Buffer> {
  const rows: string[] = [];
  for (let i = 0; i < 11; i++) {
    const width = 90 + ((i * (61 + seed * 17)) % 300);
    rows.push(`<rect x="40" y="${52 + i * 25}" width="${width}" height="11" fill="#2f2f2f" opacity="${0.5 + (i % 4) * 0.12}" />`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DOC_W}" height="${DOC_H}">
  <rect width="${DOC_W}" height="${DOC_H}" fill="#ece7dc" />
  <rect x="40" y="20" width="${180 + seed * 20}" height="16" fill="#151515" />
  <circle cx="${400 - seed * 10}" cy="70" r="34" fill="#8d8d8d" opacity="0.45" />
  ${rows.join('')}
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toBuffer();
}

type Variant = 'source' | 'resized' | 'recompressed' | 'cropped';

async function variant(source: Buffer, kind: Variant): Promise<Buffer> {
  switch (kind) {
    case 'source':
      return source;
    case 'resized':
      return sharp(source).resize({ width: 240 }).jpeg({ quality: 82 }).toBuffer();
    case 'recompressed':
      return sharp(source).jpeg({ quality: 32 }).toBuffer();
    case 'cropped':
      return sharp(source)
        .extract({ left: Math.round(DOC_W * 0.2), top: Math.round(DOC_H * 0.2), width: Math.round(DOC_W * 0.6), height: Math.round(DOC_H * 0.6) })
        .jpeg({ quality: 88 })
        .toBuffer();
  }
}

// ---------- case specs ----------

/** How a copy's full-size image is answered: a drawn variant, or a reason it cannot be read. */
type OriginalSpec = { file: Variant } | { skip: 'too_large' | 'blocked' | 'unreadable' | 'deadline' };

interface Copy {
  site: string;
  slug: string;
  title: string;
  /** Written the way the engine writes it; omitted for a copy the engine cannot date. */
  date?: string;
  /**
   * How far this copy's thumbnail sits from the frame, in flipped bits: under 10 confirms
   * as the same image, and 'different' is another picture entirely.
   */
  bits: number | 'different';
  /** Pixel size the engine reports, and the image served for it. */
  original?: OriginalSpec & { width?: number; height?: number };
}

interface LeakSpec {
  id: string;
  title: string;
  notes: string;
  submittedAt: string;
  frames: { pHash: string; sharpness: number }[];
  claim: { text: string; source?: string; date?: string };
  maxCredits?: number;
  llm: {
    parseClaim: { event?: string; claimedAt?: string | null; refersToPast: boolean; referencedYear?: number };
    readScene: { signText: string[]; landmarks: { name: string; confidence: number }[]; language?: string };
  };
  lens?: Copy[][];
  bing?: Copy[];
  yandex?: Copy[];
  /** Google results for the dating search of an undated copy, keyed by that copy's title. */
  dating?: { forTitle: string; results: { site: string; slug: string; title: string; date: string }[] }[];
  expected: {
    verdict: string;
    flags: { predatesClaim: boolean; recycled: boolean; copiesFound: boolean; undatedOnly: boolean };
    credits: number;
    stepsRun: number[];
    confidence: number;
  };
}

const BASE = '2c7e5193a0b6d4e8';

/**
 * A distinct fingerprint per case. Demo cases are matched to their fixtures by image
 * hash, so two cases whose frames are within Hamming 10 of each other would answer to
 * the same upload; these masks keep them far apart, and the check below proves it.
 */
const CASE_MASKS = [0n, 0x0f0f0f0f0f0f0f0en, 0x3333333333333332n, 0x5555555555555554n, 0x00ff00ff00ff00fen, 0x6699669966996698n];
const caseHash = (i: number) => (BigInt('0x' + BASE) ^ CASE_MASKS[i]).toString(16).padStart(16, '0');
const distance = (a: string, b: string) => (BigInt('0x' + a) ^ BigInt('0x' + b)).toString(2).replace(/0/g, '').length;

const SPECS: LeakSpec[] = [
  {
    id: 'l01-recycled-payroll-memo',
    title: 'Two-year-old payroll memo reshared as "leaked today"',
    notes:
      'LEAK_RECYCLED: two dated copies on different sites corroborate a T₀ well before the claimed date, and the claim gives a date. Also the case that exercises the closest-to-original ranking, including a Lens match that carries no full-size link.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    frames: [{ pHash: BASE, sharpness: 820 }],
    claim: {
      text: 'Northwind Logistics internal payroll memo leaked today, full salary sheet is out',
      source: 'Northwind Logistics',
      date: '2026-03-10T09:00:00.000Z',
    },
    llm: {
      parseClaim: { event: 'payroll memo leak', claimedAt: '2026-03-10T09:00:00.000Z', refersToPast: false },
      readScene: {
        signText: ['NORTHWIND LOGISTICS', 'PAYROLL - CONFIDENTIAL', 'Contact 98765 43210 for queries'],
        landmarks: [],
        language: 'en',
      },
    },
    lens: [
      [
        { site: 'docs-archive.example', slug: 'payroll-memo-2024', title: 'Leaked payroll memo doing the rounds', date: 'Jan 8, 2024', bits: 2 },
        { site: 'infoboard.example', slug: 'threads/payroll-memo', title: 'Payroll memo thread', date: 'Jan 20, 2024', bits: 4 },
      ],
    ],
    bing: [
      {
        site: 'newswire.example',
        slug: 'stories/payroll-memo-surfaces',
        title: 'Payroll memo surfaces online',
        date: '2024-01-26T00:00:00Z',
        bits: 3,
        original: { file: 'source', width: DOC_W, height: DOC_H },
      },
      {
        site: 'repostboard.example',
        slug: 'p/payroll-memo',
        title: 'Reposted payroll memo',
        date: '2024-02-01T00:00:00Z',
        bits: 5,
        original: { file: 'recompressed', width: DOC_W, height: DOC_H },
      },
    ],
    yandex: [
      {
        site: 'mirror-site.example',
        slug: 'files/payroll-memo',
        title: 'Payroll memo mirror',
        bits: 6,
        original: { file: 'cropped', width: Math.round(DOC_W * 0.6), height: Math.round(DOC_H * 0.6) },
      },
    ],
    dating: [
      {
        forTitle: 'Payroll memo mirror',
        results: [
          { site: 'mirror-site.example', slug: 'files/payroll-memo', title: 'Payroll memo mirror', date: 'Jan 30, 2024' },
        ],
      },
    ],
    expected: {
      verdict: 'LEAK_RECYCLED',
      flags: { predatesClaim: true, recycled: true, copiesFound: true, undatedOnly: false },
      credits: 4,
      stepsRun: [1, 2, 3],
      confidence: 60,
    },
  },
  {
    id: 'l02-earliest-copy-found',
    title: 'Memo screenshot with its earliest public copy from the day before',
    notes: 'LEAK_EARLIEST_FOUND: a corroborated T₀ that does not contradict the claim. Yandex returns a look-alike that fails the thumbnail re-hash, so nothing undated is confirmed and no dating search is needed.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    frames: [{ pHash: BASE, sharpness: 760 }],
    claim: {
      text: 'Contoso HR memo about the layoffs leaked today',
      source: 'Contoso',
      date: '2026-03-10T09:00:00.000Z',
    },
    llm: {
      parseClaim: { event: 'HR memo leak', claimedAt: '2026-03-10T09:00:00.000Z', refersToPast: false },
      readScene: { signText: ['CONTOSO', 'INTERNAL MEMO'], landmarks: [], language: 'en' },
    },
    lens: [
      [
        { site: 'newsfeed.example', slug: 'posts/contoso-memo', title: 'Contoso memo posted', date: 'Mar 9, 2026', bits: 2 },
        { site: 'forum.example', slug: 't/contoso-memo', title: 'Contoso memo thread', date: 'Mar 10, 2026', bits: 3 },
      ],
    ],
    bing: [
      {
        site: 'techblog.example',
        slug: 'contoso-memo-explained',
        title: 'What the Contoso memo says',
        date: '2026-03-10T00:00:00Z',
        bits: 4,
        original: { file: 'source', width: DOC_W, height: DOC_H },
      },
    ],
    yandex: [{ site: 'lookalike.example', slug: 'i/other-memo', title: 'A different memo', bits: 'different' }],
    expected: {
      verdict: 'LEAK_EARLIEST_FOUND',
      flags: { predatesClaim: false, recycled: false, copiesFound: true, undatedOnly: false },
      credits: 3,
      stepsRun: [1, 3],
      confidence: 60,
    },
  },
  {
    id: 'l03-no-public-copy',
    title: 'Document no search engine has indexed',
    notes: 'LEAK_NOT_FOUND: every index answers, none has seen the image. The score credits the completeness of the search, never the conclusion.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    frames: [{ pHash: BASE, sharpness: 700 }],
    claim: {
      text: 'Fabrikam vendor contract leaked today on a private channel',
      source: 'Fabrikam',
      date: '2026-03-10T09:00:00.000Z',
    },
    llm: {
      parseClaim: { event: 'vendor contract leak', claimedAt: '2026-03-10T09:00:00.000Z', refersToPast: false },
      readScene: { signText: ['FABRIKAM', 'VENDOR AGREEMENT'], landmarks: [], language: 'en' },
    },
    lens: [[]],
    bing: [],
    yandex: [],
    expected: {
      verdict: 'LEAK_NOT_FOUND',
      flags: { predatesClaim: false, recycled: false, copiesFound: false, undatedOnly: false },
      credits: 3,
      stepsRun: [1],
      confidence: 20,
    },
  },
  {
    id: 'l04-blank-date-older-copy',
    title: 'Older copy found, but the post never claimed a date',
    notes:
      'The blank-date guard: an older public copy exists, so predatesClaim stands, but the post asserts no date and nothing in its text claims recency, so it is NOT LEAK_RECYCLED.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    frames: [{ pHash: BASE, sharpness: 740 }],
    claim: { text: 'Admissions list from Fabrikam University, is this real', source: 'Fabrikam University' },
    llm: {
      parseClaim: { event: 'admissions list', claimedAt: null, refersToPast: false },
      readScene: { signText: ['FABRIKAM UNIVERSITY', 'PROVISIONAL ADMISSIONS LIST'], landmarks: [], language: 'en' },
    },
    lens: [
      [
        { site: 'archive-board.example', slug: 'lists/admissions', title: 'Admissions list archived', date: 'May 4, 2025', bits: 2 },
        { site: 'studentforum.example', slug: 'threads/admissions', title: 'Admissions list thread', date: 'May 18, 2025', bits: 3 },
      ],
    ],
    bing: [
      {
        site: 'campusnews.example',
        slug: 'admissions-list-leak',
        title: 'Admissions list circulating',
        date: '2025-05-20T00:00:00Z',
        bits: 4,
        original: { file: 'resized', width: 240, height: 170 },
      },
    ],
    yandex: [],
    expected: {
      verdict: 'LEAK_EARLIEST_FOUND',
      flags: { predatesClaim: true, recycled: false, copiesFound: true, undatedOnly: false },
      credits: 3,
      stepsRun: [1, 3],
      confidence: 60,
    },
  },
  {
    id: 'l05-undated-copies-only',
    title: 'Public copies exist, but not one of them can be dated',
    notes:
      'Copies were found and the dating searches came back with nothing on the same site, so there is no T₀ and no timeline. The verdict stays LEAK_NOT_FOUND and the undatedOnly flag is what the page shows. One full-size image is too large to fetch, which is recorded as a skip.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    frames: [{ pHash: BASE, sharpness: 690 }],
    claim: {
      text: 'Tailwind Traders stock sheet leaked today from their warehouse system',
      source: 'Tailwind Traders',
      date: '2026-03-10T09:00:00.000Z',
    },
    llm: {
      parseClaim: { event: 'stock sheet leak', claimedAt: '2026-03-10T09:00:00.000Z', refersToPast: false },
      readScene: { signText: ['TAILWIND TRADERS', 'STOCK SHEET'], landmarks: [], language: 'en' },
    },
    lens: [
      [
        { site: 'imageboard.example', slug: 'b/stock-sheet', title: 'Stock sheet image', bits: 2 },
        { site: 'pastebin-mirror.example', slug: 'raw/stock-sheet', title: 'Stock sheet mirror', bits: 3 },
      ],
    ],
    bing: [
      {
        site: 'filehost.example',
        slug: 'd/stock-sheet',
        title: 'Stock sheet download',
        bits: 4,
        original: { file: 'source', width: DOC_W, height: DOC_H },
      },
    ],
    yandex: [
      {
        site: 'bigmirror.example',
        slug: 'i/stock-sheet',
        title: 'Stock sheet copy',
        bits: 5,
        original: { skip: 'too_large', width: 6000, height: 4000 },
      },
    ],
    dating: [
      { forTitle: 'Stock sheet image', results: [{ site: 'unrelated.example', slug: 'a', title: 'Something else', date: 'Feb 2, 2025' }] },
      // A second dating search, so the fixtures cover two searches on the same engine.
      { forTitle: 'Stock sheet mirror', results: [{ site: 'another-unrelated.example', slug: 'b', title: 'Also something else', date: 'Mar 3, 2025' }] },
    ],
    expected: {
      verdict: 'LEAK_NOT_FOUND',
      flags: { predatesClaim: false, recycled: false, copiesFound: true, undatedOnly: true },
      credits: 5,
      stepsRun: [1, 2, 3],
      confidence: 40,
    },
  },
  {
    id: 'l06-budget-stops-third-index',
    title: 'Credit cap reached before the third index is searched',
    notes:
      'The cap is two searches, so Yandex is never asked and is recorded as skipped over budget. The verdict still rests on what the first two indexes confirmed. Both copies are within 48 h of the claimed date, so nothing predates the claim.',
    submittedAt: '2026-03-10T09:00:00.000Z',
    maxCredits: 2,
    frames: [{ pHash: BASE, sharpness: 710 }],
    claim: {
      text: 'Woodgrove Bank branch circular leaked today',
      source: 'Woodgrove Bank',
      date: '2026-03-10T09:00:00.000Z',
    },
    llm: {
      parseClaim: { event: 'branch circular leak', claimedAt: '2026-03-10T09:00:00.000Z', refersToPast: false },
      readScene: { signText: ['WOODGROVE BANK', 'BRANCH CIRCULAR'], landmarks: [], language: 'en' },
    },
    lens: [[{ site: 'bankwatch.example', slug: 'posts/circular', title: 'Branch circular posted', date: 'Mar 8, 2026', bits: 2 }]],
    bing: [
      {
        site: 'financeblog.example',
        slug: 'woodgrove-circular',
        title: 'Woodgrove circular explained',
        date: '2026-03-09T00:00:00Z',
        bits: 3,
        original: { file: 'source', width: DOC_W, height: DOC_H },
      },
    ],
    yandex: [{ site: 'never-searched.example', slug: 'x', title: 'Never searched', bits: 4 }],
    expected: {
      verdict: 'LEAK_EARLIEST_FOUND',
      flags: { predatesClaim: false, recycled: false, copiesFound: true, undatedOnly: false },
      credits: 2,
      stepsRun: [1, 3],
      confidence: 45,
    },
  },
];

// ---------- writing ----------

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

async function writeCase(spec: LeakSpec) {
  const dir = path.join(OUT, spec.id);
  mkdirSync(path.join(dir, 'originals'), { recursive: true });

  const serp: Record<string, unknown> = {};
  const thumbs: Record<string, string> = {};
  const originals: Record<string, unknown> = {};
  const meta = { search_metadata: { status: 'Success', processed_at: spec.submittedAt }, _synthetic: true };
  const put = (engine: string, params: Record<string, string>, body: object, frameIndex?: number) => {
    serp[fixtureName(engine as Parameters<typeof fixtureName>[0], params, frameIndex)] = { ...meta, ...body };
  };

  const frameHash = spec.frames[0].pHash;
  const thumbHash = (c: Copy) => (c.bits === 'different' ? far(frameHash) : near(frameHash, c.bits));
  const source = await document(spec.id.charCodeAt(1) % 5);
  const written = new Set<string>();
  /** Registers the full-size image a copy's `original` URL answers with. */
  const originalUrl = async (copy: Copy): Promise<string | undefined> => {
    if (!copy.original) return undefined;
    const url = `https://${copy.site}/full/${copy.slug.replace(/\//g, '-')}.jpg`;
    if ('skip' in copy.original) {
      originals[url] = { skip: copy.original.skip };
      return url;
    }
    const file = `${copy.original.file}.jpg`;
    if (!written.has(file)) {
      writeFileSync(path.join(dir, 'originals', file), await variant(source, copy.original.file));
      written.add(file);
    }
    originals[url] = file;
    return url;
  };

  const lensItems = async (copies: Copy[]) =>
    Promise.all(
      copies.map(async (c, i) => {
        const t = thumbUrl(spec.id, c.slug.replace(/\//g, '-'));
        thumbs[t] = thumbHash(c);
        // Lens exact matches carry the image's dimensions but no link to it.
        return {
          position: i + 1,
          title: c.title,
          link: `https://www.${c.site}/${c.slug}`,
          source: c.site,
          thumbnail: t,
          ...(c.date ? { date: c.date } : {}),
          ...(c.original && !('skip' in c.original)
            ? { actual_image_width: c.original.width, actual_image_height: c.original.height }
            : {}),
        };
      }),
    );

  const bingItems = async (copies: Copy[]) =>
    Promise.all(
      copies.map(async (c, i) => {
        const t = thumbUrl(spec.id, c.slug.replace(/\//g, '-'));
        thumbs[t] = thumbHash(c);
        const url = await originalUrl(c);
        return {
          position: i + 1,
          title: c.title,
          link: `https://www.${c.site}/${c.slug}`,
          source: `https://www.${c.site}/${c.slug}`,
          domain: c.site,
          thumbnail: t,
          ...(c.date ? { date: c.date } : {}),
          ...(url ? { original: url, cdn_original: `https://cdn.bing.example/${spec.id}.jpg` } : {}),
          ...(c.original?.width ? { width: c.original.width, height: c.original.height, file_size: '120000 B' } : {}),
        };
      }),
    );

  const yandexItems = async (copies: Copy[]) =>
    Promise.all(
      copies.map(async (c) => {
        const t = thumbUrl(spec.id, c.slug.replace(/\//g, '-'));
        thumbs[t] = thumbHash(c);
        const url = await originalUrl(c);
        return {
          title: c.title,
          link: `https://www.${c.site}/${c.slug}`,
          source: c.site,
          // Yandex nests the thumbnail, and names the full-size image `original_image`.
          thumbnail: { link: t, width: 200, height: 140 },
          ...(url ? { original_image: { link: url, width: c.original?.width, height: c.original?.height } } : {}),
        };
      }),
    );

  const url0 = (i: number) => frameUrl(spec.id, i);
  for (const [i, copies] of (spec.lens ?? []).entries()) {
    put('google_lens', { url: url0(i), type: 'exact_matches' }, { exact_matches: await lensItems(copies) }, i);
  }
  if (spec.bing) put('bing_reverse_image', { image_url: url0(0) }, { pages_with_this_image: await bingItems(spec.bing) }, 0);
  if (spec.yandex) put('yandex_images', { url: url0(0) }, { image_results: await yandexItems(spec.yandex) }, 0);

  const claimedAt = new Date(spec.claim.date ?? spec.llm.parseClaim.claimedAt ?? spec.submittedAt).toISOString();
  for (const d of spec.dating ?? []) {
    const req = datedSearch(d.forTitle, claimedAt);
    put('google', req.params, {
      organic_results: d.results.map((r, i) => ({
        position: i + 1,
        title: r.title,
        link: `https://www.${r.site}/${r.slug}`,
        snippet: 'Synthetic result for a replayed dating search.',
        date: r.date,
      })),
    });
  }

  const caseJson = {
    title: spec.title,
    synthetic: true,
    notes: spec.notes,
    submittedAt: spec.submittedAt,
    input: {
      media: { kind: 'image', frames: spec.frames.map((f, i) => ({ url: url0(i), ...f })) },
      claim: spec.claim,
      maxCredits: spec.maxCredits ?? 6,
    },
    expected: spec.expected,
  };

  writeFileSync(path.join(dir, 'case.json'), json(caseJson));
  writeFileSync(path.join(dir, 'serp.json'), json(serp));
  writeFileSync(path.join(dir, 'llm.json'), json({ parseClaim: spec.llm.parseClaim, readScene: spec.llm.readScene }));
  writeFileSync(path.join(dir, 'thumbs.json'), json(thumbs));
  writeFileSync(path.join(dir, 'originals.json'), json(originals));
  console.log(`wrote ${spec.id}`);
}

// Each case gets its own frame fingerprint, so a demo upload can only match the case it
// belongs to. Thumbnails are derived from that same fingerprint when each case is written.
SPECS.forEach((spec, i) => {
  spec.frames = spec.frames.map((f) => ({ ...f, pHash: caseHash(i) }));
});

for (let i = 0; i < SPECS.length; i++) {
  for (let j = i + 1; j < SPECS.length; j++) {
    const apart = distance(caseHash(i), caseHash(j));
    if (apart <= 10) throw new Error(`${SPECS[i].id} and ${SPECS[j].id} are only ${apart} bits apart; demo matching would confuse them`);
  }
}

for (const spec of SPECS) await writeCase(spec);
