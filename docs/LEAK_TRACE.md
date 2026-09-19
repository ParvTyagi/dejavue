# Leak trace — v1

2026-09-19

DejaVue checks whether a photo is recycled and whether an offer is a scam. Leak trace extends it to the third thing that spreads fastest: **a leaked document shared as an image** — a photo of an internal memo, a screenshot of a payroll sheet, an admissions list. The same principle holds: AI reads, SerpApi gathers evidence, fixed rules decide.

It answers three questions:

1. Is this actually an old leak being reshared as new?
2. Where and when did public copies appear?
3. Which public copy looks closest to an undegraded original?

## 1. The one thing it will not do

**It never identifies, names or suggests a person or account as the leaker.** Not in a verdict, not in a narrative, not in a hint.

That is not caution for its own sake. The earliest copy a search engine can see is almost always a repost of something first shared in a closed channel — a WhatsApp group, a Telegram channel, an email thread — and none of those are indexed. Naming whoever posted the earliest *public* copy would name the wrong person with the full confidence of a machine, and the people in leaked documents are already the ones being harmed.

So the output is always worded as **"earliest public appearance found"**, never "leaked by", and three things enforce it:

- No verdict, flag or score in `lib/leak/` can express a statement about a person.
- The model's narrative is discarded whenever it names or implies one (`NAMES_A_LEAKER` in `lib/llm/safe.ts`), and the deterministic template is printed instead.
- Every result carries two fixed lines, whatever the verdict:
  - *DejaVue finds where public copies appeared. It cannot identify who leaked it.*
  - *Search engines do not cover private groups, Telegram or dark web forums.*

## 2. Input

`/check` gets a third option: **Photo / Video** | **Message / Offer** | **Leaked document**, kept in the URL (`/check?type=leak`). The form posts to `/api/leak`; progress streams from the same `/api/investigate/:id/stream` as everything else, under the same rate limit and the same credit ledger.

- A screenshot or photo, re-encoded in the browser at up to 2048 px (small print stays readable) and fingerprinted there with the same pHash the server uses.
- What the post claims, in the user's words, plus an optional organisation and an optional date.
- The organisation is **shown with the result and never searched**. A blank date field is left blank: nothing is assumed from it.

## 3. Pipeline (`lib/leak/pipeline.ts`)

**Step 0 — read (0 credits).** `parseClaim` for the date and whether the post asserts recency; `readScene` for what the document says. The scene reading is kept only as up to three redacted snippets of 80 characters, and it is never written to the media cache.

**Step 1 — public copies (1–3 credits).** Google Lens `exact_matches`, then Bing `pages_with_this_image`, then Yandex `image_results`, on the sharpest frame. Every result is re-hashed from its thumbnail and only counts as a copy within Hamming 10.

Unlike a media audit, a leak trace **does not stop early** when the evidence turns decisive. The spread of copies is the answer here, so every index the budget allows is searched.

**Step 2 — date the undated (0–2 credits).** For up to two confirmed copies that arrived without a date, a dated Google search on that result's own page title, narrowed to before the claimed date. If the same site comes back dated, the copy joins the timeline.

**Step 3 — compare the copies (0 credits).** Up to 8 full-size images, fetched through the existing SSRF guard with a 15 MB cap and a timeout clamped to what is left of the 25 s deadline. These are image downloads, not searches; they are counted separately and every skip is recorded with a reason, exactly as a skipped search is.

Budget: 6 searches. Caches, ledger, deadline, SSE and the HMAC-signed dossier are the media pipeline's, unchanged.

## 4. Verdicts (`lib/leak/rules.ts`, pure)

| Verdict | When | Cap |
| --- | --- | --- |
| `LEAK_RECYCLED` | A corroborated T₀ predates the claimed date by more than 48 h, the claim asserts a date or recency, and it does not acknowledge the older leak | 99 |
| `LEAK_EARLIEST_FOUND` | A corroborated T₀ exists and does not contradict the claim | 85 |
| `LEAK_NOT_FOUND` | No corroborated T₀ | 40 |

`decideLeak()` reuses `claimAssertsDate` and `claimRefersToOriginal` from the media rules, so the same separation holds: `predatesClaim` is a fact about the evidence, `recycled` is the accusation, and a blank date field can only ever produce the fact.

**Copies found but undated.** There is no fourth verdict for it. The trace returns `LEAK_NOT_FOUND` with `undatedOnly` set, and the page says so in as many words — a second stamp reading *Copies found, none dated*, and a summary that states the copies exist and that nothing dates them. Inventing a date for a leak timeline is exactly the error this feature must not make.

Scoring is additive with labelled reasons, reusing the media score's wording. The only new reason is *All three reverse-image indexes were searched and found nothing*, worth 20, which is the only thing that can raise a `LEAK_NOT_FOUND`: confidence in a negative rests entirely on how completely we looked.

## 5. Spread timeline (`lib/leak/timeline.ts`, pure)

Confirmed copies only, each with its date, date-trust level, domain, engine and evidence id, earliest first, T₀ marked. Copies with no usable date go into a separate **Date unknown** group rather than onto the axis. Entries stream as `timeline` SSE events the moment each copy is confirmed, so the page fills while the searches run.

## 6. Closest to the original (`lib/leak/rank.ts`, display hint only)

For each fetched copy: pixel dimensions, estimated JPEG quality from the quantisation tables (`lib/leak/jpeg.ts`, skipped for other formats), and crop coverage — how much of the scene it shows, measured by aligning it against the copy that shows the most, both ways round, so a copy that shows *more* than the largest file is measured too.

The top copy is shown as *likely closest to the original* with the reasons it leads on: largest resolution, least compressed, least cropped.

**This never reaches `decideLeak()` or `scoreLeak()`.** A large clean copy can be posted years after a small cropped one; pixels say what a copy has been through, not when it appeared. The panel says so on the page.

Thumbnails are never measured — every engine resizes and re-encodes them, so they would measure the engine. Only an engine-supplied original URL is fetched: Bing's `original`, Yandex's `original_image.link`. Google Lens documents no full-size link for an exact match, only `actual_image_width` / `actual_image_height`, so its copies are recorded as skipped with that reason. Decoded pixels live in memory for one measurement and are dropped; nothing is stored.

## 7. Privacy

- Nothing read from the document is ever sent to a search engine. The only query built from text is the dating search, and it uses a public search result's own page title, scrubbed through `scrubQuery()` even so; if scrubbing leaves nothing meaningful, the search is skipped rather than sent.
- The dossier keeps up to three redacted 80-character snippets of the document's text, and nothing more of it.
- The shareable card redacts phone numbers, emails and id-like numbers from the quoted claim, through the same `redactPersonalData()` the offer card uses. Dates written with dashes survive it, since every result here is built around dates.
- The reverse-image evidence is cached for later checks of the same image, as media audits do. The scene reading is deliberately not.

## 8. Tests

All replay, zero credits (`npm test`):

- `tests/leak-golden.test.ts` — six authored cases on reserved `.example` domains: one per verdict, a blank date field with an older copy (must not be `LEAK_RECYCLED`), undated copies only, a credit cap that stops the third index. Each asserts verdict, flags, credits, steps, confidence and byte-identical reruns, plus engine-down and deadline scenarios.
- `tests/leak-rules.test.ts` — `decideLeak()` and `scoreLeak()`.
- `tests/leak-timeline.test.ts` — ordering, T₀ marking, the undated group, implausible dates.
- `tests/leak-rank.test.ts` — quantisation-table quality against images saved at known qualities, crop coverage, and the ranking over generated resize / recompress / crop variants of one source, which must rank the source first.
- `tests/leak-guards.test.ts` — the narrative guard, the share card's redaction, and that no query carries anything from the document.

Fixtures, including the small stand-in document images, are generated by `npm run fixtures:leaks`.
