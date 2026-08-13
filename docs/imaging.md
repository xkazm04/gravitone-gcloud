# Imaging — the vendor layer

Three capabilities, three vendors, one contract. Everything the studio needs from an image model is
`generate`, `edit`, `recognize`; which vendor performs one is an *environment* decision made in
`lib/imaging/router.ts` and nowhere else.

```
app/api/imaging/{generate,edit,recognize}   ← the seam; the browser never holds a key
            │
      lib/imaging/router.ts                 ← the chokepoint: capability → vendor
            │
   ┌────────┼────────┐
leonardo  google    qwen
```

| Capability | dev | prod |
|---|---|---|
| `generate` | **Leonardo** · Lucid Origin | **Google** · Nano Banana 2 Lite |
| `edit` | **Google** · Nano Banana 2 Lite | same |
| `recognize` | **Qwen** · qwen3.8-max | **Google** · Gemini 3.6 Flash |

Dev leans on Leonardo and Qwen because those credits are already bought. Production is one vendor on
purpose: one style-lock mechanism, one reference-image window, one bill.

## Running the integration probe

```bash
npx tsx pipeline/integration-imaging.mts              # every configured vendor
npx tsx pipeline/integration-imaging.mts --only qwen  # one
```

It hits the live APIs and costs real credits, so it generates the minimum that proves the path: one
plate, one look at it, one edit of it. Images land in `imaging-probe-out/` (gitignored) so a human
can see what the probe judged. Cases skip cleanly when a key is absent — a missing key is never a
failure, only a gap.

The four assertions that matter, and why each exists:

1. **Aspect held.** Dimensions are read out of the returned PNG/JPEG header and checked against the
   ratio requested. A twelve-shot batch silently coming back 9:16 is a documented failure mode, and
   `Aspect` is a required field with no default precisely so it cannot recur.
2. **Leonardo cleaned up.** `provenance.cleanup === "deleted"` is asserted, not logged. See below.
3. **Recognition returned JSON that satisfies its schema** — not prose that merely contains braces.
4. **A refusal reads as `refused`**, so the router re-routes instead of retrying into a wall.

## The Leonardo cleanup contract

Leonardo is a *studio* as well as an API: anything generated appears in the account's gallery
forever. So `leonardoProvider.generate` deletes every generation it creates, in a `finally` — a
download that throws must not be the reason clutter survives.

Deletion failure is reported in `provenance.cleanup`, never raised. By the time cleanup runs we
already hold the pixels, and failing the call would trade the user's image for their tidiness.

## Verified vendor facts

Recorded so nobody re-researches them. Confirmed 2026-08-13 against live docs and a working client
in the `personas` repo.

### Leonardo
- `https://cloud.leonardo.ai/api/rest/v1` · `Authorization: Bearer <key>`
- Lucid Origin is **`7b592283-e8a7-4c5a-9ba6-d18c31f258b9`** on v1, `"lucid-origin"` on v2.
  Do not confuse it with `05ce0082-2d80-4a2d-8653-4d1c85e2418e`, which is **Lucid Realism** and is
  misattributed in at least one search result.
- `POST /generations` → poll `GET /generations/{id}` → `DELETE /generations/{id}`
- Prompt cap **1500 chars on v1** (2000 on v2). Checked locally so a long style block fails with a
  message saying what to shorten.
- Money fields are a moving target: `apiCreditCost` is being superseded by `cost: {amount, unit}`,
  the webhook spells it `apiDollarCost`, and amounts arrive as **strings**. `costUsdFrom()` coerces
  and reads the unit — treating `DOLLARS` as credits would under-report the bill by ~400×.
  The exact path of `cost` is **third-party-sourced only**; confirm against a live response before
  trusting it for billing.
- Default concurrency **10**; excess requests queue rather than error. Failed generations are refunded.
- **Rate limits are unpublished** — the docs page 404s and there is no documented 429. The HTTP
  helper backs off against an unknown ceiling rather than a stated one.

### Google
- `POST https://generativelanguage.googleapis.com/v1beta/interactions` · header `x-goog-api-key`
- **`generateContent` is legacy.** Google replaced it with the Interactions API; the legacy response
  schema (`outputs[]`) was removed outright in June 2026 and the wire format is `steps[]`.
  `responseMimeType` / `responseSchema` no longer exist — structured output is
  `response_format: {type:"text", mime_type:"application/json", schema}`.
  **An implementation written from pre-2026 memory is wrong in shape, not just in model id.**
- Nano Banana 2 Lite is `gemini-3.1-flash-lite-image`; vision is `gemini-3.6-flash`.
- Editing is the *same* endpoint with an image part in `input` — there is no edit route.
- **The safety-block shape is undocumented** for Interactions. Every published block field describes
  the legacy endpoint, and blocks are known to present as a silently empty result. So an empty image
  result is treated as `refused` rather than success: a refusal re-routes, where a false success
  would hand the caller nothing.

### Qwen
- `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` · OpenAI-compatible
- `qwen3.8-max` (note the dot) is vision-capable; image part first, text second; 10 MB inline cap.
- Native `json_schema` with `strict` is supported on the 3.8-Max series — used here, and re-checked
  locally. The reference client asks for JSON in the prompt and validates nothing; this does both.
- Fallback SKUs (`qwen3.7-plus`, `qwen3.6-flash`) exist for **quota**, not quality: they bill against
  separate allowances, so a 429 on one says nothing about the next. Only `rate-limited` rotates.

## Two open items

**Nano Banana 2 Lite cannot take style-reference images.** It supports up to 14 *object* references
but has no style-reference or character-consistency support — those are Nano Banana 2 / Pro
features. This matters directly to `/library`, whose lock gate assumes approved plates condition
later frames. The text style block still carries style (and research says it must be restated in
full every time regardless), but if reference-conditioned style lock proves necessary, generation
has to move to `gemini-3.1-flash-image` (NB2) and `GOOGLE_IMAGE_MODEL` exists to make that a
one-line change.

**Leonardo v2 also hosts the Nano Banana family**, which would let dev edits bill against Leonardo
credits instead of a Google key. Model strings are `nano-banana-2-lite`, `nano-banana-2`,
`gemini-image-2` (Pro), `gemini-2.5-flash-image` — all **v2-only**, via
`POST /api/rest/v2/generations` with `parameters.guidances.image_reference[]`. Not implemented,
for two reasons: v2 references images by **uploaded id**, so an edit needs the presigned-upload flow
first, and v2 has no `inpaint`/`mask` at all — it is reference-guided regeneration, not masked
editing. True masked edits must go direct to Google either way.
