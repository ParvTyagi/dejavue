# Temporary media store: Cloudinary free plan

Research for issue #14 (map: #2). Follows the storage decision on #6 (Cloudinary instead of Supabase Storage). Question: can Cloudinary's free plan hold our ≤1024 px JPEG keyframes (~200 KB) at a public https URL that SerpApi's `google_lens`, `bing_reverse_image` and `yandex_images` can fetch, and how do we delete them after the audit (docs/DESIGN.md §3, §7)? Checked 2026-09-17 against cloudinary.com docs, the pricing pages and `cloudinary` npm 2.11.0. No SerpApi calls and no live Cloudinary account were used.

## TL;DR

- **It fits.** The free plan needs **no card**, gives **25 credits a month**, caps images at **10 MB**, and its limits are **soft**: going over gets you an upgrade request, not a bill. Our usage is a rounding error.
- **Upload from Node** with `cloudinary.v2.uploader.upload(dataUri | path)` or `upload_stream(buffer)`. **Delete** with `uploader.destroy(publicId, { invalidate: true })`. As a backstop, sweep leftovers with `api.delete_resources_by_prefix("dejavue-tmp/")`.
- **No auto-expiry.** Cloudinary has no TTL or lifecycle rule that deletes assets. The nearest thing is `access_control` with an `anonymous` time window, which stops *access* after a set time but doesn't delete anything. Cleanup is on us.
- **Delivery URLs are public by default** and need no cookies: `https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.jpg`. Signed URLs (`/s--SIG--/`) for `authenticated` assets **never expire**. URLs that do expire (token-based access) need the **Advanced plan**. `private_download_url` does expire, but it costs double bandwidth and isn't cached on the CDN.
- **pHash is safe** if the URL has **no transformation** and the **same extension** (`.jpg`). Then "you just deliver the originally uploaded asset as is". Default quality and metadata stripping only kick in when a transformation is applied. Never add `f_auto`, `q_auto`, `format` or an incoming transformation.
- **URL stability:** the `v<timestamp>` version changes on every upload, but the delivery-URL signature leaves the version out (checked locally). If you build the URL yourself with no version and a deterministic `public_id`, it stays the same across re-uploads. Also turn off the SDK's `?_a=` analytics query parameter.
- **Poor-fit flags:** no TTL; the CDN can keep serving a deleted asset for **up to 30 days** unless you pass `invalidate: true`; you can't get a short-lived signed URL on the free plan. None of these blocks us.

## 1. Free plan: card and limits

| Item | Value | Source |
| --- | --- | --- |
| Card | "Free forever · No credit card required" | [pricing] |
| Monthly allowance | "25 monthly credits", "3 Users / 1 Account" | [pricing] |
| What a credit buys | "1 credit = 1,000 transformations OR 1GB managed storage OR 1GB image bandwidth" (video bandwidth 2:1 is "PAID PLANS ONLY") | [pricing] |
| What counts as a transformation | "the number of times an original is uploaded or a derived resource is created for the first time. Images and videos accessed subsequently … do not increment" | [compare-plans FAQ] |
| Max image file size | Free 10 MB (Plus 20 MB, Advanced 40 MB) | [compare-plans] |
| Max image megapixels | 25 MP | [compare-plans] |
| Admin API rate limit | "The free plan includes 500 hourly requests". The Upload API "isn't rate-limited" | [admin API] |
| Going over the limits | "Cloudinary's limits are soft limits. Once you exceed these, we'll ping and ask you nicely to upgrade" | [compare-plans FAQ] |
| Backups | "Automatic backup is off by default" | [backups] |

**Budget.** Each keyframe costs 1 upload (1/1000 credit), ~200 KB of storage for minutes, and 3 engine fetches of ~200 KB each (~0.6 MB of bandwidth). 1,000 keyframes a month comes to roughly 1 credit for uploads plus ~0.6 credit for bandwidth. That is far below 25.

**Backups matter for privacy.** Destroy notes: "If you have backups enabled, the deleted asset remains in your backed up storage" [upload API]. Leave automatic backup **off**. That is the default.

## 2. Upload from Node

Config: the SDK reads **only** `CLOUDINARY_URL` from the environment (`lib/config.js` reads `process.env.CLOUDINARY_URL`, `CLOUDINARY_ACCOUNT_URL` and `CLOUDINARY_API_PROXY`, and nothing else). The format is `cloudinary://<api_key>:<api_secret>@<cloud_name>`. It's copied from Console, Settings, API Keys [node integration]. A local run confirmed that the SDK parses it into `cloud_name`, `api_key` and `api_secret`. If you want three separate variables instead, call `cloudinary.config({...})` yourself.

Sources the uploader accepts: "a local path, a remote HTTP or HTTPS URL, an allowlisted storage bucket … URL, a base64 data URI, or an FTP URL". `upload_stream` covers buffers and streams [node upload].

Parameters that matter [upload API]:

- `public_id`: up to 255 chars, may include `/`. If it's left out (and `use_filename` is false), "the public ID … will be comprised of random characters".
- `overwrite`: default `true` for signed uploads.
- `invalidate`: default `false`. Clears CDN copies of the old asset on overwrite.
- `type`: `upload` (the default, public), `private` or `authenticated`.
- `access_control`: `[{ access_type: "anonymous", start, end }]` for a public time window. "Access control is available to all Cloudinary accounts. However, token-based and cookie-based access require the Advanced plan" [access control].
- `format`: converts before storing. **Don't set it.**
- `return_delete_token`: "can be used to delete the uploaded asset within 10 minutes using an unauthenticated API request". We don't need it, since the server already holds the secret.
- `headers`: e.g. `X-Robots-Tag: noindex`, suggested to keep assets out of search engines [access control]. It's worth setting.

The upload response includes `public_id`, `version`, `secure_url`, `width`, `height`, `format` and `bytes` [node upload].

## 3. Delete, and auto-expiry

- **Single asset:** `cloudinary.v2.uploader.destroy(publicId, { resource_type: "image", type: "upload", invalidate: true })`. It "Permanently deletes a single asset". The Upload API isn't rate-limited [upload API].
- **Bulk sweep:** Admin API `delete_resources_by_prefix`, `delete_resources_by_tag` or `delete_all_resources`. These are Admin API calls, so they count against 500/hour on the free plan [delete assets] [admin API].
- **CDN caching after delete:** "any delivered versions of the asset, with or without transformations, can remain cached on CDN servers for up to 30 days" unless invalidated. With `invalidate: true`, propagation "usually takes between a few seconds and a few minutes" [invalidate].
- **Auto-expiry: none.** None of the upload, delete, backup or access-control pages documents a TTL or lifecycle deletion, and the docs index (`/documentation/llms.txt`) lists no such feature either. The only time-based control is `access_control` with an `anonymous` `end`, which blocks *delivery* after that time but keeps the asset stored. Whether the CDN enforces the window on copies it has already cached isn't documented, so test it live if we rely on it. A MediaFlows workflow could do scheduled deletes, but that's more than we need.

## 4. Public by default? Unguessable IDs and signed URLs

| Option | URL | Cookies? | Expires? | Free plan? | Notes |
| --- | --- | --- | --- | --- | --- |
| `type: upload` (default) with a random `public_id` | `https://res.cloudinary.com/<cloud>/image/upload/v<ver>/dejavue-tmp/<id>.jpg` | No | No (until deleted) | Yes | Public. Security rests on the ID being unguessable. Anyone can request transformations of it (these cost credits) unless Strict Transformations is on. |
| `type: authenticated` plus `sign_url: true` | `https://res.cloudinary.com/<cloud>/image/authenticated/s--XXXXXXXX--/v<ver>/<id>.jpg` | No | **No**: signature is 8 chars of SHA over `public_id/transformation` plus the secret | Yes | "Requires a signed URL to access both original and derived assets." Blocks enumeration and unsigned transforms. "Doesn't prevent link sharing." [access control] |
| `private_download_url(id, "jpg", { type, expires_at })` | `https://api.cloudinary.com/v1_1/<cloud>/image/download?timestamp=…&public_id=…&format=jpg&type=…&expires_at=…&signature=…&api_key=…` | No | **Yes** (default 1 h) | Yes | "delivers the image via a secure authenticated API request … each time. The image isn't cached on the CDN." "cost[s] twice the bandwidth" [access control]. The URL has `&` query params and exposes `api_key` (not the secret). |
| Token-based access (`auth_token`) | `…?__cld_token__=…` | No | Yes | **No**: Advanced plan or higher, enabled by support | [access control] |
| Cookie-based access | n/a | **Yes** | Yes | No: premium plus CNAME | Useless for SerpApi. |
| `access_control: anonymous` with `end` | same as `upload` | No | Access stops at `end` | Yes | Asset stays stored. CDN enforcement on cached copies is unverified. |

All the free options work for an outside fetcher with no cookies. Local SDK run (`cloudinary@2.11.0`, fake credentials):

```
upload:        https://res.cloudinary.com/democloud/image/upload/v1789000000/dejavue-tmp/7f3c…9a1b.jpg?_a=BAMAROeE0
authenticated: https://res.cloudinary.com/democloud/image/authenticated/s--tSfDdtnP--/v1789000000/dejavue-tmp/7f3c…9a1b.jpg?_a=BAMAROeE0
  same, v1789000999 → same s--tSfDdtnP-- (version isn't signed)
urlAnalytics:false → the ?_a=… suffix disappears
```

By default the SDK appends an analytics `?_a=` query parameter to generated URLs [node integration]. Set `urlAnalytics: false` so URLs are clean and deterministic.

## 5. Does delivery change the bytes (pHash)?

- "If you don't include a transformation component, then you just deliver the originally uploaded asset as is." [delivery options]
- The default image quality setting "is applied to all images … but only if other transformations are also applied". Metadata stripping applies "When you deliver an image from Cloudinary with any transformation applied". "Each of the default optimizations affect only the delivered image. The original image file remains unchanged." [optimization]
- "Optimize by default" (automatic format and quality with no URL parameter) is "Enterprise only" [optimization], so a free account doesn't get it.
- A different extension counts as a different transformation, and `f_auto` negotiates the format by browser [access control, strict transformations] [optimization]. **Deliver with the stored extension (`.jpg`), and never use `f_auto`, `q_auto`, `format` on upload, or an incoming transformation.**
- On upload, `format` and `allowed_formats` are the only documented conversions. Without them, files "are stored as-is" [upload API].

**Result:** a bare `…/image/upload/v…/id.jpg` returns the uploaded JPEG bytes, so pHash is unchanged. This is documented behaviour and hasn't been tested against a live account. Checking it takes one upload plus a byte comparison, and costs no SerpApi credit.

## 6. Is the delivery URL stable across re-uploads?

- The `version` in `secure_url` "represents the timestamp of the upload" [delivery options], so **`secure_url` changes on every upload**.
- Versions are optional. Without one, the CDN serves its cached copy or fetches the latest [transformations]. For public IDs with slashes, the SDK inserts a `/v1/` placeholder that isn't tied to upload time [delivery options].
- The delivery signature doesn't cover the version (local run above).
- So a URL built as `cloudinary.url(publicId, { secure: true, format: "jpg" })` with `urlAnalytics: false` is **stable across re-uploads if `public_id` is deterministic**, e.g. `dejavue-tmp/<sha256 of the JPEG bytes>`. SerpApi's 1-hour cache keys on exact parameters (see `research/serpapi-engine-inputs`), so re-running the same image within the hour would hit the cache for free.
- Catch: with no version, the CDN may serve a stale copy after an overwrite. For identical bytes that doesn't matter. A random UUID `public_id` gives a new URL every time and never hits SerpApi's cache, so DejaVue's own pHash cache has to cover repeats.
- A SHA-256 of the bytes is unguessable to anyone who doesn't already have the image, which meets the "random key" intent of §7.

## 7. Recommended approach

```ts
// .env.local
// CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
import { v2 as cloudinary } from "cloudinary";
import { createHash } from "node:crypto";

cloudinary.config({ secure: true, urlAnalytics: false }); // credentials come from CLOUDINARY_URL

export async function putKeyframe(jpeg: Buffer) {
  const publicId = `dejavue-tmp/${createHash("sha256").update(jpeg).digest("hex")}`;
  await new Promise((resolve, reject) =>
    cloudinary.uploader
      .upload_stream(
        {
          public_id: publicId,
          resource_type: "image",
          type: "upload",
          overwrite: true,
          tags: ["dejavue-tmp"],
          headers: "X-Robots-Tag: noindex",
          // optional backstop, CDN enforcement unverified:
          // access_control: [{ access_type: "anonymous", end: new Date(Date.now() + 15 * 60_000).toISOString() }],
        },
        (err, res) => (err ? reject(err) : resolve(res)),
      )
      .end(jpeg),
  );
  // Stable across re-uploads: no version, no transformation, same extension
  return { publicId, url: cloudinary.url(publicId, { format: "jpg" }) };
}

export const removeKeyframe = (publicId: string) =>
  cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload", invalidate: true });

// On server start or in a periodic sweep: remove anything a crashed audit left behind (Admin API, 500 req/h on free)
export const sweep = () => cloudinary.api.delete_resources_by_prefix("dejavue-tmp/", { invalidate: true });
```

- **Env vars:** `CLOUDINARY_URL` is the only one. In `.env.example`, replace the four `R2_*` lines.
- **Console:** leave automatic backup off. Optionally turn on Strict Transformations (Settings, Security) so nobody can burn credits by transforming our public IDs.
- **If public-by-default is unacceptable:** use `type: "authenticated"` and `cloudinary.url(id, { type: "authenticated", sign_url: true, format: "jpg" })`. It's still cookieless and stable, but the URL never expires on its own, so you still need `destroy`.
- **Also on #6:** SerpApi's `image_id` upload can serve Google Lens with no store at all. Cloudinary is still needed for Bing and Yandex.

## 8. Open items (live checks, no SerpApi credit needed)

1. Upload a JPEG, `curl` the bare URL, and compare the bytes and `Content-Type: image/jpeg`.
2. Destroy with `invalidate: true`, then `curl` again within a few minutes and expect 404.
3. Optional: check that an `anonymous` window with `end` in the past returns 401 or 404 once the CDN copy is cached.
4. The first real SerpApi run: confirm that all three engines fetch from `res.cloudinary.com`. Nothing Cloudinary documents suggests they wouldn't.

## Sources

- [pricing]: https://cloudinary.com/pricing
- [compare-plans] / [compare-plans FAQ]: https://cloudinary.com/pricing/compare-plans
- [upload API]: https://cloudinary.com/documentation/image_upload_api_reference (upload, destroy)
- [node upload]: https://cloudinary.com/documentation/node_image_and_video_upload
- [node integration]: https://cloudinary.com/documentation/node_integration
- [admin API]: https://cloudinary.com/documentation/admin_api (rate limits)
- [delete assets]: https://cloudinary.com/documentation/delete_assets
- [invalidate]: https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn
- [backups]: https://cloudinary.com/documentation/backups_and_version_management
- [access control]: https://cloudinary.com/documentation/control_access_to_media
- [optimization]: https://cloudinary.com/documentation/image_optimization
- [delivery options]: https://cloudinary.com/documentation/image_delivery_options, https://cloudinary.com/documentation/advanced_url_delivery_options
- [transformations]: https://cloudinary.com/documentation/image_transformations (URL structure, asset versions)
- SDK source: `cloudinary` npm 2.11.0, `lib/config.js`, plus a local URL-generation run with fake credentials
