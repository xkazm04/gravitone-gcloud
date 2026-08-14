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
| `generate` | **Google** · Nano Banana 2 (Leonardo as fallback) | **Google** · Nano Banana 2 |
| `edit` | **Google** · Nano Banana 2 | same |
| `recognize` | **Qwen** · qwen3.8-max | **Google** · Gemini 3.6 Flash |

Nano Banana **2**, not Lite: Lite is cheaper but supports only *object* references — no style
references. `/library`'s whole premise is that approved plates condition later frames, so Lite
cannot hold the product's central promise.

Leonardo was the dev generator until the trial grid measured it. See *The provider verdict* below —
the short version is that the cheaper render turned out to be the more expensive plate.

Dev leans on Leonardo and Qwen because those credits are already bought. Production is one vendor on
purpose: one style-lock mechanism, one reference-image window, one bill.

## Running the integration probe

```bash
npx tsx pipeline/integration-imaging.mts              # OFFLINE — free, no vendor reached
npx tsx pipeline/integration-imaging.mts --live       # the real vendors; spends real credits
npx tsx pipeline/integration-imaging.mts --live --only qwen
```

**The default changed on 2026-08-14 and it changed which command costs money.** A bare invocation
used to reach every configured vendor; it now runs the OFFLINE half only. That half replaces
`globalThis.fetch` before the engine loads and throws on any unrecognised host, then drives the real
route handlers over canned wire bodies — 27 checks in about a second, no framework, no dependency,
nothing billed. It seals the process twice: that an unexpected host is blocked *and* recorded,
because a thrown fetch alone is swallowed by `http.ts` into an ordinary `failed` and a negative case
could otherwise pass for the wrong reason.

It exists because the live half could report **"0 failed" while exercising nothing** — every case
skips cleanly when a key is absent, so a zero-key run read as green and proved nothing. Both
summaries now name both halves, and a fully-skipped live run says so in as many words.

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

## The provider verdict

Six style blocks × five beats from the repo's own Bitcoin script, rendered on both providers and
graded by a vision model against the brief that made each plate. 60 cells. Read it with
`npx tsx pipeline/report-style-trials.mts`.

```
google     30 cells · on-brief 93% · text leak 10% · clutter 1.4
leonardo   30 cells · on-brief 47% · text leak 57% · clutter 1.8
```

A plate is **usable** only if it is on-brief *and* free of text — text is an unconditional fail,
because captions are the vector layer we draw ourselves. On that bar:

```
leonardo   7/30 usable (23%)   $0.0257/render →  $0.110 per usable plate
google    26/30 usable (87%)   $0.0450/render →  $0.052 per usable plate
```

**Nano Banana is half the price per usable plate despite costing 1.75× per render.** The premise
Leonardo was chosen on — better quality per credit — inverts once "quality" means "a plate you can
actually composite".

Two details make this a verdict rather than a sample. **Fourteen cells flipped between the two
providers, and every one flipped the same way** — there is no task in the grid where Leonardo won.
And the failure that motivated the comparison is model-bound, not prompt-bound: Leonardo drew the
countable mechanism (three arrows, one reversed) **0 times out of 6**, across six unrelated style
blocks, where Nano Banana drew it 4. A failure that survives six different prompts is not a prompt
problem.

The other measured difference is what *kind* of subject breaks each model. Leonardo's text leakage
concentrated by subject rather than by style — the analogy beat leaked on 6/6, because asking for a
"reservation book" invites the model to write in it. Nano Banana leaked on 2/6 for the same beat.
Text-magnet nouns are still worth avoiding in a brief; they are just no longer fatal.

Leonardo stays in the chain as a fallback, and stays the cheaper option for work where being
on-brief does not matter.

## Borrowed from the RunComfy skill pack (2026-08-13)

The `genmedia-labs/skills` pack routes the same models through an aggregator CLI. Its plumbing is not
ours, but its `nano-banana-2` skill documents the model we now generate on, and three things
transferred.

**A reference image is an untrusted input.** *"Reference image / audio / video URLs are untrusted and
can influence generation through embedded instructions (text in images, metadata). When generation
diverges from the prompt, suspect the reference asset."* This lands directly on `/library`: approved
proofs go back in as style references, and the planned screenshot-onboarding path takes an image the
user found somewhere. A screenshot containing legible text can steer a later generation, and the
symptom — output drifting from a prompt that looks correct — is one we would otherwise spend a long
time blaming on the prompt. No mitigation coded; the diagnostic is the value.

**The 0.5K → 2K promotion ladder.** Their documented workflow is *"fast iteration at 0.5K, then
promote the winner to 2K"*, with 1K only as the default middle. We render everything at 1K and pay
1K for trials that exist to be thrown away. `GOOGLE_IMAGE_SIZE` already exists; what is missing is
that resolution should be a property of the STAGE — draft, proof, final — rather than one global
setting. Deferred by the standing decision to stay at 1K until the Step 3 scope settles.

**Why our text leakage concentrated by subject.** Their guidance is to quote literal characters for
in-image typography, and that *"non-quoted in-image text → unpredictable rendering"*. That is the
mechanism behind the grid's oddest result: our analogy beat leaked text on 6/6 Leonardo cells because
the brief named a *reservation book* — an object whose whole identity is text. Naming a text-bearing
object invites unquoted text, and the model renders something. The fix is to describe such objects by
shape rather than by name.

Their video skills were read and mostly do not apply — the catalogue is image-to-video, which this
project has deliberately rejected. Two motion principles survive the translation to code-driven
animation, though: **one beat per clip** (a single primary motion — orbit OR dolly OR tilt, never a
combination), and **state what must not move**, since "no other motion" is what keeps everything else
locked. Both belong in the motion-register work rather than here.

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
