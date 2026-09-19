# Temporary media store: Cloudflare R2 vs Supabase Storage

Research for issue #6 (map: #2). Question: what each store needs for a free bucket that can take a presigned upload and hand SerpApi a 15-minute signed GET URL (docs/DESIGN.md §3, "Why a signed upload URL"). Checked 2026-09-17.

## TL;DR

- **Recommend Supabase Storage.** Its free plan needs no payment card, it cannot run up a bill (going over quota brings restrictions, not charges), and `supabase-js` gives a presigned upload and a 900-second signed GET in two calls. The main risk: free projects pause after a week with no activity. Open the dashboard before a demo.
- **R2 needs a checkout in the dashboard** before you can create a bucket. Cloudflare's docs never say "card required", but checkout is how you add a payment method, and community threads say one is mandatory. Pick R2 only if a card is fine.
- **Big finding: Google Lens may not need a store at all.** SerpApi's Image API (`POST https://serpapi.com/image`) takes a multipart upload of up to 500 KB (JPG, PNG, WebP) and returns an `image_id` that works for 10 minutes. Google Lens accepts `image_id` in place of `url`. Bing Reverse Image (`image_url`) and Yandex Images (`url`) do not list `image_id`, so the store is still needed if those engines run on uploaded images.

## 1. Free tier and payment card

| | Cloudflare R2 | Supabase Storage |
| --- | --- | --- |
| Free allowance | 10 GB-month storage, 1M Class A ops, 10M Class B ops per month, free egress. Standard storage class only. [R2 pricing] | 1 GB storage, 5 GB egress, 50 MB max upload per file, 2 active free projects. [Supabase pricing] |
| Card needed? | **Effectively yes.** Get-started page: "You need a Cloudflare account with an R2 subscription… Complete the checkout flow to add an R2 subscription to your account." It also says "You are billed for your usage on a monthly basis." [R2 get started]. Cloudflare's docs don't say outright that a card is required. Community threads ("Why using R2 free tier involves giving card info?", "If I want to use Cloudflare R2, I have to link a payment method") report that one is (secondary sources, and the forum blocked automated fetches). | **No** for the free plan. "Paid plans require a credit card to be on file" [Supabase billing setup]. On the free plan "you are not charged additional fees": going over quota brings restrictions such as paused projects or HTTP 402 responses [Supabase billing FAQ]. |
| Surprise-bill risk | Charges past the free tier go to the saved payment method. | None on the free plan. You get restricted instead. |
| Gotchas | Only the Standard storage class is free. | "Free projects are paused after 1 week of inactivity" [Supabase pricing]. A paused project fails every upload and signed URL until you restore it. |

## 2. Presigning from Node

### R2 (S3 API, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)

From Cloudflare's docs [R2 presigned URLs] [R2 aws-sdk-js-v3]: set `region: "auto"`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, and an R2 API token's access key pair. Expiry can be from 1 second to 7 days. Presigned URLs work for GET, HEAD, PUT and DELETE. "Presigned URLs work with the S3 API domain and cannot be used with custom domains." A browser PUT needs CORS rules set on the bucket.

```ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  // See the checksum note below
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const key = `tmp/${crypto.randomUUID()}.jpg`;
const putUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: "dejavue-tmp", Key: key, ContentType: "image/jpeg" }),
  { expiresIn: 900, signableHeaders: new Set(["content-type"]) },
);
const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: "dejavue-tmp", Key: key }), { expiresIn: 900 });
```

**Local check** (offline, fake credentials, `@aws-sdk/client-s3` 3.1134.0):
- **Checksum:** with default client settings, the presigned PUT URL came out with `x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32`, which is the CRC32 of an *empty* body. A real upload with a body would likely fail that check. Setting `requestChecksumCalculation: "WHEN_REQUIRED"` removed both parameters.
- **ContentType:** Cloudflare says a mismatched Content-Type makes the upload fail. But with default options, `SignedHeaders` was only `host`, so the type was not signed. Passing `signableHeaders: new Set(["content-type"])` made it `content-type;host`.

Both points come from this local run, not from Cloudflare's docs. Test them against a real bucket.

Cleanup: call `DeleteObjectCommand` when the audit ends. As a backstop, add an R2 lifecycle rule that deletes objects under `tmp/` after 1 day.

### Supabase (`@supabase/supabase-js`)

These signatures come from the storage-js source (`StorageFileApi.ts`), which is also where the API reference docs are generated from [storage-js source]:

```ts
import { createClient } from "@supabase/supabase-js";
// Server only: the service-role / secret key bypasses RLS. Never send it to the browser.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const bucket = supabase.storage.from("dejavue-tmp"); // private bucket

const path = `tmp/${crypto.randomUUID()}.jpg`;

// 1. Server: presigned upload. Returns { signedUrl, token, path }. "They are valid for 2 hours." (not configurable per call)
const { data: up } = await bucket.createSignedUploadUrl(path);

// 2. Browser (anon client) or server: upload with the token
await supabaseAnon.storage.from("dejavue-tmp").uploadToSignedUrl(path, up.token, file, { contentType: "image/jpeg" });
//    Or with no SDK: PUT the file to up.signedUrl (storage-js sends x-upsert, cache-control, content-type)

// 3. Server: 15-minute GET. expiresIn is in seconds.
const { data: dl } = await bucket.createSignedUrl(path, 900);

// 4. Cleanup
await bucket.remove([path]);
```

RLS needs (from the method docs): `createSignedUploadUrl` needs `insert` on `storage.objects`, and `createSignedUrl` needs `select`. With the service-role key on the server you don't need any policies. Signed URLs are signed with a storage signing key that is separate from the Auth JWT key, and "remain valid until their expiry time regardless of any Auth key changes". Revoking one means contacting support [Supabase downloads]. That doesn't matter at 15 minutes.

## 3. Signed GET URL shape

**R2** (from the local run above, 476 characters for a 44-character key):

```
https://dejavue-tmp.<ACCOUNT_ID>.r2.cloudflarestorage.com/tmp/<uuid>.jpg
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Content-Sha256=UNSIGNED-PAYLOAD
  &X-Amz-Credential=<ACCESS_KEY_ID>%2F20260917%2Fauto%2Fs3%2Faws4_request
  &X-Amz-Date=20260917T053340Z
  &X-Amz-Expires=900
  &X-Amz-Signature=<64 hex>
  &X-Amz-SignedHeaders=host
  &x-amz-checksum-mode=ENABLED        (added by newer SDKs by default)
  &x-id=GetObject
```

The SDK uses virtual-hosted style (the bucket name is a subdomain). Set `forcePathStyle: true` to get `https://<ACCOUNT_ID>.r2.cloudflarestorage.com/dejavue-tmp/...` instead. Expect roughly 430–520 characters. The URL includes the access key ID (not the secret).

**Supabase** (format from the storage-js doc comment and server source):

```
https://<project-ref>.supabase.co/storage/v1/object/sign/dejavue-tmp/tmp/<uuid>.jpg?token=<JWT>
```

The token is an HS256 JWT whose payload is `{"url":"<bucket>/<path>","iat":…,"exp":…}` (example in supabase/storage `getSignedUploadURL.ts`). That puts it at roughly 250–320 characters, an estimate from the JWT structure that wasn't measured. The URL has a single query parameter, and the optional `&download=` is only added if you ask for it.

## 4. Can third-party fetchers (SerpApi and Google) read them?

- SerpApi's Google Lens docs describe `url` only as "the URL of an image to perform the Google Lens search". Nothing is said about length, encoding, or signed URLs [SerpApi Google Lens].
- SerpApi's own S3 tutorial says to make the bucket public "so the image can be accessed by SerpApi" [SerpApi blog, 2025-05-27]. That confirms the fetch comes from their side and must not need auth headers. A presigned URL puts all its auth in the query string, so it meets that requirement on both stores. I found no first-party report of Lens rejecting signed S3, R2 or Supabase URLs, but none of this has been tested live yet. Do that at build time with one real Lens call per store.
- **Encoding:** both URLs contain `&`, `=` and `%`. The official `serpapi` npm package (2.2.1) builds its request with `querystring.stringify(params)`, so the nested URL is encoded correctly. If you build the request URL by hand, wrap it in `encodeURIComponent`.
- **Caching:** "A cache is served only if the query and all parameters are exactly the same. Cache expires after 1h" [SerpApi Search API]. Every presigned URL is different, so SerpApi's cache never hits for uploads. Use DejaVue's own cache (keyed by pHash) for repeat searches.
- **Content-Type:** both stores serve back the Content-Type saved at upload. Set it explicitly (`image/jpeg`, `image/png` or `image/webp`) so the fetcher sees an image and not `application/octet-stream`.
- **Expiry vs retries:** 15 minutes easily covers one audit's fan-out. SerpApi's `async=1` is documented as unavailable for file-upload searches (roadmap issue #948), and the tier-based pipeline runs synchronously anyway.
- **Supabase-specific:** a paused free project fails every fetch (see §1). The 50 MB upload cap doesn't matter for still images.
- **R2-specific:** presigned URLs must use `*.r2.cloudflarestorage.com`. Custom domains and `r2.dev` URLs don't support them.

### Option that skips the store for Lens: SerpApi Image API

[SerpApi Image API] [SerpApi Lens upload guide]
- `POST https://serpapi.com/image` with multipart fields `image` (a binary JPG, PNG or WebP, 500 KB max) and `api_key`. It returns JSON with `image_id`.
- "The uploaded `image_id` will be expired after 10 minutes."
- Then call `engine=google_lens&image_id=…`. "When using the `image_id` parameter, the `url` parameter can be omitted."
- Not documented: whether the upload itself costs a credit.
- The Bing Reverse Image API lists only `image_url`, and the Yandex Images API lists only `url`, so they still need a fetchable URL.
- DejaVue already resizes in a Web Worker, so getting under 500 KB is cheap.

## 5. Recommendation

1. **Use Supabase Storage** for the temporary media store: a private bucket `dejavue-tmp`, calls made on the server with the secret key, `createSignedUploadUrl` → `uploadToSignedUrl` → `createSignedUrl(path, 900)` → `remove`. No card, no chance of a bill, and the SDK is simpler than SigV4.
2. **Update DESIGN.md §3.1**: replace `@aws-sdk/client-s3` with `@supabase/supabase-js` for this row, or keep R2 as a documented alternative behind the same `TempMediaStore` interface (`putUrl`, `getUrl`, `remove`).
3. **Consider the SerpApi Image API** for the Lens call. It needs no store and no public URL, but the image must be 500 KB or less and the `image_id` lasts 10 minutes. Keep the Supabase signed URL for Bing and Yandex reverse-image calls.
4. **Before the demo**, open the Supabase project so it isn't paused, and run one real Lens search against a signed URL to confirm the fetch works.

If a card is acceptable, R2 works just as well technically (bigger free tier, free egress). Set `requestChecksumCalculation: "WHEN_REQUIRED"` and sign `content-type`.

## Sources

- [R2 pricing]: https://developers.cloudflare.com/r2/pricing/
- [R2 get started]: https://developers.cloudflare.com/r2/get-started/
- [R2 presigned URLs]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- [R2 aws-sdk-js-v3]: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- Community (secondary): https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179 and https://community.cloudflare.com/t/if-i-want-to-use-cloudflare-r2-i-have-to-link-a-payment-method-i-suggest-not-doin/887578
- [Supabase pricing]: https://supabase.com/pricing
- [Supabase billing setup]: https://supabase.com/docs/guides/platform/get-set-up-for-billing
- [Supabase billing FAQ]: https://supabase.com/docs/guides/platform/billing-faq
- [Supabase downloads]: https://supabase.com/docs/guides/storage/serving/downloads
- [storage-js source]: https://github.com/supabase/supabase-js/blob/master/packages/core/storage-js/src/packages/StorageFileApi.ts
- supabase/storage signed upload route: https://github.com/supabase/storage/blob/master/src/http/routes/object/getSignedUploadURL.ts
- [SerpApi Google Lens]: https://serpapi.com/google-lens-api
- [SerpApi Image API]: https://serpapi.com/image-api
- [SerpApi Lens upload guide]: https://serpapi.com/google-lens-upload-an-image
- SerpApi Bing Reverse Image: https://serpapi.com/bing-reverse-image-api ; Yandex Images: https://serpapi.com/yandex-images-api
- [SerpApi Search API]: https://serpapi.com/search-api
- [SerpApi blog, 2025-05-27]: https://serpapi.com/blog/uploading-images-and-searching-with-google-lens-via-serpapi/
- SerpApi roadmap #948: https://github.com/serpapi/public-roadmap/issues/948
