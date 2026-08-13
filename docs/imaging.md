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
| `generate` | **Leonardo** · Lucid Origin | **Google** · Nano Banana 2 |
| `edit` | **Google** · Nano Banana 2 | same |
| `recognize` | **Qwen** · qwen3.8-max | **Google** · Gemini 3.6 Flash |

Nano Banana **2**, not Lite: Lite is cheaper but supports only *object* references — no style
references. `/library`'s whole premise is that approved plates condition later frames, so Lite
cannot hold the product's central promise.

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

## Measured on the first live run (2026-08-13)

All five probe cases green. What the run taught, beyond "it works":

**Google image output is JPEG-only.** `response_format.mime_type` rejects `image/png` outright:
*"Supported values: 'image/jpeg'."* Lossy compression on flat colour fields is the one thing that
would worry me, since ringing shows worst on exactly the hard edges this style is built from. It is
tolerable only because of the layer split — the plate carries colour and shape, every crisp element
is vector drawn on top by us. Revisit if plates ever have to carry fine detail alone.

**Google does not return an exact aspect.** A `16:9` request at `1K` came back **1376×768**, a ratio
of 1.792 against 16∶9's 1.778 — about 0.8% wide. Leonardo returned exactly **1472×832**. The probe
tolerates ±0.02 because the vendor snaps to its own grid and will not be argued out of it, but
anything compositing a plate under a vector layer must normalise rather than assume.

**The two vision models disagree on the same plate.** Grading one Leonardo image, Qwen said
`isFlat: true` and Gemini said `isFlat: false` — with identical colour readings. Both are arguable
(there is a soft contact shadow), which is the point: a single vision model is an opinion, not a
measurement. Anything gating on a judgement should ask two and treat disagreement as "needs a human".

**Early model-fit signal, n=1 and not a verdict.** Leonardo's Lucid Origin was the purer style —
genuinely flat, no shading — but ignored the mechanism instruction (the beam came out level when the
brief said one pan rides higher). Nano Banana 2 got the mechanism right and correctly restricted
cyan to the arrows, but smuggled in soft gradients and light dimensionality. Style purity versus
instruction precision, in the two directions you would least like to choose between.

## Style lock, measured

The probe's `style-lock.holds` case tests the claim `/library` is built on, as a controlled
comparison rather than a vibe check. Three renders share one style block:

```
A   subject 1, unconditioned        the anchor
B   subject 2, conditioned on A     the claim
C   subject 2, unconditioned        the control
```

A vision model reads all three through one schema, and we compare how much of A's palette survives
into B versus into C. **The control is the point**: without it the test cannot tell style-lock from
the style block already being specific enough on its own — and since the block names three hex
colours, that is a genuinely plausible alternative explanation.

First run: **locked 67% vs control 33%**. Conditioning doubled palette retention, and by eye the
difference is subtler than that ratio suggests — both renders hold the navy/cream/cyan, but the
conditioned one inherits the anchor's *simplicity* (solid shapes, no interior detail) where the
control invents spokes and finer articulation. So the honest reading is: the style block does most
of the work on colour, and references do the work on everything colour cannot describe.

The assertion is the absolute bar (≥50% of the anchor palette), not `locked > control`. At n=1 the
latter would be a coin flip dressed as a test. The comparison is reported either way, and the case
prints a warning if conditioning ever scores *worse* — which would be a real finding.

**Routing is part of this test.** The conditioned render goes through the router, which must move it
off Leonardo: `supportsReferences` is a routing constraint, not a capability, because Leonardo's v1
API silently ignores reference images. An unconditioned image in the wrong style is not a cheaper
success, it is a failure that looks like one. The probe asserts the request landed on Google.

One variance worth knowing: across two runs the same Leonardo prompt produced a plate with **no**
text leakage and then one **with** it. Text leakage is a per-generation risk, not a per-model verdict
— which is the argument for judging every plate rather than sampling.

## Still open

**Leonardo v2 also hosts the Nano Banana family**, which would let dev edits bill against Leonardo
credits instead of a Google key. Model strings are `nano-banana-2-lite`, `nano-banana-2`,
`gemini-image-2` (Pro), `gemini-2.5-flash-image` — all **v2-only**, via
`POST /api/rest/v2/generations` with `parameters.guidances.image_reference[]`. Not implemented,
for two reasons: v2 references images by **uploaded id**, so an edit needs the presigned-upload flow
first, and v2 has no `inpaint`/`mask` at all — it is reference-guided regeneration, not masked
editing. True masked edits must go direct to Google either way.

**Style-lock is proven at n=1, on palette only.** The measured 67/33 is one run, and the metric is
palette overlap because that is what a vision model reports reliably. The properties that actually
separate a publication from a folder of images — stroke weight, level of detail, how much empty
space — are the ones the eye caught and the metric did not. A sharper test would ask the vision
model to compare two images directly rather than describing each alone; our `recognize` takes one
image, so that needs a compositing step or a two-image call.

**Nothing has been rendered at 2K.** `GOOGLE_IMAGE_SIZE` exists and NB2 supports up to 4K, but every
plate so far is 1K. For frames that will be composited under a vector layer and shown full-screen,
1K is probably a floor rather than a target — worth one deliberate comparison before it hardens into
a default nobody revisits.
