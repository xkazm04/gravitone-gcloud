# The LLM seam: local-first, and what a hosted posture can honestly carry

*2026-08-27. An impact analysis and the change that followed from it. The
question put was: find every place this app talks to a model, put a wrapper
round them, and decide which can switch to Google Cloud, which cannot, and
what should therefore hide behind an environment variable. The craft rules
below come from the `software-engineering` bundle in the ai-registry — chiefly
`llm-agent/runtime-and-io/agent-cli-transport` and
`llm-agent/orchestration/model-routing` — plus `media-generation`'s
`generative-provider-routing`. Each is cited by technique name so the source
can be read.*

## The inventory

Every model interaction in this repository, as of this commit:

| # | Site | Engine | Abstraction before |
| --- | --- | --- | --- |
| 1 | `POST /api/recalibrate` | `claude` CLI subprocess | none — imported `runClaude` directly |
| 2 | `POST /api/frames` | `claude` CLI subprocess | none — same |
| 3 | `pipeline/direct-frames.mts` | `claude` CLI subprocess | none (dev script, outside the app graph) |
| 4 | `POST /api/imaging/recognize` | Qwen 3.8-Max · Gemini 3.6 Flash | full router |
| 5 | `POST /api/imaging/generate` | Google · Leonardo | full router |
| 6 | `POST /api/imaging/edit` | Google | full router |
| 7 | `POST /api/music/plan` | ElevenLabs (vendor-side LLM) | single vendor |
| 8 | `POST /api/music/generate` | ElevenLabs | single vendor |
| 9 | `POST /api/music/sfx` | ElevenLabs | single vendor |
| 10 | `POST /api/music/compose` | ElevenLabs | single vendor |
| 11 | `pipeline/vlm-probe/`, `pipeline/foundry/` | Ollama `127.0.0.1:11434` + ComfyUI | outside the app graph |
| 12 | video | planned, not built | `docs/video-generation-plan.md` |

## The asymmetry, which is the whole finding

Rows 4–6 already had the shape this work was asked to produce. `lib/imaging/`
is a capability→vendor plan with lazily-read keys, a spend ceiling, a pricing
table that refuses to invent a figure, provenance on every asset, and an
invariant that no elimination from the chain is ever silent. It is a good
implementation of `generative-provider-routing/capability-to-vendor-plan` and
`non-silent-elimination` and it did not need changing.

**Rows 1–3 had none of it.** Two route handlers each did `import { runClaude }`,
each hard-coded `kind: "local-claude-code"` into the receipt they return to the
client, and each carried its own copy of

```ts
const status = e.kind === "not-installed" || e.kind === "not-logged-in" ? 503 : 504;
```

— a status decision duplicated in two files with no third place owning it.

And rows 1–3 are precisely the rows that **cannot run on Cloud Run**.
`spawn("claude")` needs a binary on the host and an interactive login to
authorise it, and a managed container has neither. So the hosted posture was
blocked on exactly the two routes with no abstraction, and `/api/frames` is the
centre of gravity of the Frames step — the thing its own header calls "the
difference between a video and a narrated slide deck".

## What is switchable, what is not

| Function | Local today | On Google Cloud | Verdict |
| --- | --- | --- | --- |
| recalibrate (edit plan) | `claude` CLI on the seat | Gemini `responseSchema` | **switchable, and an upgrade** |
| frames (scene direction) | `claude` CLI on the seat | Gemini | **switchable** |
| imaging recognize | Qwen | Gemini | **already switched** — the prod row |
| imaging generate / edit | Google AI Studio | same endpoint | **already portable** |
| music generate (Score cues) | ElevenLabs | **Lyria 3, on the key we already hold** | **partial** — the `cueToPlan` doctrine survives, the wire format does not |
| music compose / section edit | ElevenLabs stored-song inpainting | — | **not achievable** |
| music SFX | ElevenLabs | — | **not achievable** |
| local video / foundry | Ollama + ComfyUI, VRAM-guarded | needs a GPU | **not achievable in limited scope** |
| `claude` CLI as engine | subscription seat | cannot spawn a binary | **structurally impossible** |
| Firebase auth | optional (`NEXT_PUBLIC_LOCAL_MODE`) | Firebase *is* GCloud | **native** |
| project storage | browser IndexedDB | needs Firestore/GCS to be multi-device | **out of scope here** — the video plan's decision 3 already points at object storage |

The genuinely impossible list is short and specific: **spawning the CLI**,
**ElevenLabs' section-edit and SFX product surfaces**, and **local GPU video**.
Everything else is an adapter.

One line in that table is worth pulling out. The recalibrate route's header has
always recorded a cost it pays for the CLI engine: *"No `output_config.format`,
so the plan's shape is a REQUEST, not a guarantee."* Gemini's
`generationConfig.responseSchema` constrains decoding. **The cloud rung is not a
consolation prize on this turn; it is strictly better at the one thing that turn
cares most about.** That is unusual enough to say out loud, because it inverts
the assumption that a fallback is a degradation.

## What was built

`lib/text/` — the imaging seam's sibling, deliberately down to the field names,
so nobody has to learn two dialects for one app.

```
lib/deployment.ts          can this process spawn a local binary, and why not
lib/capabilities.ts        what this deployment can actually do
lib/text/types.ts          the vocabulary
lib/text/env.ts            local | cloud posture, and whose credential
lib/text/errors.ts         one taxonomy, one status map
lib/text/pricing.ts        one place a price lives; never invent one
lib/text/http.ts           POST-JSON, one attempt by default
lib/text/json.ts           schema validation, TextError-flavoured
lib/text/log.ts            one line per turn; never the prompt
lib/text/router.ts         the chokepoint and the ladder
lib/text/providers/claudeCli.ts   rung 1
lib/text/providers/google.ts      rung 2
```

### The ladder (`agent-cli-transport/fallback-ladder`)

```
rung 1  preferred   claude-cli   the operator's seat. Nothing leaves the host.
rung 2  alternate   google       a metered key. The only rung Cloud Run can serve.
rung 3  floor       — ABSENT ON PURPOSE. See below.
rung 4  refusal     an error naming every candidate and why each dropped out.
```

**There is no rung 3, and that is a decision rather than an omission.** The
technique's floor is a deterministic stand-in that keeps a product demonstrable
with no model at all. Neither turn here has an honest one. There is no heuristic
that writes an edit plan over a creator's notebook — and for scene direction the
repo has already run the experiment: `/api/frames`'s header records that the
first version *was* a rule table ("nine roles, nine canned compositions") and
that it produced "a narrated slide deck", which is the defect the model was
brought in to fix. Shipping that table back as a silent floor would reintroduce
the original failure wearing a fresh coat of paint. So `LadderRung` has no
`floor` member, and the bottom of the ladder is the technique's rung 4.

The two properties that make it a ladder rather than a pile are enforced in the
router, not left to callers:

- **Selection is inspectable.** `provenance.rung` and `provenance.transport`
  travel with every answer, into the route's `engine` receipt, and — for
  recalibrate — onto the version the client stages. `receiptOf()` renders it. A
  cloud answer rendering indistinguishably from a local one is what the
  technique calls the ladder's cardinal sin.
- **Descent has a reason.** Every elimination lands in a trail with a typed
  `why`, and the five availability reasons are kept distinct: `no-key`,
  `not-installed`, `not-logged-in`, `policy-forbidden`, `managed-platform`.
  Collapsing them is how an offline policy flag gets deleted by someone
  repairing the wrong cause.

### One predicate, shared

`lib/deployment.ts` answers "may this process spawn a local binary" and nothing
else re-derives it. The technique names this failure directly — one copy in the
main path, another in a feature added later, and then they drift. It lives above
`lib/text/` because the answer is a property of the deployment, not of the text
engine: when the video seam promotes the local ComfyUI rig to a provider
(`docs/video-generation-plan.md`, decision 1) it asks this same function.

It also keeps `policy-forbidden` and `managed-platform` apart, because the
remedy for one is a flag and the remedy for the other is a different host.

### Auth is the economics (`subscription-auth-selection`)

The spawned child inherits this process's environment, and tools in this class
**prefer a metered API key over the seat session when both are visible**. So an
`ANTHROPIC_API_KEY` present for an unrelated reason — a sibling project's
`.env`, a shell profile, a CI secret for something else — would have silently
moved every recalibration from the operator's flat-rate subscription onto
per-token billing. Nothing would break; the bill would change shape, quietly,
while the receipt still said `local-claude-code`.

`lib/claudeCli.ts` now strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`ANTHROPIC_BASE_URL` and `ANTHROPIC_CUSTOM_HEADERS` from the child environment,
at the single spawn door, so no call site can forget it.

### Misconfiguration must not select the floor

The technique warns that "the subtlest route to the bottom rung is a knob, not
an outage": a timeout read as *kill instantly* fails every call in milliseconds
and routes the whole product to its fallback, permanently, with a probe that
still reads green. Both `runClaude` and the router now **floor** a nonsensical
ceiling to a sane minimum rather than honouring it. `TEXT_ENV` falls through to
the platform reading on a garbage value for the same reason in reverse — a typo
must never start spending.

### Turn classification (`model-routing/turn-classification`)

`TurnClass` is a closed vocabulary — `edit-plan`, `scene-direction`, `probe` —
and it is what routing, model selection, pricing and the log all key on. Before
it, the two call sites were distinguishable only by which handler they came
from, so spend could not be attributed and a routing rule could not be written
for one and not the other.

The model split is a **capability floor** (`model-routing/capability-floors`),
not a cost preference: an edit plan is validated, applied to a manuscript and
persisted as a version, so a weaker model's output is expensive to discover;
scene direction is reviewed frame by frame in the Lightbox before anything is
generated from it.

### Pricing: honest absence

`lib/text/pricing.ts` follows `lib/imaging/pricing.ts`'s rule verbatim — never
invent a price — and every cloud row is therefore **deliberately unpriced with
its reason stated**. Nobody on this tree has measured a Gemini text rate, and
`/api/recalibrate` returns its cost to the client, which stages it onto the
version it creates. A guessed figure would be *persisted beside a creator's work
as though it were fact*. The local rung needs no row at all: the CLI reports
`total_cost_usd` per run, which is vendor-reported and better than any table.

### What never reaches a log

A reasoning prompt here is the creator's entire notebook, script and unpublished
research — `/api/recalibrate` measured one at 40,384 characters of exactly that.
It is the most sensitive payload this application handles. `lib/text/log.ts`
logs `promptChars` and nothing else about it: not truncated, not hashed, not the
first line. `TextError.detail` (raw vendor bodies) is never logged at all.

## Capability flags, and what they are not

`lib/capabilities.ts` is one table, read by surfaces, that says what this
deployment can do. The playground's three ElevenLabs-only panels now render as
*absent and explained* rather than as buttons that answer 503 after someone has
composed something.

They are **not a security boundary**, and the module says so at the top: hiding
a control does not disable a route. Every money route stays gated by
`lib/apiAuth.ts` and fails closed on its own. These flags are for the honest
surface; the gate is for the door.

Every flag defaults to **on**, so a normal checkout is unchanged with no
configuration. A hosted deployment turns off what it genuinely cannot do, in its
own environment, where somebody has thought about it. Defaulting the other way
would mean guessing the posture from a client bundle that cannot see it.

## What this change does not do

- **It does not port the music seam.** `/api/music/*` still speaks ElevenLabs
  only. Two of its four routes have no cloud equivalent at all. The other two
  now have a clearer path than when this was written: the roster pass found
  `lyria-3-clip-preview` and `lyria-3-pro-preview` on the **same key this app
  already holds**, so a Score-phase port needs an adapter rather than a new
  credential or a new account. That is a separate piece of work, and "the model
  is reachable" is not yet "this app can drive it".
- **It does not add a Vertex path.** The cloud adapter speaks Google AI Studio,
  the same surface and the same credential the imaging seam already uses, so the
  app holds one Google key and one auth model. `BASE` is a variable and auth is
  a single header, so Vertex is a second base URL and a bearer rather than a
  rewrite — but nobody has needed it yet.
- **It does not move storage.** Projects still live in IndexedDB. Multi-device
  is a Firestore/GCS decision the video plan's decision 3 already anticipates.
- **It does not price the cloud rung.** The token counts arrive on every call;
  the published per-token rate is unread. See below.

## The verification pass (added 2026-08-27, after a key arrived)

`npm run verify:text` exists because two files — `providers/google.ts`'s
`MODEL_FOR_TURN` and `pricing.ts`'s rows — carry dated measurements and tell the
reader to *re-run the pass*, and a comment naming a pass nobody can run is
folklore. Free by default; `--roster` lists what the key reaches; `--spend`
sends real turns.

It was worth writing immediately, because it found three defects in code that
had already typechecked, linted and built clean.

**1 · A model id that does not exist.** The first draft named `gemini-3.6-pro`
for the `edit-plan` turn. `models.list` returns 52 models and that is not one of
them — every recalibration on the cloud rung would have 404'd, and nothing would
have said so until a creator clicked Recalibrate. This is exactly what
`dated-capability-matrix` exists to prevent, and the fix is that the table is now
a measurement:

| id | result |
| --- | --- |
| `gemini-3.6-flash` | 200 · 4.7s · native schema honoured — **scene-direction** |
| `gemini-3.1-pro-preview` | 200 · 15.5s · native schema honoured — **edit-plan** |
| `gemini-3.7-flash` | 503 "experiencing high demand" — newest, not dependable |
| `gemini-pro-latest` | 200 · 63.3s · a floating alias — rejected, see below |
| `gemini-2.5-pro` | 404 "no longer available to new users… use `gemini-3.1-pro-preview`" |

`gemini-pro-latest` works and is still not used: it is an alias that moves under
you, and `model-routing/model-identity` is explicit that "measured history resets
when a roster label changes". A turn whose price this app records has to name a
model that means the same thing next week.

**2 · Thinking tokens were not being counted.** Every model on this roster
reasons before it answers, and that reasoning is in `usageMetadata.thoughtsTokenCount`,
not `candidatesTokenCount` — and it is billed as output. Measured:

```
gemini-3.6-flash        in=20  out=27  thoughts=345   (12.8× the answer)
gemini-3.1-pro-preview  in=20  out=27  thoughts=679   (25.1× the answer)
```

Pricing from `candidatesTokenCount` alone would have understated output cost by
an order of magnitude — on the one figure `/api/recalibrate` persists onto a
creator's version. The adapter now sums both before pricing.

**3 · The bottom of the ladder lied about its own cause.** Running case C for
real printed:

```
kind=not-installed  tried=claude-cli:policy-forbidden,google:no-key
```

An error whose `kind` contradicted its own trail. Nothing was "not installed" — a
policy flag forbade one engine and the other had no key. That is precisely the
conflation `fallback-ladder` warns about ("repairing the wrong cause is how
offline flags get deleted by well-meaning fixes"), reproduced by the function
written to prevent it. `noEngine()` now takes the kind of the candidate the
router meant to use.

### What the pass proves now

```
A · cloud posture · edit-plan
    provider=google model=gemini-3.1-pro-preview rung=preferred transport=cloud-api
    schema=native  ms=7336

B · local posture, LOCAL_BINARIES=off · scene-direction
    provider=google model=gemini-3.6-flash rung=alternate transport=cloud-api
    schema=native  ms=4199  reroutedFrom=claude-cli:policy-forbidden

C · bottom of the ladder — kind=policy-forbidden
    No reasoning engine could serve this edit-plan turn. Tried: claude-cli
    (policy-forbidden), google (no-key). …
```

Native schema enforcement is real, the descent is labelled and non-silent, and
the refusal names every candidate. **The cloud rung is verified.**

### The key itself

The key in `.env` is a valid AI Studio key in Google's newer `AQ.…` format (53
chars) rather than the classic `AIza…` (39). It authenticates with
`x-goog-api-key`, which is what the adapter already sends — **no new key needs
generating**. It does *not* work as `Authorization: Bearer` (401,
`API_KEY_SERVICE_BLOCKED`), which is the expected result for an API key rather
than an OAuth token, and is why a Vertex path would need genuinely different
credentials rather than this one.

### What remains unpriced, and why that is still correct

Every `google` row in `pricing.ts` is `unpriced` with its reason stated. That is
now a *narrower* gap than it was: the token counts are real and arrive on every
call, so only the **rate** is missing. Nobody here has read the published
per-token price, and a guessed figure would be persisted beside a creator's work
as fact. Filling in `usdPerMInput`/`usdPerMOutput` from `ai.google.dev/pricing`
and setting `checked` starts pricing every turn with no other change.
