# SerpApi engine inputs: Lens dates, Bing/Yandex by image URL, cache credits

Research for [#3](https://github.com/ParvTyagi/dejavue/issues/3) (map [#2](https://github.com/ParvTyagi/dejavue/issues/2)).
Read on 2026-09-17 from serpapi.com documentation pages and the sample JSON on them. No API calls, no credits spent.
Sample counts below come from the docs' example responses, which are truncated with `...`. They show which fields exist, not how often those fields appear in live traffic.

## TL;DR

- **Lens dates exist but are weak.** `google_lens` with `type=exact_matches` returns `exact_matches[].date`. It is documented as "Date posted of the match result", but the samples show it as a **relative string** ("2 years ago"), and it appears in only **2 of 6** sample matches. `visual_matches` (the default `type=all` output) has **no date field**.
- **Bing takes a URL and returns ISO dates.** `engine=bing_reverse_image` with `image_url` (required). The image must be 4,000 px or less on each side. `pages_with_this_image[].date` and `related_content[].date` are ISO 8601, and every sample item has one (4 of 4 in the main example, 3 of 3 in the cropped-search example).
- **Yandex takes a URL but gives no dates.** `engine=yandex_images` with `url` (and optionally `tab=about|similar`, `crop`). No response field on either Yandex doc page carries a date.
- **Cached searches are free.** The docs say so: "Cached searches are free, and are not counted towards your searches per month." The SerpApi cache lasts **1 hour** and is served **only when every parameter is exactly the same**. Errored and failed searches also don't count, but empty result sets **do** count as 1.
- **None of the three docs sets a limit on URL length, query strings or content type.** Bing's pixel limit is the only input constraint documented. Presigned R2/S3 URLs carry `&`-separated query strings, and the docs neither confirm nor rule them out. This needs a live test.

## 1. Google Lens (`google_lens`)

Source: <https://serpapi.com/google-lens-api>, <https://serpapi.com/google-lens-exact-matches-api>, <https://serpapi.com/google-lens-about-this-image-api>, <https://serpapi.com/google-lens-upload-an-image>, <https://serpapi.com/image-api>

**Parameters**

| Param | Notes (from docs) |
| --- | --- |
| `engine=google_lens` | required |
| `url` | "URL of an image to perform the Google Lens search". Required unless `image_id` is given |
| `image_id` | from the Image API upload (`POST https://serpapi.com/image`, multipart field `image`). JPG/PNG/WebP, **max 500 KB**, **id expires after 10 minutes** |
| `type` | `all` (default), `about_this_image`, `products`, `exact_matches`, `visual_matches` |
| `q` | only with `all`, `visual_matches`, `products` |
| `hl`, `country`, `safe`, `auto_crop` | optional. `auto_crop` does not work with `about_this_image` |
| `no_cache`, `async`, `output` (`json`/`html`/`md`), `json_restrictor`, `zero_trace` | standard SerpApi params |

**Where dates live**

| `type` | Array | Date field | Format in samples | Sample frequency |
| --- | --- | --- | --- | --- |
| `exact_matches` | `exact_matches[]` | `date`: "Date posted of the match result" | relative, e.g. `"2 years ago"` | Danny DeVito example: 2 of 3. Desk (product) example: 0 of 3. **Total 2 of 6** |
| `all` / `visual_matches` | `visual_matches[]` | **none** (only `exact_matches: true` + `serpapi_exact_matches_link`) | n/a | 0 |
| `all` | `organic_results[]` (only on "some searches") | `date`, `sitelinks.list[].date` | absolute, `"Nov 13, 2024"` (sitelinks only in sample). `displayed_link` may hold "10 years ago" | organic `date`: 0 of 3. Sitelink dates: 2 |
| `about_this_image` | `about_this_image.sections[].page_results[]` | `date`: "Date of the page that has the image" | absolute, `"Jun 28, 2025"` | 3 of 3 |

Other `exact_matches[]` fields: `position, title, source, source_icon, link, thumbnail, actual_image_width, actual_image_height`, plus `price, extracted_price, in_stock, out_of_stock` for products. **Exact matches have no `snippet`.**

Notes:
- With `type=all`, exact matches arrive only as a flag plus a follow-up link. To get the list in one search (1 credit), call `type=exact_matches` directly.
- `about_this_image` has a header with an age hint, e.g. `"title": "Similar images are at least 10 years old"`, and absolute page dates. The sample dates don't look like first-publish dates: the Wikipedia page about a 1973 TV show is dated Jun 28, 2025. They are probably last-updated dates. Using this type costs a separate search.

## 2. Bing Reverse Image (`bing_reverse_image`)

Source: <https://serpapi.com/bing-reverse-image-api>

**Parameters**

| Param | Notes (from docs) |
| --- | --- |
| `engine=bing_reverse_image` | required |
| `image_url` | **required**. "NOTE: The image's width and height must each be 4,000 pixels or less." |
| `mkt` | market, e.g. `en-US` (docs encourage always setting it) |
| `cat`, `cal`, `car`, `cab` | crop fractions 0–1 |
| `count` | default 35, 0–150, "only a suggestion" |
| `next_page_token` | pagination |
| `no_cache`, `async`, `output`, `json_restrictor`, `zero_trace` | standard. There is no full HTML output, text only |

**Result arrays and dates**

| Array | Meaning | Date field | Sample frequency |
| --- | --- | --- | --- |
| `pages_with_this_image[]` | pages carrying this image (the closest thing to exact matches) | `date`: "Date of the image result, in ISO 8601 format" | 1 of 1 (`"2024-09-10T06:05:00Z"`) |
| `related_content[]` | visually related images (not necessarily the same image) | `date`, ISO 8601 | 3 of 3 (main example), 3 of 3 (cropped-search example) |
| `image_info` | the query image itself | `date`, ISO 8601 | not shown in sample |

Other fields: `title, link, source` (page URL), `original, cdn_original, domain, width, height, format, file_size`. Also `looks_like`, `text_recognition`, `crops`, `ads`, `related_searches`.

The docs don't say what the Bing `date` means (crawl date or publish date). In the sample, a 2014 date on an Apple Events page for an iPhone 16 image suggests the date belongs to the page or crawl, not the image.

SerpApi's upstream URL in the sample is `https://www.bing.com/images/search?q=imgurl:https%3A%2F%2Fi.imgur.com%2FmmAwrdL.jpeg&view=detailv2&iss=sbi`. The image URL is percent-encoded, so query strings in `image_url` should survive.

## 3. Yandex Images (`yandex_images`) reverse search

Source: <https://serpapi.com/yandex-reverse-image-api>, <https://serpapi.com/yandex-images-api>

**Parameters**

| Param | Notes (from docs) |
| --- | --- |
| `engine=yandex_images` | required. Reverse search is the same engine, not a separate one |
| `url` | image URL for reverse search. The docs list it as "Required" on the reverse-image page and as optional on the general page, where `text` becomes optional when `url` is used |
| `tab` | `about` (Yandex default, "About the image") or `similar` |
| `crop` | `left;top;right;bottom`, 0–1. Not combinable with `crop_id` |
| `crop_id` | only for Yandex-hosted images (`avatars.mds.yandex.net`) |
| `yandex_domain` | default `yandex.com` |
| `p` | page, from 0, "up to 30 results" |
| `no_cache`, `async`, `output`, `json_restrictor`, `zero_trace` | standard |

**Response:** `image_preview`, `image_results[]` (`title, snippet, link, source, thumbnail, original_image{link,height,width}`), `image_sizes{large,medium,small}`, `shopping_results`, `image_tags`, `similar_images[]`, `knowledge_graph`. With `tab=similar` you get `images_results[]` (`position, title, snippet, link, source, original, size{height,width,bytes}`).

**Dates:** the word "date" appears **0 times** on both Yandex doc pages. Yandex matches can confirm an appearance but can never date it.

Two opposite signals on URL encoding:
- Unclear: the sample `search_metadata.yandex_images_url` shows the input unencoded (`...search/?url=https://img1.goodfon.com/...jpg&rpt=imageview`). That field could be a display value.
- Positive: SerpApi's own follow-up `serpapi_link`s pass image URLs that contain query strings (`https://avatars.mds.yandex.net/i?id=...-images-thumbs&n=13`, percent-encoded) back into `yandex_images` as `url`. SerpApi therefore expects that input to work.

## 4. Caching and credits

Source: every engine page's `no_cache` param text, and <https://serpapi.com/pricing> ("How are searches counted?")

- "A cache is served only if the query and all parameters are exactly the same. Cache expires after 1h. Cached searches are free, and are not counted towards your searches per month." (identical text on the Lens, Bing, Yandex and Google Search pages)
- "Only successful searches are counted toward your monthly searches. Cached, errored, and failed searches are not. ... responses with 100 results or empty result sets will both count as 1 search."
- `async` and `no_cache` can't be combined.

## 5. URL constraints relevant to a signed store URL

| Constraint | Documented? |
| --- | --- |
| Max URL length | No (none of the pages) |
| Query strings allowed | Not stated. Bing upstream encodes it; Yandex's own follow-up links use query-string image URLs; Lens not shown |
| Content type / format | Not stated for `url`/`image_url`. Image API upload only: JPG/PNG/WebP ≤ 500 KB |
| Pixel dimensions | Bing only: ≤ 4,000 px width and height |
| Must be publicly fetchable | Implied (Google/Bing/Yandex fetch it). The docs don't say when or how long the URL must stay valid |

## 6. Impact on DESIGN.md assumptions

1. **§10.4 T₀ from Lens is weaker than the design assumes.** Lens exact-match dates are sparse (2/6 in samples) and **relative only** ("2 years ago", so about ±6–12 months of precision). Exact matches have no snippet to mine for an absolute date. Consequences:
   - Relative strings must be resolved against `search_metadata.created_at`, not wall-clock time. Otherwise replayed fixtures drift.
   - Two "2 years ago" matches resolve to the same instant and falsely satisfy the "second match within 30 days" rule. Relative dates need a precision/bucket and shouldn't count as corroboration at day granularity.
   - Dated Google Search (tier 3) or Bing will usually have to supply T₀. The map's "if Lens matches rarely carry dates" branch looks **triggered**.
2. **§4 Yandex rationale only partly holds.** Yandex can add independent confirmed matches but gives **no dates**, so it can't correct a "falsely recent first-seen date" by itself. It needs a follow-up dated search on the matched page.
3. **§4/§5 Bing tier holds and is the best date source.** It returns ISO dates on every sample item. Use `pages_with_this_image` for confirmation and treat `related_content` as candidates only (not the same image). The meaning of the date isn't documented, and the sample suggests page or crawl date.
4. **§12 "SerpApi does not charge for its own cached results" is confirmed**, but that cache lasts only 1 h and needs exact parameter equality. A fresh 15-minute presigned URL for each audit changes `url`, so it **defeats both SerpApi's cache and the design's own query-cache key** (SHA-256 of params). Key the query cache on pHash + engine + non-URL params, or keep the object key stable, and rely on the media cache.
5. **§3 upload bridge is unverified, not broken.** The docs don't rule out presigned URLs with `&`-laden query strings, but they don't confirm them either (Lens especially). Mitigations to consider:
   - Lens: use the Image API `image_id` (≤ 500 KB, 10-min expiry), which needs no store URL for tier 1.
   - All engines: use a public, unguessable, query-string-free object URL instead of a presigned one.
   - Check that the 15-minute TTL covers the whole tier 1 to tier 2 escalation.
   The live Lens/Bing/Yandex credits in #2 should test a real presigned URL with a query string.
