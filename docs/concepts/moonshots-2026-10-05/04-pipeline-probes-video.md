# Moonshot cards · Pipeline Probes Video

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

### production-script-probes-A · Turn contracts: one server-owned schema, prompt and validator per TurnClass

**Context:** production-script-probes · **Slot:** A architecture
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** contract
**Registry:** software-engineering/structured-output#schema-validation-and-repair (laws one-validation-door, one-authority-per-vocabulary); software-engineering/prompt-assembly

**Summary.** Every LLM turn has its schema, its prompt and its validator in three different places, and sometimes in different processes. The schema even arrives from the browser. Collapse each `TurnClass` into one server-side contract module, and the probe lane can then generate adversarial outputs from the contracts instead of hand-writing them per parser.

**Premise (verified).**
- `lib/text/types.ts:114-121` - `TurnClass` is a closed set of 7 turns (edit-plan, scene-direction, style-synthesis, research, sound-hunt, sound-lesson, probe). Nothing maps a turn to its schema or parser.
- `app/api/frames/route.ts:162` writes `JSON.stringify(body.schema ?? {})` straight into the paid prompt, and `:196-203` says the handler got the schema "as opaque JSON from the client". `app/_phases/frames/useFrames.ts:586` is where the browser posts `SCENE_SCHEMA`. So whatever the client sends is the instruction the model obeys.
- `app/_phases/script/editPlan.ts:53-94` declares `additionalProperties: false`, but the hand validator at `:320` never enforces it. `tests/golden-path/edit-plan-parse.probe.spec.ts:71-88` pins that gap as "BOUNDARY" behaviour.
- `lib/imaging/json.ts:71` and `lib/text/json.ts:39` are two copies of `parseAgainstSchema`, and both check top-level `required` only.
- `tests/golden-path/format-brief.probe.spec.ts:32` and `:178` match substrings in the route's source, because prompt assembly happens inline in `route.ts` and Next forbids extra exports there. The prompt cannot be observed. All a probe can see is the text of the code.

**The move.** New `lib/turns/` with:
- One file per turn, `lib/turns/<turn>.ts`, each exporting a `TurnContract`: `{ turn, schema, compile(input): string, parse(raw, ctx): T, samples: { valid: T[] } }`.
- `lib/turns/registry.ts`, holding `TURNS: Record<TurnClass, TurnContract>`. Because the record must cover every turn, a new turn without a contract fails typecheck.
- `lib/turns/validate.ts`, the single door. It is a strict validator for the JSON-Schema subset the repo actually uses (type, required, enum, items, minItems, integer, additionalProperties) and replaces both `parseAgainstSchema` copies. Each contract's `parse` adds its domain and reference checks after shape, as `parseEditPlan` already does for marks.

Routes become adapters: `TURNS["scene-direction"].compile(input)`, and the schema never crosses the wire. `useFrames` stops sending `schema`. Its `beatAt` reconciliation moves into the contract's `parse`, run server-side, and the route returns the parsed specs plus the rejections.

In the probe lane, `turn-contracts.probe.spec.ts` iterates `TURNS`. For each valid sample it mutates once per rule: drop each required path, wrong type per field, out-of-enum value, extra property, fenced, prose, truncated. Each mutation must be rejected with a named path. Compiled prompts are checked as approval snapshots (test-harness#approval-snapshots-with-guarded-update), replacing the source-substring checks.

**Why it is a moonshot / what it unlocks.** Today the structured-output contract has to be rediscovered for each parser. After this move a new turn is covered as soon as it exists. Prompt changes show up as reviewable diffs. Closing the client-authored-schema hole turns the paid route into a fixed contract. Every later LLM feature (motion direction, sound lessons) gets validation, probes and snapshots without extra work.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Add a `TurnClass` member with no `TURNS` entry -> `npm run typecheck` fails.
2. An edit-plan with `edits[0].bogusField` -> rejected with path `edits[0].bogusField`. The BOUNDARY probe is inverted.
3. For every contract, remove any required path from a valid sample -> rejected, and the message names that path.
4. POST `/api/frames` with `schema: {}` -> the compiled prompt still carries the server's `SCENE_SCHEMA` byte for byte.
5. `TURNS["scene-direction"].compile(fixture)` equals its approved snapshot, and the format block sits above `## THE SCRIPT`.
6. A nested `required` omission that the shallow imaging validator accepted -> rejected by `validate.ts`.
7. `parseEditPlan`'s existing cases (`names no beat`, missing `why` wins over a bad mark) still pass through the contract.

**Write set.** new: `lib/turns/registry.ts`, `lib/turns/validate.ts`, `lib/turns/scene-direction.ts`, `lib/turns/edit-plan.ts`, `lib/turns/research.ts`, `lib/turns/sound-hunt.ts`, `tests/golden-path/turn-contracts.probe.spec.ts`. Edit: `app/api/frames/route.ts`, `app/api/recalibrate/route.ts`, `app/_phases/frames/useFrames.ts`, `app/_phases/script/editPlan.ts`, `lib/imaging/json.ts`, `lib/text/json.ts`, `tests/golden-path/edit-plan-parse.probe.spec.ts`, `tests/golden-path/format-brief.probe.spec.ts`.

**Risks & rollback.** A strict door may reject outputs the tolerant parsers accepted, so live turns could start failing. Mitigation: ship the stage that keeps extra properties "ignored and counted" first (the technique's stated policy), then make it strict. The frames request shape changes, which is a contract gate, and older tabs posting `schema` must be tolerated and ignored. Rollback: routes keep their old inline assembly behind the contract call for one release, so reverting is a single file per route.

**First session dispatch.**
Read `lib/text/types.ts:114`, `app/api/frames/route.ts:100-215`, `app/_phases/frames/useFrames.ts:570-640`, `app/_phases/script/editPlan.ts:53-420`, and the registry technique structured-output/schema-validation-and-repair.
Build `lib/turns/validate.ts` and the `edit-plan` contract first, then invert the BOUNDARY probe so it fails.
Then move scene-direction server-side.
Gate: `npm run typecheck && npm test`.

_Runner-up:_ A shared verdict kernel (`lib/verdict.ts`: pass/violation/unmeasured/not-engaged plus `examined`) used by `shotReview`, `trailer/structure` and the gate checks, with one honesty probe over every checker.

### production-script-probes-B · Studio journey lane: one hook harness, cross-step joins, derived hook coverage

**Context:** production-script-probes · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 7/10 · **Impact:** 8/10 · **Risk:** 4/10 · **Gate:** architecture
**Registry:** software-engineering/test-harness (#assert-through-the-reader, #derived-selection-must-be-measured, #isolation-lanes)

**Summary.** This repo's worst defects sat in the JOINS between steps, and the node lane can drive only two of the app's 29 hooks, through a dispatcher copy-pasted between two files. Turn that dispatcher into a shared studio harness. Use it to run a Step 1 -> 5 journey over one project record, and derive hook coverage from the filesystem.

**Premise (verified).**
- `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts:60-154` has a private React dispatcher. `tests/golden-path/score-spot-origin.probe.spec.ts:276-369` is a forked copy, described at `:267` as "the harness ... plus `useRef`".
- `find app -name "use*.ts*"` returns 29 hooks. Only `useTrailerCut` and `useScoreSpots` are driven. `cut.probe.spec.ts:30-31` imports only pure helpers from `useCut` and `useTakeAudio`.
- `tests/golden-path/frames-cut-resolution.probe.spec.ts:3-16`: the shot lane was "UNREACHABLE from real project data" while its unit probe passed. The JOIN was the defect.
- `tests/golden-path/score-spot-origin.probe.spec.ts:22-29` says no project in this build "can produce both halves at once". That cross-step gap exists only as prose.
- `app/_phases/frames/useFrames.ts:596`: "A SEAM THIS DOES NOT CLOSE: the beats come from `render`, a fixture". The hook calls `fetch("/api/frames")`.
- `lib/text/router.ts:204`: `reason()` is the only entry point and has no injection seam (no `__` exports), so no hook that reaches a turn can be driven offline.

**The move.** New `tests/golden-path/_studio/`:
- `hooks.ts`: the one dispatcher (useState, useEffect, useMemo, useCallback, useRef, useReducer) with the install assertion. Both existing copies are deleted.
- `routes.ts`: an in-process `fetch` that maps `/api/*` to the real route handlers. It is derived by walking `app/api` the way imaging-auth does.
- `engine.ts`: a scripted text engine served by an explicit test seam in `lib/text/router.ts` (`__useScriptedEngine(map)`), which refuses to arm when `NODE_ENV === "production"`.
- `journey.ts`: runs one project id through beat picks -> `useTrailerCut` -> `useFrames` -> `useScoreSpots` -> `useCut` over `fake-indexeddb`.

New probes:
- `studio-journey.probe.spec.ts` asserts each join from the stored record. It keeps a `KNOWN_BREAKS` ratchet (shape of `BENIGN_SILENCE` in followup-revisions), each entry with its reason, so the useFrames fixture seam becomes a named, counted break.
- `hook-coverage.probe.spec.ts`: every `app/**/use*.ts` is driven through the harness or exempted with a reason, and a stale exemption fails.

**Why it is a moonshot / what it unlocks.** Seam defects become red tests instead of comments. A step stops being "done" because its unit probes pass, and is done only when the next step can read what it wrote. The per-step growth CLAUDE.md predicts (motion, score, cut each growing their own directory) gets coverage when each hook is added, not in a later audit.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. The trailer-cut-lifecycle and score-spot-origin probes run on `_studio/hooks.ts` and stay green, and neither file defines `harness` any more.
2. A new `app/x/useThing.ts` with no driver and no exemption -> hook-coverage fails and names it.
3. Trailer journey: picks -> stored `script-trailer` -> `useFrames` yields shots > 0 read from the record.
4. Explainer journey: `useFrames` beats come from the project's own record. Today this is a `KNOWN_BREAKS` entry citing `useFrames.ts:596`. Once the seam is fixed, the stale entry fails.
5. The scripted engine refuses to arm under `NODE_ENV=production`.
6. `useFrames` posting 5,000 beats goes through the real route in-process -> the hook's error state carries `too-large`.

**Write set.** new: `tests/golden-path/_studio/hooks.ts`, `tests/golden-path/_studio/routes.ts`, `tests/golden-path/_studio/engine.ts`, `tests/golden-path/_studio/journey.ts`, `tests/golden-path/studio-journey.probe.spec.ts`, `tests/golden-path/hook-coverage.probe.spec.ts`. Edit: `lib/text/router.ts`, `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts`, `tests/golden-path/score-spot-origin.probe.spec.ts`.

**Risks & rollback.** A React upgrade can move the dispatcher slot. The install assertion makes that a single, loud tooling failure. A test seam in the router is a production-surface change, so it must be inert outside tests and asserted to be. The serial lane already shares `fake-indexeddb`, so the journey must clear STEPS_STORE per test. Rollback: the harness is additive, and deleting `_studio/` restores today's lane.

**First session dispatch.**
Read `tests/golden-path/trailer-cut-lifecycle.probe.spec.ts:51-187`, `score-spot-origin.probe.spec.ts:260-400`, `app/_phases/frames/useFrames.ts:540-640` and `lib/text/router.ts:195-260`.
Extract `_studio/hooks.ts` first and migrate both probes (behaviour-preserving).
Then add hook-coverage with a full exemption list, and let the journey shrink that list.
Gate: `npm test`.

_Runner-up:_ A fixture-contract module. The "the fixture still has the shape this probe is about" guards copied into a dozen probes become one shared assertion per app fixture (RENDERS, CANNED, buildCards, GLASS_HARBOR).

_Checked:_ Read in full: frames-cut-resolution, frames-run-bounded, render-budget, shot-decomposition, trailer-cut-lifecycle, trailer-structure-honesty, cut-nudge-batching, edit-plan-chain-seam, edit-plan-parse. Skimmed headers and test lists: style-extract, extract-refinish, extract-step-lock, format-brief, followup-revisions, followup-standing, scope-consequences-copy, scope-decisions. Traced editPlan.ts (schema and parser), both `parseAgainstSchema` copies, frames route prompt assembly, the useFrames client schema post, `TurnClass` and `reason()`, the hook inventory, and the second harness copy in score-spot-origin. Noted that render-budget is a projects-shelf probe misfiled in this context.

## imaging-music-probes

### imaging-music-probes-A · One meter kernel for every vendor balance, proven by one conformance kit

**Context:** imaging-music-probes · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 8/10 · **Risk:** 5/10 · **Gate:** architecture
**Registry:** software-engineering/cost-metering#unit-classes-are-open, #reversible-debit-and-settle, #budget-enforcement

**Summary.** Imaging, music and text each have their own budget, price table, scrubber, settle line and error taxonomy. They have drifted apart: music checks the ceiling and then books, with no hold, and cloud text turns have no ceiling at all. Extract one unit-polymorphic meter kernel, and replace the mirrored probes with one conformance kit run against every meter.

This adopts the imaging-service backlog's hold-reservation idea and goes materially beyond it. The hold model already in imaging becomes the kernel for every meter, and it adds a meter that does not exist yet.

**Premise (verified).**
- `lib/imaging/budget.ts:338-435` already has `reserve` / `release` / `settle` holds, used at `lib/imaging/router.ts:311`.
- `lib/music/elevenlabs.ts:101-122` calls `assertWithinMusicBudget` and then `recordMusicSpend` after the vendor answers. That is check-then-act with no hold, so two concurrent renders both pass the ceiling.
- `lib/text/` has no budget module. `lib/text/pricing.ts:15-24` leaves cloud rows deliberately unpriced, and `lib/text/log.ts:136-145` carries token counts that no ceiling reads, so cloud text spend is unbounded.
- `liveSecrets` / `scrub` / format are copied three times: `lib/imaging/log.ts:50,64,102`, `lib/music/log.ts:61,71,113`, `lib/text/log.ts:62,101,152`.
- There are three `ErrorKind` unions, each with its own `statusFor`: `lib/imaging/errors.ts:15,160`, `lib/music/errors.ts:11,35`, `lib/text/errors.ts:30,173`.
- The probes mirror each other. `imaging-log-line.probe.spec.ts:17` and `music-log-line.probe.spec.ts:15` restate "a missing number is never a zero", and imaging-budget and music-budget restate the ceiling, window and counter cases.

**The move.** New `lib/meter/`:
- `units.ts`: `usd | seconds | tokens | credits`, plus an `unmodeled` bucket that is counted and never dropped.
- `kernel.ts`: `createMeter({ name, unit, ceilingVar, windowVar, floorVar?, estimate })`, returning `reserve`, `release`, `settle`, `stats`, `rows`, `byAxis` and `__reset`.
- `settleLine.ts`: `scrub` over the registered key vars, `oneLine`, and `formatSettle` with per-meter fields.
- `errors.ts`: a shared core `SpendErrorKind`, plus `statusFor` and `billedOnFailure`, with per-domain extensions.
- `registry.ts`: `METERS`.

The three domain modules shrink to instantiations. Music moves onto holds. Text gets a `tokens` meter on the `cloud-api` rung (estimate from `promptChars`, settle on reported tokens), and local-subprocess turns are booked but not capped. In the probe lane, `tests/golden-path/_meterKit.ts` exports `meterConformance(meter)` (around 15 named cases), and `meter-conformance.probe.spec.ts` runs it for every entry in `METERS`.

**Why it is a moonshot / what it unlocks.** The next vendor (Leonardo video, sound SFX, a TTS) gets ceiling, holds, settle line, scrubbing and failure booking by registering a meter, and gets proven by the kit without any new tests. It closes two verified spend holes at once: the music race and unbounded cloud text. The operator gets one vocabulary across every balance this app can drain.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Two concurrent `composeMusic` calls at 60% of the ceiling each -> exactly one fetch, and the other call is `over-budget` with 0 fetches.
2. A cloud text turn with the token window exhausted -> `over-budget` before any fetch, while a claude-cli turn is unaffected.
3. `meterConformance` runs identical case names for imaging, music and text. A `METERS` entry with no `unit` fails to compile.
4. Any meter's settle line containing a live key -> masked. A 5,000-character multi-line message -> one line of at most 240 characters.
5. A vendor reports a unit class the row does not model -> it lands in `unmodeled` and is counted.
6. The existing imaging-budget, music-budget and three log-line probes stay green, reduced to adapter-specific cases.

**Write set.** Staged.
1. `lib/meter/{units,kernel,settleLine,errors,registry}.ts` plus `_meterKit.ts` and `meter-conformance.probe.spec.ts`, run against imaging only (no behaviour change).
2. `lib/music/{budget,log,errors,elevenlabs}.ts` onto holds (fixes the race).
3. `lib/text/{router,log,errors}.ts` plus a text meter (new ceiling var).
4. Shrink the mirrored probes.

**Risks & rollback.** A new text ceiling can refuse turns operators currently run unbounded. Mitigation: ship it with a generous default and a `stats()` row first. Folding error kinds risks HTTP status drift, so the kit asserts `statusFor` parity per kind before and after. Each stage is a separate commit and reverts on its own.

**First session dispatch.**
Read `lib/imaging/budget.ts` (whole), `lib/music/budget.ts`, `lib/music/elevenlabs.ts:60-130`, `lib/text/router.ts:195-260`, and registry cost-metering/reversible-debit-and-settle.
Write `_meterKit.ts` against today's imaging API first, then build `lib/meter/kernel.ts` until the kit passes for imaging.
Add the failing music concurrency case last.
Gate: `npm run typecheck && npm test`.

_Runner-up:_ A declared spend-route manifest (`lib/spend/routes.ts`: route -> meter, vendor, door), checked against the filesystem. It replaces the regex "money door" classification in imaging-auth.

### imaging-music-probes-B · Spend-invariant lane: one vendor boundary, generated adversarial traffic, global invariants

**Context:** imaging-music-probes · **Slot:** B-architecture (no UI surface)
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** software-engineering/test-harness (#far-side-oracle, #derived-selection-must-be-measured); software-engineering/cost-metering#spend-attribution

**Summary.** Every spend probe hand-rolls its own `fetch` stub and asserts one example per route. Install one counting vendor boundary. Generate seeded adversarial traffic over the derived set of money routes. Assert the four properties this context exists for as global invariants: no dispatch without authority, booked spend within the ceiling, ledger/log parity, and no leaked secret.

**Premise (verified).**
- 39 hand-written `globalThis.fetch =` assignments across 11 probe files. Only `music-budget.probe.spec.ts:62-74` counts invocations.
- `imaging-auth.probe.spec.ts:54-63` drives every money route with an EMPTY body by default, so the authenticated case proves "4xx, not 401" and nothing about dispatch.
- `frames-run-bounded.probe.spec.ts:57-59` treats wall-clock time (`< 2_000` ms) as evidence that nothing was dispatched. That is a timing proxy, not a counted dispatch.
- `imaging-auth.probe.spec.ts:203-246` already derives the money-route population from `app/api` by its `guardRequest` door, so a generator can read the same set.
- `imaging-budget.probe.spec.ts:282` asserts ledger/log axis parity for imaging only. No probe checks that dispatches, ledger rows and settle lines agree across meters.

**The move.**
- New `tests/golden-path/_vendor.ts`: one boundary installed per file. It intercepts `fetch` for every vendor host (Google, Leonardo, Qwen, ElevenLabs, local ollama) and the `claude` spawn (through a `lib/claudeCli.ts` spawn seam, with `LOCAL_BINARIES=off` as the default). Every dispatch is recorded as `{ host, route, at }`, answers come from a scripted status/body table, and state restores automatically.
- New `tests/golden-path/_routes.ts`: the filesystem walk lifted out of imaging-auth.
- New `spend-invariants.probe.spec.ts`: a seeded PRNG builds sequences of auth variants, body sizes, concurrent bursts and vendor outcomes (200, 429, 451, 500, mid-body stall). After each sequence it checks:
  - I1: every 401/413/402/limiter-429 has zero dispatches.
  - I2: per meter, the window ledger total is at most the ceiling plus one maximum estimate.
  - I3: dispatches equal served rows plus billed-on-failure rows.
  - I4: one settle line per dispatch.
  - I5: no line contains the configured secret.
  - A failing seed prints `SPEND_SEED=<n>` so it can be replayed.

**Why it is a moonshot / what it unlocks.** The lane stops checking example cases one at a time and starts checking whole-system properties. A new money route, vendor or failure kind is exercised as soon as it lands. The race in card A becomes a measured red here, and later probes can delete their own fetch plumbing.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. 20 unauthenticated POSTs spread over every derived money route -> 0 dispatches (I1).
2. The frames 413 case is asserted as dispatches == 0, and the `< 2_000` ms proxy is removed.
3. Two concurrent music generates at 60% of the ceiling -> I2 holds. This is marked `test.fail` with its reason until a music hold lands.
4. An imaging generate answered 500 -> exactly one failed, billed ledger row and one settle line (I3, I4).
5. The same `SPEND_SEED` reproduces the same sequence and verdict.
6. A new `app/api/x/route.ts` calling `guardRequest` joins the generated population with no list edit.

**Write set.** new: `tests/golden-path/_vendor.ts`, `tests/golden-path/_routes.ts`, `tests/golden-path/spend-invariants.probe.spec.ts`. Edit: `lib/claudeCli.ts` (spawn seam), `tests/golden-path/imaging-auth.probe.spec.ts` (import the walk), `tests/golden-path/frames-run-bounded.probe.spec.ts`, `tests/golden-path/music-budget.probe.spec.ts`, `tests/golden-path/music-failure-classification.probe.spec.ts`.

**Risks & rollback.** Generated sequences can be slow in a serial lane, so cap sequences per run and print the seed. A boundary that misses a host reports a clean run, so assert that the boundary saw at least one dispatch per vendor in a control sequence. Rollback: the lane is additive, and the old per-file stubs stay until migrated.

**First session dispatch.**
Read `tests/golden-path/imaging-auth.probe.spec.ts:1-330`, `music-budget.probe.spec.ts:55-200`, `frames-run-bounded.probe.spec.ts` and `lib/claudeCli.ts`.
Build `_vendor.ts` with dispatch counting and the control-sequence self-check first, then I1 over the derived routes.
Gate: `npm test`.

_Runner-up:_ Vendor wire cassettes. An opt-in `npm run test:live` recorder captures real ElevenLabs, Gemini and Leonardo exchanges, the node lane replays them through the real adapters, and drift is reported when a refresh changes a shape.

_Checked:_ Read in full: imaging-auth (1-330 plus the test list). Read headers and test lists: imaging-budget, imaging-log-line, imaging-reference-roles, imaging-ssrf, music-budget, music-cue-brief, music-cue-provenance, music-failure-classification, music-log-line. Traced lib/imaging/budget.ts exports and holds, lib/music/budget.ts plus the elevenlabs check-then-act path, lib/text pricing and log (no ceiling), the three log, errors and http copies, and the fetch-stub census across tests/golden-path.

## video-clip-pipeline

### video-clip-pipeline-A · Clip take ledger: N seeds, persisted verdicts, adoption with waivers

**Context:** video-clip-pipeline · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** architecture
**Registry:** media-generation/generated-output-grading#regrade-without-regenerate; media-generation/review-iteration-loops#gate-record-outlives-the-media

**Summary.** The pipeline keeps one raw per preset and overwrites it on re-render. It computes a quality verdict that nothing stores and that the build never reads. As a result, clips its own checker would fail ship silently. Make takes, verdicts and adoption a durable record: render N seeds, grade once, adopt one with a waiver if needed, and let the manifest and the gate carry it.

**Premise (verified).**
- `pipeline/video/render_preset_clips.py:230-234` writes exactly one `<id>.<ext>` and unlinks any other. `:179` says reseeding is manual ("A bad draw is redrawn"), and `README.md:311-314` records signal-ledger needing four hand-driven seeds.
- `pipeline/build-preset-clips.mts:65-78` and `:136-144` build the manifest entry with `route` only. Seed, engine, prompt and every quality number are dropped, and `clip_check.py` is never invoked.
- `pipeline/video/clip_check.py:101-106` sets `PALETTE_FLOOR = 0.55`, but `README.md:296-297` shows signal-ledger at 0.18 and chalk-argument at 0.42. Both are in `public/clips/manifest.json` and both shipped.
- `pipeline/check-clips.mjs:16-24` gates weight, completeness and shape only. Quality is not in the gate.
- `pipeline/video/render_preset_clips.py:88-105` regex-parses `app/library/presets.ts`. `pipeline/video/compose_clip.py:250` and `:270` cache `author.json` and `plate.png` keyed by slug alone, so a different model or seed silently reuses a stale read or plate.

**The move.**
- Raws move to `pipeline/runs/preset-clips/<id>/takes/<engine>-<seed>.{webm,json}`, never overwritten. `render_preset_clips.py --takes N` renders seeds from a deterministic list.
- New `pipeline/video/ledger.py`: one `<id>/ledger.json` with `{ takes: [{ file, engine, seed, prompt, route, check: {…, checker: <version>} }], adopted: { take, waiver? } }`.
- `clip_check.py --regrade <id>` re-reads the existing bytes and rewrites `check` without re-rendering (regrade-without-regenerate).
- `build-preset-clips.mts` squeezes only the ADOPTED take, refuses `check.ok === false` without a `waiver` reason, and copies `{ engine, seed, prompt, route, check | waiver }` into the manifest.
- `check-clips.mjs` fails an entry that carries neither a passing `check` nor a waiver. Each waiver is a reviewed claim, in the same shape as `DELIBERATELY_PUBLIC`.
- Presets come from `npx tsx` emitting JSON. The regex goes.
- Compose caches are keyed by `(slug, model, seed)`.

**Why it is a moonshot / what it unlocks.** Clip quality becomes a recorded, gated fact rather than README prose. "Render 6 seeds overnight, wake to a graded slate" becomes a single command. Operator taste calls (the chalk-argument hand) become durable waivers instead of lost context. The same ledger is the substrate for card B and for any second clip surface.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `--takes 4 --only signal-ledger` -> four distinct take files and four ledger rows, with nothing overwritten.
2. `clip_check --regrade signal-ledger` -> every take's `check` is updated, and take file mtimes are unchanged.
3. An adopted take with `check.ok=false` and no waiver -> `build-preset-clips` exits 1 and names it.
4. A manifest entry without `check` or `waiver` -> `check-clips` exits 1, and `npm run verify` is red.
5. The two shipped palette failures appear as waivers carrying the operator's reason, or as re-adopted passing takes.
6. A preset whose `motion` line contains an escaped quote and a newline -> read correctly from the tsx-emitted JSON.
7. A stdlib-only selftest case (in the shape of `pipeline/foundry/selftest.py`) exercises ledger adopt/waiver logic with no GPU.

**Write set.** new: `pipeline/video/ledger.py`, `pipeline/video/selftest.py`. Edit: `pipeline/video/render_preset_clips.py`, `pipeline/video/clip_check.py`, `pipeline/video/compose_clip.py`, `pipeline/build-preset-clips.mts`, `pipeline/check-clips.mjs`, `public/clips/manifest.json`, `pipeline/video/README.md`.

**Risks & rollback.** Takes multiply raw disk use, so keep them gitignored as today and add a `--prune-unadopted`. A quality gate in `verify` must not need numpy, so `check-clips` reads the stored verdict and never re-measures. Rollback: the manifest fields are additive, and the old single-raw layout can be read as "one take, adopted".

**First session dispatch.**
Read `pipeline/video/README.md`, `render_preset_clips.py`, `clip_check.py`, `pipeline/build-preset-clips.mts` and `pipeline/check-clips.mjs`.
Build `ledger.py` and the selftest first, then make `build-preset-clips` refuse an unjudged adoption.
Gate: `npm run check:clips`, plus `python pipeline/video/selftest.py`.

_Runner-up:_ One resumable `pipeline/video/clip.py` job that sequences the ollama-then-ComfyUI co-residence (read -> plate -> render -> retime -> check) with a checkpoint per unit, replacing today's manual multi-process choreography.

### video-clip-pipeline-B · The Motion step: frames become clips, graded and adopted inside the studio

**Context:** video-clip-pipeline · **Slot:** B experience
**Size:** XL · **Effort:** 9/10 · **Impact:** 9/10 · **Risk:** 7/10 · **Gate:** direction
**Registry:** media-generation/video-assembly#generated-shot-sourcing (designed graphic must stay exact; refusal-is-a-state); media-generation/production-pipeline-phasing#long-run-as-background-job

**Summary.** The studio lets a creator author motion for every frame and then renders nothing, and says so in its own code comments. Meanwhile this pipeline already has the stages that work: read-then-propose motion, compose for designed graphics, i2v, retime, and a quality checker. Graduate it into the missing `motion` step, from frame to proposed motion to background render to graded takes to adopted clip on the Cut timeline.

**Premise (verified).**
- `lib/projects.ts:39`: `PHASES = ["research","script","frames","score","cut"]`. There is no motion step, though CLAUDE.md names it.
- `app/_phases/frames/FramesAssembly.tsx:452-458`: "There is no render button under this box and there will not be one until something can render it." `LayerPanel.tsx:95-100` records "the render seam is unbuilt".
- `app/_studio/projectTypes.ts:21` defines `ClipStatus` with `rendered | rendering | failed`, but nothing under `app/_phases/frames` ever sets those values. `frames.ts:112` `emptyClip()` is the only producer.
- `app/_phases/frames/shots.ts:20-31` seeds `Shot.motion` empty "until a human or a direction pass writes it". `pipeline/video/motion_author.py` is that direction pass (READ the image -> PROPOSE named-element motion).
- `pipeline/video/README.md:120-146`: `compose_clip.py` holds a designed graphic's background bit-identical, and `:207-212` says the author "cannot decline", a gap the product version must close.
- `app/api/foundry/training/route.ts` plus `lib/foundry/store.ts:53` are precedent for the app reading GPU-side runs that local runners leave on disk.

**The move.** Staged, direction-gated.
1. `app/_phases/motion/` plus `motion` in `PHASES` between frames and score, with old records defaulting to `empty`. A `motion-direction` turn uses lib/imaging `recognize` to port motion_author's two passes and returns a proposed `FrameClip.motion` with a `basis`, or `declined` with a reason. The creator accepts or edits.
2. A durable render queue: `foundry-out/motion/<projectId>/<frameId>/` request files. `pipeline/video/motion_runner.py` polls them, picks a route by content class (compose for designed graphics, h3 otherwise), and writes takes plus a `clip_check` verdict (card A's ledger shape). The app polls with `guardAccessOnly`, and with no runner heartbeat the state reads `no runner`, never `rendering`.
3. A takes surface built from `components/ui/signal/` (Tally, StaleBadge, Provenance) with keyboard adoption. An adopted take sets `clip.status = "rendered"`.
4. Cut reads adopted clips onto a picture track whose duration is the frame's hold.

**Why it is a moonshot / what it unlocks.** The studio's single biggest absence, moving pictures, is closed with machinery this repo has already measured. The pipeline stops being a six-swatch side project and becomes the product's motion engine. Every later craft gain (dojo, H3 tuning, retime) then lands in creators' films rather than in a README.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `PHASES` contains `motion` after `frames`, and a pre-existing project record loads with `progress.motion === "empty"`.
2. `motion-direction` on a plate with no separable element -> `declined` with a reason, and `FrameClip.motion` stays `""`.
3. A queued render with no runner heartbeat -> the status word is "no runner", never "rendering".
4. A take whose check fails concentration -> cannot be adopted without a recorded override.
5. An adopted take -> `frame.clip.status === "rendered"`, and the Cut timeline lists it at the frame's hold.
6. `npm run check:narration` stays green, so the new surface adds no explanatory prose.

**Write set.** Staged.
1. `lib/projects.ts`, new `app/_phases/motion/{MotionStep.tsx,useMotion.ts,direction.ts}`, `lib/turns/motion-direction.ts` (or the router turn), `app/api/motion/direct/route.ts`.
2. New `app/api/motion/takes/route.ts`, `lib/motion/store.ts`, `pipeline/video/motion_runner.py`.
3. `app/_phases/motion/Takes.tsx`.
4. `app/_phases/cut/useCut.ts`, `app/_phases/cut/CutTimeline.tsx`, `app/_studio/projectTypes.ts`.

**Risks & rollback.** A sixth phase touches every progress consumer, so it needs a migration-default probe first. Renders take minutes and need the card, which is why stage 2 must be honest about runner absence on boxes without a GPU. Generated clips can drift off-style, so stage 3 gating on `clip_check` plus human adoption is mandatory. Rollback: stages 1-2 are invisible until stage 3 ships, and the phase can be hidden behind a flag.

**First session dispatch.**
Read `lib/projects.ts:30-80`, `app/_phases/frames/frames.ts:95-130`, `FramesAssembly.tsx:440-500`, `pipeline/video/motion_author.py` and `README.md`, and registry video-assembly/generated-shot-sourcing.
Build stage 1 only: the `motion` phase with a migration-default probe, and the `motion-direction` turn with a `declined` outcome.
Gate: `npm run typecheck && npm test && npm run check:narration`.

_Runner-up:_ A Foundry "clip bench": the take ledger rendered as a seek-locked side-by-side compare (compare.py's guarantees, in the browser) with one-key adopt and waive, replacing `compare-4way.mp4` plus hand-edited sidecars.

_Checked:_ Read in full: README.md, clip_check.py, render_preset_clips.py, build-preset-clips.mts, check-clips.mjs (gate half). Skimmed: motion_author.py, compose_clip.py (main and caches), leonardo_reference.py, retime.py, compare.py, gpu_trace.py, transcode.mjs. Traced the Frames render-seam comments, ClipStatus producers, PHASES, and the foundry disk-run precedent. Map finding: `context-map.json` lists `pipeline/video/flux_still.py`, which does not exist and has no git history, so it is a stale path that needs a delta scan. Also noted `leonardo_reference.py:52` hard-codes another user's `.env` path and spends outside the lib/imaging meter.
