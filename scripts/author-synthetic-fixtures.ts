// Authors the SYNTHETIC golden-case fixtures in fixtures/<caseId>/.
//
// These responses are hand-written in SerpApi's JSON shape so the whole app and
// test suite run with zero SerpApi credits. Outlets use reserved `.example`
// domains and every scenario is invented: nothing here is a claim about what
// real publishers printed or when the real images first appeared. Frame hashes
// for c1/c2/c3/c6 come from the local test images (npm run fixtures:hash).
// Replace a case with recorded responses (FIXTURE_MODE=record) once credits are
// approved, then delete it from this script.
//
// Usage: node scripts/author-synthetic-fixtures.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureName } from '../lib/serp/fixtureName.ts';
import type { EngineRequest } from '../lib/serp/engines.ts';

const OUT = path.join(process.cwd(), 'fixtures');

// ---------- helpers ----------

/** Flips `bits` evenly spaced bits of a 16-hex hash (bit 0 is never used). */
function near(hash: string, bits: number): string {
  let v = BigInt('0x' + hash);
  for (let i = 0; i < bits; i++) v ^= 1n << BigInt(62 - ((i * 7) % 62));
  return v.toString(16).padStart(16, '0');
}
const far = (hash: string) => (BigInt('0x' + hash) ^ 0x5a5a5a5a5a5a5a5an).toString(16).padStart(16, '0');

const frameUrl = (caseId: string, i: number) => `https://replay.dejavue.invalid/${caseId}/frame-${i}.jpg`;
const thumb = (caseId: string, name: string) => `https://thumbs.dejavue.invalid/${caseId}/${name}.jpg`;

interface MatchSpec {
  site: string;
  slug: string;
  title: string;
  date?: string;
  hash: string;
}

interface Place {
  title: string;
  lat: number;
  lng: number;
  type: string;
  address?: string;
}

interface CaseSpec {
  id: string;
  title: string;
  notes: string;
  submittedAt: string;
  kind: 'image' | 'video';
  frames: { pHash: string; sharpness: number; tMs?: number }[];
  claim: { text: string; place?: string; date?: string };
  maxCredits?: number;
  llm: {
    parseClaim: { event?: string; place?: string; claimedAt?: string | null; refersToPast: boolean; referencedYear?: number };
    readScene: { signText: string[]; landmarks: { name: string; confidence: number }[]; broadcastLogo?: string; language?: string };
    narrate?: { summary: string; bullets: { text: string; evidenceIds: string[] }[] };
  };
  lens?: MatchSpec[][]; // per frame index, in input order
  bing?: MatchSpec[];
  yandex?: MatchSpec[];
  news?: { site: string; slug: string; title: string; iso: string; snippet: string }[];
  mapsClaim?: Place | null;
  mapsScene?: { q: string; place: Place | null };
  youtube?: MatchSpec[];
  expected: {
    verdict: string;
    flags: { recycled: boolean; misplaced: boolean; predatesClaim: boolean };
    credits: number;
    tiersRun: number[];
    confidence: number;
  };
}

function writeCase(spec: CaseSpec) {
  const dir = path.join(OUT, spec.id);
  mkdirSync(dir, { recursive: true });
  const serp: Record<string, unknown> = {};
  const thumbs: Record<string, string> = {};
  const meta = { search_metadata: { status: 'Success', processed_at: spec.submittedAt }, _synthetic: true };

  const put = (req: EngineRequest, body: object) => {
    serp[fixtureName(req.engine, req.params, req.frameIndex)] = { ...meta, ...body };
  };
  /** `dateKey: null` omits dates entirely, for engines that never return one. */
  const items = (matches: MatchSpec[] = [], dateKey: string | null = 'date') =>
    matches.map((m, i) => {
      const t = thumb(spec.id, `${m.slug}`);
      thumbs[t] = m.hash;
      return {
        position: i + 1,
        title: m.title,
        link: `https://www.${m.site}/${m.slug}`,
        source: m.site,
        thumbnail: t,
        ...(m.date && dateKey ? { [dateKey]: m.date } : {}),
      };
    });

  const url0 = (i: number) => frameUrl(spec.id, i);
  const sharpestIndex = spec.frames.reduce((best, f, i) => (f.sharpness > spec.frames[best].sharpness ? i : best), 0);

  spec.lens?.forEach((matches, i) =>
    put({ engine: 'google_lens', params: { url: url0(i), type: 'exact_matches' }, frameIndex: i }, { exact_matches: items(matches) }),
  );
  if (spec.bing) {
    // Real Bing returns exact matches in `pages_with_this_image`, with ISO 8601 dates.
    put(
      { engine: 'bing_reverse_image', params: { image_url: url0(sharpestIndex) }, frameIndex: sharpestIndex },
      { pages_with_this_image: items(spec.bing) },
    );
  }
  if (spec.yandex) {
    // Real Yandex returns no date on any response field, so neither do these fixtures.
    put(
      { engine: 'yandex_images', params: { url: url0(sharpestIndex) }, frameIndex: sharpestIndex },
      { image_results: items(spec.yandex, null) },
    );
  }
  const place = spec.claim.place ?? spec.llm.parseClaim.place;
  if (spec.news) {
    const q = [spec.llm.parseClaim.event, place].filter(Boolean).join(' ').trim();
    put(
      { engine: 'google_news', params: { q } },
      {
        news_results: spec.news.map((n, i) => ({
          position: i + 1,
          title: n.title,
          snippet: n.snippet,
          link: `https://www.${n.site}/${n.slug}`,
          source: { name: n.site },
          iso_date: n.iso,
        })),
      },
    );
  }
  const mapsBody = (p: Place | null) =>
    p
      ? { place_results: { title: p.title, type: p.type, address: p.address, gps_coordinates: { latitude: p.lat, longitude: p.lng } } }
      : { local_results: [] };
  if (spec.mapsClaim !== undefined && place) {
    put({ engine: 'google_maps', params: { q: place, type: 'search' } }, mapsBody(spec.mapsClaim));
  }
  if (spec.mapsScene) {
    put({ engine: 'google_maps', params: { q: spec.mapsScene.q, type: 'search' } }, mapsBody(spec.mapsScene.place));
  }
  if (spec.youtube) {
    const q = (spec.llm.parseClaim.event ?? spec.claim.text).slice(0, 100);
    put(
      { engine: 'youtube', params: { search_query: q } },
      {
        video_results: items(spec.youtube, 'published_date').map((v) => ({
          ...v,
          link: v.link.replace(/^https:\/\/www\.[^/]+\//, 'https://www.youtube.com/watch?v='),
          thumbnail: { static: v.thumbnail },
        })),
      },
    );
  }

  const caseJson = {
    title: spec.title,
    synthetic: true,
    notes: spec.notes,
    submittedAt: spec.submittedAt,
    input: {
      media: {
        kind: spec.kind,
        frames: spec.frames.map((f, i) => ({ url: url0(i), ...f })),
        exif: null,
      },
      claim: spec.claim,
      options: { maxCredits: spec.maxCredits ?? 6, useExifLocation: false },
    },
    expected: spec.expected,
  };
  const llm: Record<string, unknown> = { parseClaim: spec.llm.parseClaim, readScene: spec.llm.readScene };
  if (spec.llm.narrate) llm.narrate = spec.llm.narrate;

  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  writeFileSync(path.join(dir, 'case.json'), json(caseJson));
  writeFileSync(path.join(dir, 'serp.json'), json(serp));
  writeFileSync(path.join(dir, 'llm.json'), json(llm));
  writeFileSync(path.join(dir, 'thumbs.json'), json(thumbs));
}

// ---------- places (real coordinates) ----------

const PLACES = {
  ukraine: { title: 'Ukraine', lat: 48.3794, lng: 31.1656, type: 'Country' },
  derzhprom: { title: 'Derzhprom', lat: 49.9929, lng: 36.2286, type: 'Historical landmark', address: 'Svobody Square, 5, Kharkiv, Kharkiv Oblast, Ukraine, 61000' },
  japan: { title: 'Japan', lat: 36.2048, lng: 138.2529, type: 'Country' },
  dubai: { title: 'Dubai', lat: 25.2048, lng: 55.2708, type: 'City', address: 'Dubai, United Arab Emirates' },
  jeddahPort: { title: 'Jeddah Islamic Port', lat: 21.4735, lng: 39.1665, type: 'Port', address: 'Jeddah 22312, Saudi Arabia' },
  mumbai: { title: 'Mumbai', lat: 19.076, lng: 72.8777, type: 'City', address: 'Mumbai, Maharashtra, India' },
  howrahBridge: { title: 'Howrah Bridge', lat: 22.5851, lng: 88.3468, type: 'Bridge', address: 'Jagannath Ghat, Kolkata, West Bengal 700001, India' },
  shimla: { title: 'Shimla', lat: 31.1048, lng: 77.1734, type: 'City', address: 'Shimla, Himachal Pradesh, India' },
  theRidge: { title: 'The Ridge', lat: 31.1041, lng: 77.175, type: 'Tourist attraction', address: 'The Mall, Shimla, Himachal Pradesh 171001, India' },
  khandala: { title: 'Khandala', lat: 18.7593, lng: 73.3747, type: 'Town', address: 'Khandala, Maharashtra, India' },
  puri: { title: 'Puri', lat: 19.8135, lng: 85.8312, type: 'City', address: 'Puri, Odisha, India' },
  bengaluru: { title: 'Bengaluru', lat: 12.9716, lng: 77.5946, type: 'City', address: 'Bengaluru, Karnataka, India' },
  kolkata: { title: 'Kolkata', lat: 22.5726, lng: 88.3639, type: 'City', address: 'Kolkata, West Bengal, India' },
  howrahStation: { title: 'Howrah Station', lat: 22.5839, lng: 88.3425, type: 'Train station', address: 'Howrah, West Bengal 711101, India' },
} satisfies Record<string, Place>;

// ---------- frame hashes ----------

const H = {
  m01: '0bdd9709e6be8112', // test-images/m01-kharkiv-prayer.jpg
  m02: '166e7c2677c88b14', // test-images/m02-uttarakhand-flood.jpg
  m03: '57d9ac8d405760a7', // test-images/m03-japan-tsunami-frame.jpg
  m04: '461f23290977b62e', // test-images/m04-kolkata-lathicharge-frame.jpg
  m05: '9c3e61a4f0b7d258',
  m06: 'e1a7c3590d2b6f84',
  m07: '3b84f2c6a19d07e5',
  m08: 'c56d0a8e3f71b942',
  m09: '7a2c9e15d4b8f063',
  m10a: '5e19b7d3a06c48f2',
  m10b: '2d6a84f1c9e357b0',
  m10c: 'b0f3e5297a4d1c86',
  m11: '84d1f6b2a3c9e057',
  m12: '1f7b3d9e5c2a8064',
};

// ---------- cases ----------

const cases: CaseSpec[] = [
  {
    id: 'm01-kharkiv-prayer',
    title: 'People praying in the snow, shared as prayers for Ukraine',
    notes: 'CONSISTENT path: earliest copies are within 48 h of the claim and the scene resolves inside the claimed country. Runs all three tiers.',
    submittedAt: '2022-02-21T02:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m01, sharpness: 740 }],
    claim: { text: 'Ukrainian Christians pray outdoors, in the snow, for their country in this phase of war danger.', place: 'Ukraine', date: '2022-02-20T18:19:00+07:00' },
    llm: {
      parseClaim: { event: 'Christians pray outdoors in the snow', place: 'Ukraine', claimedAt: '2022-02-20T11:19:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [{ name: 'Derzhprom, Kharkiv', confidence: 0.9 }], language: 'none' },
      narrate: {
        summary: 'The earliest copies of this photo appeared a day before the post and show Kharkiv, Ukraine, as claimed.',
        bullets: [
          { text: 'Two independent pages carried the same photo on 19 February 2022.', evidenceIds: ['lens0-0', 'lens0-1'] },
          { text: 'The building in the background was located as Derzhprom in Kharkiv.', evidenceIds: ['maps-scene'] },
        ],
      },
    },
    lens: [[
      { site: 'kharkiv-daily.example', slug: 'city/prayer-in-freedom-square', title: 'Residents gather to pray in Freedom Square', date: 'Feb 19, 2022', hash: H.m01 },
      { site: 'photo-desk.example', slug: 'gallery/kharkiv-prayer', title: 'Kharkiv prayer gathering', date: 'Feb 19, 2022', hash: near(H.m01, 6) },
      { site: 'wallpapers.example', slug: 'winter-park', title: 'Winter park scene', hash: far(H.m01) },
    ]],
    bing: [{ site: 'faith-forum.example', slug: 't/prayers-for-ukraine', title: 'Prayers for Ukraine thread', date: '2022-02-20T09:12:00Z', hash: near(H.m01, 3) }],
    yandex: [{ site: 'ua-news-portal.example', slug: 'kharkiv/prayer', title: 'Kharkiv: people pray for peace', hash: near(H.m01, 4) }],
    news: [{ site: 'world-wire.example', slug: 'ukraine-prayer-day', title: 'Churches across Ukraine call day of prayer amid war fears', iso: '2022-02-20T09:00:00Z', snippet: 'Believers in Ukraine gathered outdoors...' }],
    mapsClaim: PLACES.ukraine,
    mapsScene: { q: 'Derzhprom, Kharkiv', place: PLACES.derzhprom },
    expected: { verdict: 'CONSISTENT', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 80 },
  },
  {
    id: 'm02-uttarakhand-flood',
    title: 'Old flood photo shared as a flash flood in Uttarakhand today',
    notes: 'RECYCLED path, short-circuits after Google Lens: a trusted archive copy is years older than the claim. Costs 1 credit.',
    submittedAt: '2025-08-06T10:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m02, sharpness: 810 }],
    claim: { text: 'Flash flood hits Uttarakhand today, houses washed away', place: 'Uttarakhand, India' },
    llm: {
      parseClaim: { event: 'flash flood washes away houses', place: 'Uttarakhand, India', claimedAt: null, refersToPast: false },
      readScene: { signText: [], landmarks: [], language: 'none' },
      narrate: {
        summary: 'This flood photo was online in June 2013, years before the claimed flood.',
        bullets: [{ text: 'An archive copy is dated 18 June 2013.', evidenceIds: ['lens0-0'] }],
      },
    },
    lens: [[
      { site: 'wire-archive.example', slug: 'photos/2013/himalayan-floods', title: 'Floodwaters sweep through Himalayan town', date: 'Jun 18, 2013', hash: H.m02 },
      { site: 'hill-news.example', slug: '2013/06/floods-kedarnath-valley', title: 'Valley towns hit by floods', date: 'Jun 19, 2013', hash: near(H.m02, 5) },
      { site: 'travel-blog.example', slug: 'monsoon-memories', title: 'Monsoon memories', date: 'Jul 2, 2013', hash: near(H.m02, 8) },
    ]],
    expected: { verdict: 'RECYCLED', flags: { recycled: true, misplaced: false, predatesClaim: true }, credits: 1, tiersRun: [1], confidence: 55 },
  },
  {
    id: 'm03-japan-tsunami-frame',
    title: 'Old tsunami footage shared as waves hitting Japan right now',
    notes: 'RECYCLED video path: Lens confirms an undated copy on the sharpest keyframe (so other keyframes are not searched), then two Bing pages on different domains date it to March 2011. That is decisive, so Yandex is never searched: 2 credits.',
    submittedAt: '2025-07-30T03:00:00.000Z',
    kind: 'video',
    frames: [
      { pHash: H.m03, sharpness: 905, tMs: 4000 },
      { pHash: 'a4c1e97b2f60d835', sharpness: 512, tMs: 11000 },
    ],
    claim: { text: 'Tsunami waves hit Japan coast right now after huge earthquake', place: 'Japan', date: '2025-07-30T11:00:00+09:00' },
    llm: {
      parseClaim: { event: 'tsunami waves hit coast', place: 'Japan', claimedAt: '2025-07-30T02:00:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [], broadcastLogo: 'unknown TV channel', language: 'Japanese' },
      narrate: {
        summary: 'This footage was published in March 2011, long before the claimed tsunami.',
        bullets: [
          { text: 'A forum mirror posted this clip on 11 March 2011.', evidenceIds: ['bing0-0'] },
          { text: 'A second site has a copy from the next day.', evidenceIds: ['bing0-1'] },
        ],
      },
    },
    lens: [[{ site: 'socialclip.example', slug: 'v/tsunami-wave', title: 'Tsunami wave hits harbour', hash: near(H.m03, 2) }], []],
    bing: [
      { site: 'forum-mirror.example', slug: 'threads/tsunami-2011-video', title: 'Tsunami video from Miyako', date: '2011-03-11T07:40:00Z', hash: near(H.m03, 4) },
      { site: 'regional-daily.example', slug: '2011/03/12/tsunami-footage', title: 'Footage shows tsunami reaching the coast', date: '2011-03-12T22:15:00Z', hash: near(H.m03, 7) },
    ],
    yandex: [{ site: 'clip-archive.example', slug: 'tsunami-miyako', title: 'Tsunami reaching the coast', hash: near(H.m03, 6) }],
    expected: { verdict: 'RECYCLED', flags: { recycled: true, misplaced: false, predatesClaim: true }, credits: 2, tiersRun: [1, 2], confidence: 60 },
  },
  {
    id: 'm04-kolkata-lathicharge',
    title: 'Old police lathi-charge video shared as a recent incident in Bengal',
    notes: 'RECYCLED video path, short-circuits after Lens: three confirmed copies from 2020, one from a trusted archive.',
    submittedAt: '2025-07-20T08:00:00.000Z',
    kind: 'video',
    frames: [{ pHash: H.m04, sharpness: 640, tMs: 6000 }],
    claim: { text: 'बंगाल में ममता सरकार के आदेशानुसार कावड़ियों पर प्रेम बरसाती पुलिस', place: 'West Bengal, India', date: '2025-07-20T12:00:00+05:30' },
    llm: {
      parseClaim: { event: 'police beat kanwariyas on state government orders', place: 'West Bengal, India', claimedAt: '2025-07-20T06:30:00.000Z', refersToPast: false },
      readScene: { signText: ['बंगाल में ममता सरकार के आदेशानुसार'], landmarks: [], language: 'Hindi' },
      narrate: {
        summary: 'This video was online in October 2020, years before the claimed incident.',
        bullets: [{ text: 'An archive copy of the video is dated 26 October 2020.', evidenceIds: ['lens0-0'] }],
      },
    },
    lens: [[
      { site: 'wire-archive.example', slug: 'video/2020/10/kolkata-crowd-control', title: 'Police disperse crowd in Kolkata', date: 'Oct 26, 2020', hash: near(H.m04, 2) },
      { site: 'regional-daily.example', slug: '2020/10/26/kolkata-police-video', title: 'Video of police action goes viral', date: 'Oct 26, 2020', hash: H.m04 },
      { site: 'video-mirror.example', slug: 'watch/police-lathicharge', title: 'Police lathicharge video', date: 'Oct 27, 2020', hash: near(H.m04, 9) },
    ]],
    expected: { verdict: 'RECYCLED', flags: { recycled: true, misplaced: false, predatesClaim: true }, credits: 1, tiersRun: [1], confidence: 55 },
  },
  {
    id: 'm05-recycled-trusted-single',
    title: 'Old factory fire photo, found once in a trusted archive',
    notes: 'RECYCLED path decided by a single trusted-archive match, which is enough on its own for T₀ and the decisive rule.',
    submittedAt: '2026-03-10T16:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m05, sharpness: 700 }],
    claim: { text: 'Massive fire at chemical factory in Surat tonight', place: 'Surat, Gujarat, India', date: '2026-03-10T21:00:00+05:30' },
    llm: {
      parseClaim: { event: 'fire at chemical factory', place: 'Surat, Gujarat, India', claimedAt: '2026-03-10T15:30:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [], language: 'none' },
    },
    lens: [[{ site: 'wire-archive.example', slug: 'photos/2021/01/industrial-fire', title: 'Fire engulfs industrial unit', date: 'Jan 5, 2021', hash: near(H.m05, 1) }]],
    expected: { verdict: 'RECYCLED', flags: { recycled: true, misplaced: false, predatesClaim: true }, credits: 1, tiersRun: [1], confidence: 25 },
  },
  {
    id: 'm06-misplaced-with-match',
    title: 'Fresh port fire photo from Jeddah captioned as Dubai',
    notes: 'MISPLACED path with confirmed same-day matches: the scene landmark resolves ~1,700 km from the claimed city.',
    submittedAt: '2026-09-17T15:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m06, sharpness: 820 }],
    claim: { text: 'Drone strike on port facilities in Dubai tonight', place: 'Dubai, UAE', date: '2026-09-17T20:00:00+05:30' },
    llm: {
      parseClaim: { event: 'drone strike on port facilities', place: 'Dubai, UAE', claimedAt: '2026-09-17T14:30:00.000Z', refersToPast: false },
      readScene: { signText: ['ميناء جدة الإسلامي', 'Jeddah Islamic Port'], landmarks: [{ name: 'Jeddah Islamic Port', confidence: 0.93 }], language: 'Arabic' },
      narrate: {
        summary: 'This photo is recent, but it shows Jeddah Islamic Port in Saudi Arabia, not Dubai.',
        bullets: [
          { text: 'Signage in the photo reads "Jeddah Islamic Port".', evidenceIds: ['maps-scene'] },
          { text: 'Copies posted today describe a fire at a Red Sea port.', evidenceIds: ['lens0-0'] },
        ],
      },
    },
    lens: [[
      { site: 'gulf-social.example', slug: 'posts/port-fire', title: 'Fire at Red Sea port tonight', date: 'Sep 17, 2026', hash: near(H.m06, 2) },
      { site: 'regional-daily.example', slug: '2026/09/17/port-blaze', title: 'Blaze reported at port', date: 'Sep 17, 2026', hash: near(H.m06, 5) },
    ]],
    bing: [],
    yandex: [],
    news: [{ site: 'gulf-wire.example', slug: 'jeddah-port-fire', title: 'Fire reported at Jeddah Islamic Port', iso: '2026-09-17T13:00:00Z', snippet: 'Civil defence teams responded to a fire at the port in Jeddah...' }],
    mapsClaim: PLACES.dubai,
    mapsScene: { q: 'Jeddah Islamic Port', place: PLACES.jeddahPort },
    expected: { verdict: 'MISPLACED', flags: { recycled: false, misplaced: true, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 40 },
  },
  {
    id: 'm07-misplaced-no-match',
    title: 'Kolkata bridge photo with no prior copies, captioned as Mumbai',
    notes: 'MISPLACED path with no visual match at all: absence of a match does not block the location check.',
    submittedAt: '2026-07-02T06:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m07, sharpness: 690 }],
    claim: { text: 'Heavy rain floods the road near the bridge in Mumbai', place: 'Mumbai, India', date: '2026-07-02T10:00:00+05:30' },
    llm: {
      parseClaim: { event: 'heavy rain floods road near bridge', place: 'Mumbai, India', claimedAt: '2026-07-02T04:30:00.000Z', refersToPast: false },
      readScene: { signText: ['Howrah'], landmarks: [{ name: 'Howrah Bridge', confidence: 0.95 }], language: 'Bengali' },
      narrate: {
        summary: 'No earlier copy was found, but the bridge in the photo is Howrah Bridge in Kolkata, not Mumbai.',
        bullets: [{ text: 'The landmark resolves to Howrah Bridge, Kolkata.', evidenceIds: ['maps-scene'] }],
      },
    },
    lens: [[]],
    bing: [],
    yandex: [],
    news: [{ site: 'metro-news.example', slug: 'mumbai-rain-waterlogging', title: 'Mumbai rain: waterlogging reported on several roads', iso: '2026-07-02T03:00:00Z', snippet: 'Heavy overnight rain in Mumbai...' }],
    mapsClaim: PLACES.mumbai,
    mapsScene: { q: 'Howrah Bridge', place: PLACES.howrahBridge },
    expected: { verdict: 'MISPLACED', flags: { recycled: false, misplaced: true, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 20 },
  },
  {
    id: 'm08-consistent-fresh',
    title: 'Fresh hailstorm photo from Shimla, correctly captioned',
    notes: 'CONSISTENT path with High confidence: same-day copies on two indexes, landmark and news both agree.',
    submittedAt: '2026-02-02T12:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m08, sharpness: 760 }],
    claim: { text: 'Hailstorm covers the streets of Shimla white this afternoon', place: 'Shimla, Himachal Pradesh, India', date: '2026-02-02T16:00:00+05:30' },
    llm: {
      parseClaim: { event: 'hailstorm covers streets', place: 'Shimla, Himachal Pradesh, India', claimedAt: '2026-02-02T10:30:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [{ name: 'The Ridge, Shimla', confidence: 0.86 }], language: 'none' },
      narrate: {
        summary: 'The earliest copies of this photo are from the same day, and it shows The Ridge in Shimla, as claimed.',
        bullets: [
          { text: 'Copies appeared on 2 February 2026 on two independent indexes.', evidenceIds: ['lens0-0', 'bing0-0'] },
          { text: 'News reports a hailstorm in Shimla that day.', evidenceIds: ['news-0'] },
        ],
      },
    },
    lens: [[
      { site: 'hill-news.example', slug: '2026/02/02/shimla-hailstorm', title: 'Hailstorm turns Shimla white', date: 'Feb 2, 2026', hash: H.m08 },
      { site: 'regional-daily.example', slug: 'weather/shimla-hail', title: 'Shimla hail pictures', date: 'Feb 2, 2026', hash: near(H.m08, 4) },
    ]],
    bing: [{ site: 'snapshare.example', slug: 'p/ridge-hail', title: 'The Ridge after hail', date: '2026-02-02T11:05:00Z', hash: near(H.m08, 3) }],
    yandex: [],
    news: [{ site: 'hill-news.example', slug: 'shimla-hailstorm-traffic', title: 'Hailstorm lashes Shimla, traffic slows', iso: '2026-02-02T09:00:00Z', snippet: 'A sudden hailstorm in Shimla...' }],
    mapsClaim: PLACES.shimla,
    mapsScene: { q: 'The Ridge, Shimla', place: PLACES.theRidge },
    expected: { verdict: 'CONSISTENT', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 80 },
  },
  {
    id: 'm09-context-plausible',
    title: 'Landslide photo with no prior copy, event confirmed by news',
    notes: 'CONTEXT_PLAUSIBLE path: only similar (unconfirmed) results, but news corroborates the claimed event, place and date.',
    submittedAt: '2026-07-14T05:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m09, sharpness: 600 }],
    claim: { text: 'Landslide blocks the expressway near Khandala this morning', place: 'Khandala, Maharashtra, India', date: '2026-07-14T09:00:00+05:30' },
    llm: {
      parseClaim: { event: 'landslide blocks expressway', place: 'Khandala, Maharashtra, India', claimedAt: '2026-07-14T03:30:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [], language: 'none' },
      narrate: {
        summary: 'News confirms a landslide near Khandala this morning, but no earlier copy of this photo was found to prove where it came from.',
        bullets: [{ text: 'A news report describes the landslide near Khandala.', evidenceIds: ['news-0'] }],
      },
    },
    lens: [[
      { site: 'stock-photos.example', slug: 'landslide-road', title: 'Landslide on mountain road', date: 'May 3, 2019', hash: far(H.m09) },
      { site: 'geo-blog.example', slug: 'monsoon-landslides', title: 'Why monsoon landslides happen', hash: near(far(H.m09), 3) },
    ]],
    bing: [],
    yandex: [{ site: 'photo-forum.example', slug: 'rockfall', title: 'Rockfall', hash: near(H.m09, 20) }],
    news: [{ site: 'metro-news.example', slug: 'khandala-landslide-expressway', title: 'Landslide near Khandala disrupts expressway traffic', iso: '2026-07-14T02:45:00Z', snippet: 'Traffic was halted near Khandala after...' }],
    mapsClaim: PLACES.khandala,
    expected: { verdict: 'CONTEXT_PLAUSIBLE', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 5, tiersRun: [1, 2, 3], confidence: 10 },
  },
  {
    id: 'm10-context-plausible-video',
    title: 'Cyclone video with three keyframes and no prior copies',
    notes: 'CONTEXT_PLAUSIBLE video path: Lens runs on all 3 keyframes, so the credit cap leaves room only for News; Maps and YouTube are skipped.',
    submittedAt: '2026-05-25T13:00:00.000Z',
    kind: 'video',
    frames: [
      { pHash: H.m10a, sharpness: 450, tMs: 2000 },
      { pHash: H.m10b, sharpness: 880, tMs: 9000 },
      { pHash: H.m10c, sharpness: 610, tMs: 15000 },
    ],
    claim: { text: 'Cyclone winds uproot trees along the beach road in Puri', place: 'Puri, Odisha, India', date: '2026-05-25T18:00:00+05:30' },
    llm: {
      parseClaim: { event: 'cyclone winds uproot trees', place: 'Puri, Odisha, India', claimedAt: '2026-05-25T12:30:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [], language: 'none' },
    },
    lens: [[], [], []],
    bing: [],
    yandex: [],
    news: [{ site: 'east-coast-times.example', slug: 'cyclone-landfall-puri', title: 'Cyclone makes landfall near Puri, trees uprooted', iso: '2026-05-25T11:00:00Z', snippet: 'Strong winds lashed Puri...' }],
    expected: { verdict: 'CONTEXT_PLAUSIBLE', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 10 },
  },
  {
    id: 'm11-unverified-nothing',
    title: 'Leopard photo with no matches and no news',
    notes: 'UNVERIFIED path: nothing found anywhere. No recorded narration, so the template narrative is used.',
    submittedAt: '2026-06-03T03:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m11, sharpness: 530 }],
    claim: { text: 'Leopard spotted inside a Bengaluru tech park this morning', place: 'Bengaluru, Karnataka, India', date: '2026-06-03T08:00:00+05:30' },
    llm: {
      parseClaim: { event: 'leopard spotted inside tech park', place: 'Bengaluru, Karnataka, India', claimedAt: '2026-06-03T02:30:00.000Z', refersToPast: false },
      readScene: { signText: [], landmarks: [], language: 'none' },
    },
    lens: [[]],
    bing: [],
    yandex: [],
    news: [],
    mapsClaim: PLACES.bengaluru,
    expected: { verdict: 'UNVERIFIED', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 5, tiersRun: [1, 2, 3], confidence: 0 },
  },
  {
    id: 'm12-unverified-similar-only',
    title: 'Crowd photo with only look-alike results from years ago',
    notes: 'UNVERIFIED path: old but unconfirmed look-alikes never feed T₀. The scene landmark is only 0.6 confident, so the text read off the sign is what Maps is asked about; it resolves inside the claimed city, so the location agrees and the verdict still turns on the missing matches.',
    submittedAt: '2026-04-11T14:00:00.000Z',
    kind: 'image',
    frames: [{ pHash: H.m12, sharpness: 570 }],
    claim: { text: 'Huge crowd gathers at the Kolkata station after train cancellations', place: 'Kolkata, West Bengal, India', date: '2026-04-11T19:00:00+05:30' },
    llm: {
      parseClaim: { event: 'crowd gathers at station after train cancellations', place: 'Kolkata, West Bengal, India', claimedAt: '2026-04-11T13:30:00.000Z', refersToPast: false },
      readScene: { signText: ['Howrah'], landmarks: [{ name: 'Howrah Station', confidence: 0.6 }], language: 'Bengali' },
      narrate: {
        summary: 'Not enough evidence was found to confirm or reject this claim.',
        bullets: [{ text: 'Only look-alike photos from other events were found.', evidenceIds: ['lens0-0'] }],
      },
    },
    lens: [[
      { site: 'rail-fans.example', slug: '2019/station-rush', title: 'Station rush hour', date: 'Aug 14, 2019', hash: near(H.m12, 14) },
      { site: 'regional-daily.example', slug: '2021/03/station-crowd', title: 'Crowds at station', date: 'Mar 2, 2021', hash: near(H.m12, 22) },
    ]],
    bing: [{ site: 'photo-forum.example', slug: 'crowd-platform', title: 'Crowded platform', date: '2018-11-09T15:30:00Z', hash: near(H.m12, 18) }],
    yandex: [],
    news: [{ site: 'metro-news.example', slug: '2023-train-cancellations', title: 'Train cancellations leave passengers stranded in Kolkata', iso: '2023-12-01T10:00:00Z', snippet: 'Passengers in Kolkata...' }],
    mapsClaim: PLACES.kolkata,
    mapsScene: { q: 'Howrah', place: PLACES.howrahStation },
    expected: { verdict: 'UNVERIFIED', flags: { recycled: false, misplaced: false, predatesClaim: false }, credits: 6, tiersRun: [1, 2, 3], confidence: 10 },
  },
];

for (const c of cases) writeCase(c);
writeFileSync(
  path.join(OUT, 'trusted-domains.json'),
  JSON.stringify(['wire-archive.example', 'world-wire.example'], null, 2) + '\n',
);
console.log(`Wrote ${cases.length} synthetic cases to ${OUT}`);
