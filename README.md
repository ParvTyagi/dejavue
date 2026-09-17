# DejaVue

DejaVue checks whether a viral image or video is really from where and when it claims. It uses SerpApi's search engines as a timestamped archive of the web to find where the media appeared first, then judges the claim with deterministic rules and shows every piece of evidence behind the verdict.

It also checks the text scams people act on fastest: **fake job offers, government scheme messages and customer-care numbers** (see [Offer Check](#offer-check) and [docs/OFFER_CHECK.md](docs/OFFER_CHECK.md)).

Built for the SerpApi India Hackathon 2026 (Knowledge & Public Interest track). The full design is in [docs/DESIGN.md](docs/DESIGN.md).

## Run it locally

```bash
npm install
cp .env.example .env.local   # FIXTURE_MODE=replay needs no keys
npm run dev                  # http://localhost:3000
```

Replay mode runs the whole pipeline on recorded search results and uses **zero SerpApi credits**. Pick a demo case on `/check` (photos) or `/check?type=offer` (messages) to watch a check stream in. Each replayed search waits about 0.7 s (`REPLAY_PACE_MS`) so the live view can be seen and recorded; set it to 0 for instant results.

```bash
npm test            # 12 media and 6 offer golden cases, failure scenarios, extraction and pHash checks
npm run test:live   # real SerpApi + Gemini checks; spends about 8 searches
npm run typecheck
npm run build
```

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `RECYCLED` | A confirmed copy was online more than 48 hours before the claimed date |
| `MISPLACED` | The scene resolves too far from the claimed place (50 km city, 300 km region, country boundary) |
| `CONSISTENT` | The earliest confirmed copies match the claimed time, and the scene was located close to the claimed place |
| `CONTEXT_PLAUSIBLE` | No earlier copy, but news corroborates the claimed event |
| `UNVERIFIED` | Not enough evidence. Finding nothing never counts as proof of authenticity |

Confidence (0–100) is additive over the evidence and capped per verdict. The dossier lists every point.

## How SerpApi is used

Searches escalate in tiers and stop as soon as the evidence is decisive, so recycled media usually costs 1 search and the hardest case costs at most 6.

| Tier | Engine | Question it answers |
| --- | --- | --- |
| 1 | Google Lens (exact matches) | Has this exact image been published before? |
| 2 | Bing Reverse Image, Yandex Images | Do independent indexes agree, or know older copies? |
| 3 | Google News | Did the claimed event happen at that time and place? |
| 3 | Google Maps | Where are the claimed place and the landmark in the scene? |
| 3 | YouTube | Was this footage uploaded earlier? (video, or a broadcast logo) |
| 3 | Google Search (date-restricted) | When was an undated matching page published? |

A search result only counts as a visual match after DejaVue re-hashes its thumbnail and finds it within Hamming distance 10 of the input (64-bit DCT pHash). Gemini only parses the claim, reads scene text and writes the explanation. It never decides the verdict, and all its output is schema-checked with fallbacks.

## Offer Check

Paste a message or upload a screenshot. Phones, emails, links, amounts and payment requests are found by patterns, and Gemini only reads the screenshot and names the organisation; anything it quotes must appear in the message word for word. Searches stop as soon as the message is clearly a scam.

| Step | Engine | Question it answers |
| --- | --- | --- |
| 1 | Google Search | What are the organisation's official websites? (the knowledge graph when Google shows one, else results whose domain carries the name, e.g. `sbi.bank.in` and `sbi.co.in`) |
| 2 | Google Search | Is this phone number, email or site reported as a scam on 2+ sites? |
| 3 | Google Jobs (`location=India`) | Does the company really list this job? |
| 3 | Google Search (`site:gov.in`) | Is the scheme on a government website? |
| 3 | Google Search (`site:` the official domain) | Does the official website list this helpline number? |

| Verdict | Meaning |
| --- | --- |
| `LIKELY_SCAM` | A strong sign (asks for money, look-alike website, contact reported on 2+ sites) or two medium signs (personal email, chat-only contact, unofficial link) |
| `NO_RED_FLAGS` | Official site found, the listing or a contact confirmed on it, and no warning signs. Never "genuine": capped below High confidence |
| `UNVERIFIED` | Everything else, including when no official site is found |

The six offer demo cases in `fixtures/offers/` are synthetic, like the media ones. `npm run test:live` runs four real checks against SerpApi and Gemini (about 8 searches) with keys from `.env.local`; set `LIVE_DUMP_DIR` to save the raw responses.

## Modes

| `FIXTURE_MODE` | Behaviour |
| --- | --- |
| `replay` (default) | Reads `fixtures/<case>/`. Never calls SerpApi or Gemini |
| `record` | Calls SerpApi for real and saves scrubbed responses as fixtures |
| `live` | Calls SerpApi with a 24 h query cache, media cache and credit ledger |

The home page is prerendered at build time, so its demo cases and the mode badge in the header reflect `FIXTURE_MODE` as it was when you ran `npm run build`. Rebuild after changing it. (On Vercel, changing an environment variable already needs a redeploy.) The API always reads the current value.

Live mode needs `SERPAPI_API_KEY`, `GEMINI_API_KEY` and Supabase Storage for temporary frames. It refuses new audits when fewer than 20 of `MONTHLY_CREDIT_LIMIT` searches remain.

## Caching and storage

| Cache | Kept for | Saves |
| --- | --- | --- |
| SerpApi query cache | 24 h (Google Maps: 30 days, since places don't move) | Paying twice for the same search |
| Media cache (near-identical photo, by pHash) | 7 days | Lens, Bing and Yandex searches, which depend only on the image. A hit reuses them for free and searches only the reverse-image engines still missing. Claim searches (News, Maps, YouTube, dated Search) always run for the new claim, so the verdict is judged fairly. Partial or failed audits are never cached |
| Finished dossiers | 7 days | Reloading a result link |
| Credit ledger | Per calendar month | Enforcing the monthly search budget |

Storage is chosen automatically. With `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set, it uses Upstash Redis, which serverless hosts such as Vercel need because their local files are wiped. Without them, it uses a local SQLite file in `data/`.

## Deploy to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js; Node 22 is picked up from `engines`).
2. In the project, open **Storage → Create → Upstash → Redis** and connect it. This adds the Redis variables that DejaVue needs on Vercel: live progress, caches, saved results and the rate limit are shared through Redis, because each serverless instance has its own memory and a wiped file system.
3. Add environment variables:
   - `FIXTURE_MODE=replay` for a public demo that never spends SerpApi credits
   - `DOSSIER_HMAC_SECRET` (any long random string)
   - optional `REPLAY_PACE_MS` (default 700)
   - only for live mode: `SERPAPI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` and the `SUPABASE_*` variables
4. Deploy.

How it fits serverless: `POST /api/investigate` answers immediately and finishes the audit with Next.js `after()` (up to 60 s). Every audit event is appended to Redis, and `GET /api/investigate/:id/stream` follows that log from any instance, closing before the time limit so the browser reconnects and resumes from `Last-Event-ID`. The demo fixtures are bundled with the functions through `outputFileTracingIncludes`. Without Redis, a deployment falls back to per-instance storage in `/tmp`, where live progress can miss instances.

## About the fixtures

**The 12 golden cases are currently synthetic.** They are hand-written in SerpApi's response format so the app and tests run without spending credits. Outlets use reserved `.example` domains, and the scenarios are invented. They are not claims about what real publishers printed or when the real images first appeared. Frame hashes for c1, c2, c3 and c6 come from local test images, which are not committed. The cases are generated by `npm run fixtures:author` and should be replaced with recorded responses (`FIXTURE_MODE=record`) once credits are set aside for it. Response field names for Bing and Yandex in particular must be checked against real recordings.

## Project layout

```
app/                 pages and API routes (investigate, offer, SSE stream, upload, verify, quota)
components/          audit UI: progress, verdict, timeline, map, evidence
lib/orchestrator/    runAudit: tiered escalation, judging, narration
lib/offer/           runOfferCheck: extraction, reading, domain checks, rules and score
lib/serp/            SerpApi client (replay, cache, budget, ledger), engines, normalizer
lib/evidence/        dates and first-seen T₀, geo and ΔS, match confirmation
lib/verdict/         pure verdict rules and score
lib/llm/             Gemini calls with validation and fallbacks
lib/media/           pHash and keyframe scoring (shared by browser and server)
lib/store/           SQLite (node:sqlite) and in-memory stores
fixtures/            golden cases (offers/ for message checks)
tests/               tests at the runAudit seam, plus pHash
```

## Differences from the design doc

- Node's built-in `node:sqlite` instead of `better-sqlite3` + Drizzle (no native build step; needs Node ≥ 22.13).
- Supabase Storage instead of Cloudflare R2 for temporary frames.
- Plain Tailwind components instead of shadcn/ui, and React state instead of Zustand.
- Keyframes are extracted with `<video>` seeking on the main thread, not WebCodecs in a worker.
- Fixtures are stored per case as `serp.json`, `llm.json` and `thumbs.json` (hashes only) rather than one file per request.
- Not built yet: Google Trends, Playwright UI test, ESLint/Prettier/Husky and the gitleaks pre-commit hook.
- Extra error code `TIMED_OUT` (504) when the reverse-image search cannot finish before the audit deadline.
