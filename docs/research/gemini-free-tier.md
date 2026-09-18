# Gemini Flash free tier: limits, JSON output, image input

Research for issue #5 (map #2). Checked 2026-09-17 against the ai.google.dev docs listed under Sources. Supports DESIGN.md §13.

## Summary

- **Current model:** `gemini-3.8-flash` is the newest stable Flash model. For the free tier, `gemini-3.5-flash-lite` looks like the better pick (see the verdict).
- **Free-tier RPM and RPD: not in the public docs.** Google now shows free-tier numbers only on the signed-in AI Studio page (`aistudio.google.com/rate-limit`). A developer on Google's forum reports **20 RPD for 3.8 Flash** and **500 RPD for Flash-Lite**. That report is secondhand and not verified.
- **JSON schema output:** supported and enforced on both models. The API accepts a subset of JSON Schema, and the JS SDK docs pair it with `zod`.
- **Image input:** supported on both models. You can send inline base64 (whole request must be 20 MB or less), a URL, or a Files API URI.
- **Verdict:** ~50 audits × 3 calls is **150 requests/day**. That does **not** fit 3.8 Flash if the 20 RPD report is right. It fits Flash-Lite at 500 RPD. **Check the numbers in AI Studio before the build.**

## 1. Which Flash model is current

On the Models page, these Flash text-out models are stable: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash` and `gemini-2.5-flash-lite`. The docs banner says "Gemini 3.8 Flash is now available." [models], [3.8-flash]

| | `gemini-3.8-flash` | `gemini-3.5-flash-lite` |
| --- | --- | --- |
| Status | Stable, latest update September 2026 | Stable, latest update July 2026 |
| Inputs | Text, Image, Video, Audio, PDF | Text, Image, Video, Audio, PDF |
| Output | Text | Text |
| Structured outputs | Supported | Supported |
| Thinking | low / medium / high (`minimal` returns an error) | Supported |
| Context in / out | 1,048,576 / 65,536 tokens | 1,048,576 / 65,536 tokens |
| Free tier (Standard) | Input and output free of charge | Input and output free of charge |

Sources: [3.8-flash], [3.5-flash-lite], [pricing].

Both models list "Used to improve our products: **Yes**" on the free tier [pricing]. That means content users upload for a demo audit may be used by Google. Say so in the demo if that matters.

## 2. Rate limits (RPM / RPD)

What the official Rate limits page says [rate-limits]:

- Limits are measured as RPM, TPM (input) and RPD. Going over any one of them returns a rate-limit error.
- "Rate limits are applied per project, not per API key." So extra keys in the same project add no quota.
- "Requests per day (RPD) quotas reset at midnight Pacific time."
- "Rate limits are more restricted for experimental and preview models." Use a stable id.
- Free tier has no spend-based limit ("N/A").
- The page gives **no free-tier RPM/RPD table**. It says limits "can be viewed in Google AI Studio" (`https://aistudio.google.com/rate-limit`), and "Specified rate limits are not guaranteed and actual capacity may vary." That page needs sign-in, so this research could not read it.
- The pricing page gives one related free-tier number: grounding with Google Search on 2.5 Flash is "up to 500 RPD (limit shared with Flash-Lite RPD)" [pricing]. DejaVue doesn't use grounding.

**Unverified numbers (not a primary source):** On 2026-09-03 a developer (not Google staff) posted on the Google AI Developers Forum that the **Gemini 3.8 Flash free tier is 20 RPD** and that **Flash-Lite gets 500 RPD** [forum]. The same forum has other threads complaining about cuts to free-tier quotas. Treat these figures as "likely, confirm in AI Studio".

## 3. JSON schema output

- Gemini can be set to "generate responses that adhere to a provided JSON Schema." The Google GenAI SDKs accept schemas defined with Zod in JavaScript [structured-output].
- The docs now recommend the **Interactions API** (`client.interactions.create`) for new work. `generateContent` "remains fully supported" [migrate].
  - Interactions: `response_format: { type: 'text', mime_type: 'application/json', schema }`, then read `interaction.output_text`.
  - generateContent: `config: { responseMimeType: 'application/json', responseSchema }`, then read `response.text`.
- Supported JSON Schema subset: types `string`, `number`, `integer`, `boolean`, `object`, `array` and `null` (via a type array such as `["string","null"]`). Also `properties`, `required`, `additionalProperties`, `enum`, `format` (date-time, date, time), `minimum`/`maximum`, `items`, `prefixItems` and `minItems`/`maxItems`, plus `title`/`description` [structured-output].
- Limits: "Not all JSON Schema features are supported"; "Very large or deeply nested schemas may be rejected." [structured-output]
- The docs also say: "While output is syntactically correct JSON, always validate values in your application." The zod check in §13 is still needed.

The §13 schemas (`parseClaim`, `readScene`, `narrate`) use only flat objects, arrays of objects, strings and optional fields. The subset covers all of that. Express optional fields by leaving them out of `required` or with a `null` type union.

## 4. Image input: URL vs inline

The Image understanding page lists three ways to send an image [image-understanding]:

1. **Inline base64:** `{ type: "image", data: <base64>, mime_type: "image/jpeg" }`. "Inline image data limits your total request size (text prompts, system instructions, and inline bytes) to 20MB."
2. **URL:** `{ type: "image", uri: "https://example.com/image1.jpg", mime_type: "image/jpeg" }`. The docs call this "Ideal for publicly accessible images."
3. **Files API:** upload first, then pass `uploaded_file.uri`. Recommended "for larger files or for reusing images across multiple requests."

Supported formats: PNG, JPEG, WEBP, HEIC, HEIF. Token cost: 258 tokens if both sides are 384 px or less. Larger images are split into 768×768 tiles at 258 tokens each. Gemini 3 models also accept `media_resolution`, which caps tokens per image. Higher resolution reads fine text better but costs more tokens [image-understanding].

For `readScene`, sending the sharpest frame **inline** is simplest. It's small (well under 20 MB), needs no public URL and avoids a Files API round trip. A higher `media_resolution` may help read sign text.

## 5. Does ~50 audits/day × 3 calls fit?

Load: 50 × 3 = **150 requests/day** at most. RPM is not a concern: each audit makes 3 calls in sequence, and the app already allows only 10 audits per IP per 10 minutes.

| Model | Free RPD (unverified, from forum) | Fits 150/day? |
| --- | --- | --- |
| `gemini-3.8-flash` | 20 | **No.** About 6 audits/day. |
| Flash-Lite (`gemini-3.5-flash-lite`) | 500 | **Yes**, with about 3× headroom |

Recommendation:

- Default to `gemini-3.5-flash-lite` on the free tier. It has the same inputs, structured outputs and context window as 3.8 Flash.
- Keep the model id in config so a paid key or a higher-quota model can be swapped in for the judged demo.
- The §14 fallback for 429s (template narrative, no scene points) covers running out of quota. Quota resets at midnight Pacific.
- Before the build, open `aistudio.google.com/rate-limit` on the project's account and record the real RPM/RPD for both models.

## Sources

- [models] Gemini models: https://ai.google.dev/gemini-api/docs/models (last updated 2026-09-15)
- [3.8-flash] Gemini 3.8 Flash model page: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash (last updated 2026-09-02)
- [3.5-flash-lite] Gemini 3.5 Flash-Lite model page: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- [rate-limits] Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits (last updated 2026-09-02)
- [pricing] Pricing: https://ai.google.dev/gemini-api/docs/pricing (last updated 2026-09-16)
- [structured-output] Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output (last updated 2026-09-02)
- [image-understanding] Image understanding: https://ai.google.dev/gemini-api/docs/image-understanding (last updated 2026-09-02)
- [migrate] Migrating to the Interactions API: https://ai.google.dev/gemini-api/docs/migrate-to-interactions
- AI Studio rate-limit page (sign-in required, not read): https://aistudio.google.com/rate-limit
- [forum] Not a primary source. "Gemini 3.8 Flash Free Tier 20 RPD Is Too Limited for Practical Evaluation", Google AI Developers Forum, 2026-09-03: https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609
