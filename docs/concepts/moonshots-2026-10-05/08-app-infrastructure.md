# Moonshot cards · App Infrastructure

_Part of [the 2026-10-05 moonshot backlog](README.md). Each card is one dispatchable session; start from its **First session dispatch**._

Contexts, in order: ai-orchestration · auth-persistence · cli-infrastructure-probes.

---

## ai-orchestration

### AIO-A · AI turns run as server-owned durable jobs; the tab only watches them

**Context:** ai-orchestration · **Slot:** A architecture
**Size:** XL · **Effort:** 8/10 · **Impact:** 9/10 · **Risk:** 6/10 · **Gate:** architecture
**Registry:** software-engineering/durable-agent-operations#intent-mints-the-identity · software-engineering/background-jobs#startup-sweeps · software-engineering/background-jobs#job-progress-and-cancellation
**App Master decisions (2026-10-07) - read before building AIO-A's open tail.**

- **(a) A research run keeps running when the creator leaves the Research step.** **Constraint:** since stage 4b (`67beb3e`) the paid answer finishes on the server, and cancelling on unmount would throw away a result that has already been paid for. This extends the operator's 2026-10-06 rule for recalibrate and scene direction to research. **Alternative that lost:** cancel on leave. It also answers the Risks line below ("Leaving the step keeps spending ... offer an explicit cancel"): Stop (`stopLive`, `app/_phases/research/run/live.ts:428`, then `cancelTurn`) is that explicit cancel, and a cancel that loses the race to the turn's own ending lands the answer instead of dropping it.
- **(b) A live research turn is tracked under the existing `JobKind` `research`, and its turn behaviour is keyed on the job having a `turnId`.** There is no new `JobKind`. **Constraint:** the replay run uses the same kind (`TURN_KINDS` membership means "may run as a turn", `lib/jobs.tsx:501-510`), and it must persist, settle and be interrupted by a reload exactly as before. A new kind would also touch `JOB_NOUN` (`lib/jobs.tsx:190`), `KIND_STEP` (`lib/jobLinks.ts:11`) and the bell-doors probe (`tests/golden-path/bell-doors.probe.spec.ts`). **Alternative that lost:** a separate `research-live` `JobKind`.
- **(c) Two open points from 4b, recorded and not decided:**
  - A failed live turn, on a project that has never saved a `research-notebook` record, shows its failure once more after a reload.
  - A resumed turn that this tab did not start shows an empty topic until it lands, because the ledger keeps only the prompt digest (`promptDigest`, `lib/turns/ledger.ts:79`; `resumeLive`'s `topic` defaults to `""`, `live.ts:404-408`). Adding a topic field is a `lib/turns/` ledger change.


**Summary.** Every minutes-long model turn (recalibrate, scene direction, poster, export, research) currently lives inside one browser tab's open `fetch` plus a localStorage record. If the tab reloads or the user leaves the step, the result is lost, and the engine process keeps running anyway. This card moves the job record and the run to the server: a durable turn ledger with a minted id, a cancel that actually kills the process tree, and a boot sweep. `lib/jobs.tsx` becomes a view of that ledger.

**Premise (verified).**
- `lib/jobs.tsx:183`, `:251-271`: the only job record is the localStorage key `gravitone.jobs.v1`. On mount, every `running` job is rewritten to `interrupted` with "The prototype cannot reattach to it."
- `lib/jobs.tsx:331-345`: the cross-tab serialisation race is "narrowed and not closed… Both would be closed by moving the record server-side, which is where this seam is going anyway."
- `app/_phases/script/useVersions.ts:136-148` + `:185`/`:209`: leaving the Script step aborts the fetch and settles the job `interrupted`. The comment says this stops the call. It does not. `lib/claudeCli.ts:278` `runClaude(prompt, timeoutMs)` takes no signal, `lib/text/providers/claudeCli.ts:93` calls it without one, and `app/api/recalibrate/route.ts:382` awaits `reason()` with none. So the `claude` process keeps running up to its 600s ceiling (`lib/claudeCli.ts:282`), on the seat, for an answer nobody receives.
- `app/api/recalibrate/route.ts:63` and `app/api/frames/route.ts:44` (`maxDuration = 800`): both turns are held-open requests. `/api/frames` is not even a job. `app/_phases/frames/useFrames.ts:581` is a plain `fetch` with no `jobs.start`, so it never appears in the bell and a reload loses it with no trace.
- Server-side file stores already exist and could host the ledger: `lib/foundry/store.ts:78`/`:96` (`listRuns`/`getRun`) and `lib/sound/store.ts:186`/`:254` (`writeJsonAtomic`/`withStore`).
- `app/_phases/script/useVersions.ts:199-202`: the recalibrate fetch sends no `accessHeader()`, although every other gated client call adds it (e.g. `useFrames.ts:583`). With `IMAGING_ACCESS_SECRET` configured, the real run gets a 401, and `:209-216` silently stages "Simulated instead". A single client turn door removes this whole class of bug. **The bug is also an S fix on its own today.**

**The move.**
- New `lib/turns/ledger.ts` (server only). One JSON record per turn under `foundry-out/turns/<id>.json`, written with `writeJsonAtomic`. If the foundry-engine backlog's shared runStore kernel lands first, the ledger uses it; this card covers text, poster and export turns, which is materially wider than foundry. Record fields: `{id, kind, projectId, slot, status: accepted|running|done|failed|cancelled|orphaned, bootId, startedAt, endedAt, receipt (router provenance), result, error}`.
- New `lib/turns/runner.ts`:
  - `startTurn(kind, projectId, input)` mints the id and writes `accepted` before dispatch.
  - It claims the serialised slot under an in-process lock. SERIALISED moves here from `jobs.tsx:159`.
  - It runs the turn via `after()` from `next/server`, threading an `AbortSignal` through `reason()` → provider → `runClaude(prompt, { timeoutMs, signal })` → `killTree`.
  - Boot sweep: a `running` record with a foreign `bootId` becomes `orphaned`. That is the server-side twin of `interrupted`, and it frees the slot.
- New routes: `POST /api/turns` (returns 202 `{turnId}`, or 409 naming the holder), `GET /api/turns/[id]`, `POST /api/turns/[id]/cancel`, `GET /api/turns?projectId=`. `/api/recalibrate` and `/api/frames` keep prompt assembly and hand off to `startTurn`. `?wait=1` keeps the synchronous answer for pipeline scripts.
- New `lib/turns/client.ts` is the one client door. It always carries `accessHeader()`. `JobsProvider` keeps its API (`start/settle/cancel/busy`), but its state becomes the server ledger read through `usePolling`. localStorage keeps only the read and cleared flags.
- `useVersions` stops aborting on unmount. On mount it asks the ledger for a `done` turn for its project and stages that.
- `lib/harness/protocol.ts:68` (`jobs: {running,total}`) reads the ledger, so the harness sees the truth instead of one tab's view.

**Why it is a moonshot / what it unlocks.**
- A creator can reload, close the tab or switch steps mid-recalibration and come back to a staged result.
- Cancel stops spending.
- Two tabs and two devices are serialised exactly, not "narrowed".
- Frames direction appears in the bell for the first time.
- Poster, export and research move onto one kernel instead of five client-held fetches.
- The hosted (Cloud Run) posture gets a real job model.
- `pipeline/` scripts and agents can start and await the same turns the UI does.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `POST /api/turns {kind:"recalibrate"}` with a fake engine → 202 `{turnId}`. `GET` reports `running`, then `done` with plan and receipt.
2. A second POST for the same project and serialised kind while one is running → 409 whose body names the running `turnId`.
3. `POST /api/turns/[id]/cancel` during a run → the engine's process tree is dead (the sleeper-pid technique from `cli-kill-tree.probe.spec.ts`) and the status is `cancelled`. A late engine resolve does not overwrite it.
4. `runClaude(prompt, {signal})` with the signal aborted mid-run → rejects with `CliError` kind `cancelled`, and `killTree` ran.
5. A ledger holding a `running` record from a different `bootId` → after the sweep it is `orphaned` and the slot is free.
6. A turn that settled while no tab was mounted → the provider's first poll produces exactly one bell event, deduped by turn id.
7. Unmounting the Script step mid-run does not cancel the turn. Remounting stages the done plan.
8. A source probe finds zero raw `fetch("/api/…")` calls to a gated route outside the client door.

**Write set.** Staged:
- Stage 1 (kernel): new `lib/turns/ledger.ts`, `lib/turns/runner.ts`, `app/api/turns/route.ts`, `app/api/turns/[id]/route.ts`, `app/api/turns/[id]/cancel/route.ts`; `lib/claudeCli.ts` and `lib/text/providers/claudeCli.ts` + `lib/text/router.ts` (signal plumbing); new probe `tests/golden-path/turn-ledger.probe.spec.ts`.
- Stage 2 (recalibrate on it): `app/api/recalibrate/route.ts`, `app/_phases/script/useVersions.ts`, new `lib/turns/client.ts`, `lib/jobs.tsx`.
- Stage 3 (the rest): `app/api/frames/route.ts`, `app/_phases/frames/useFrames.ts`, the poster/export hooks, `lib/harness/protocol.ts`, `components/ui/HarnessBridge.tsx`.

**Risks & rollback.**
- Cloud Run throttles CPU after the response, so `after()` needs CPU-always-allocated or a Cloud Run job, and `foundry-out/` is ephemeral there. The hosted ledger needs a GCS adapter behind the same interface.
- The slot lock assumes a single Node process. State that, and make it a lease when the app scales out.
- "Leaving the step keeps spending" changes a product decision recorded in `useVersions.ts:131-135`. Surface the running turn and offer an explicit cancel.
- Rollback: the routes keep `?wait=1`, and `JobsProvider` keeps a flag to fall back to its localStorage mode.

**First session dispatch.**
Read `lib/jobs.tsx` (whole), `lib/claudeCli.ts:238-356`, `lib/text/router.ts:204-350`, `app/_phases/script/useVersions.ts:120-240`, then `lib/sound/store.ts:180-310` as the atomic-store precedent.
Build Stage 1 only: thread `signal` through `runClaude` → provider → `reason`, then add `lib/turns/{ledger,runner}.ts` and the three routes.
Write acceptance 1-5 first as `tests/golden-path/turn-ledger.probe.spec.ts`. Use a fake `claude` on PATH (see CIP-A) or an injected runner.
Gate: `npm run typecheck && npm test`. Do not touch the UI in this session.

_Runner-up:_ A single `lib/apiClient.ts` door for every gated client call, plus a source probe. It closes the `useVersions.ts:199` missing-auth class and the next one like it.

### AIO-B · Dispatch manifest: see what the engine will read, and which engine, before you spend

**Context:** ai-orchestration · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 7/10 · **Risk:** 3/10 · **Gate:** direction
**Registry:** software-engineering/cost-metering#preflight-estimation · software-engineering/prompt-assembly#context-reachability

**Summary.** The recalibrate and frames routes already decide, before spending, which renders, conclusions and blocks the engine will see, and the router can say which rung would serve. None of it reaches the creator until after a multi-minute run, or never. This card exposes that decision as a free preview, puts it next to the Run button as something the creator can act on ("also send render B"), and stamps it onto the version receipt.

**Premise (verified).**
- `app/api/recalibrate/route.ts:279-301`: the route computes `inScope`, `notSent` (`:287`) and `held` conclusions (`:296`), and tells the engine about them (`:341-366`). The response (`:416-439`) returns only `plan` and `engine`, so the creator never learns which renders or conclusions were withheld.
- `app/api/frames/route.ts:152-192`: the route assembles the whole prompt, including the format brief, and returns only `raw` and `engine`. A creator first learns the size of the run from a 413.
- `lib/text/router.ts:427`: `engineStatus(turn)` already answers "which engine would serve this turn, and why not the others" without spending. Neither Script nor Frames asks before dispatch.
- `app/_phases/script/useVersions.ts:209-216`: when no engine can serve, the client finds out after the click and stages a simulated candidate ("Simulated instead — …").
- `lib/text/log.ts:9-11`: turn durations and costs go only to a console line, so the app has no history to answer "about how long".
- `app/_phases/script/versions.ts:194`, `:243`: the version receipt shows `promptChars` after the fact. What that size was made of is never shown.

**The move.**
- Extract pure assemblers `lib/turns/assemble/recalibrate.ts` and `lib/turns/assemble/frames.ts`, each returning `{ prompt, manifest }`. The routes become thin callers, and a parity probe pins the prompt byte for byte.
  - `manifest` = `{ blocks: [{name, chars}], renders: {sent, notSent}, conclusions: {whole, held}, notes, totalChars, ceilingChars }`.
- Add `forceRenders` / `forceConclusions` inputs that the assembler honours. The stray and blind guards then read the widened scope.
- New `lib/text/stats.ts`: a bounded ring fed by `logTurn`, holding only durations, rungs and costs, never the prompt. It yields `{p50Ms, n}` per turn class and rung.
- New `POST /api/turns/preview` (`guardAccessOnly`; spawns nothing beyond the free `--version` probe) → `{ manifest, engine: {available, rung, provider, transport, costBasis}, estimate }`.
- A pre-flight strip beside the Script pad's Run control and the Frames direct button, built only from the `components/ui/signal/` vocabulary:
  - `<Tally>` sent / held, `<StackBar>` block sizes, `<Provenance>` rung.
  - A per-render include toggle on not-sent renders.
  - When `engine.available` is false, the control itself carries the refusal and its descent reasons. No silent simulated stage.
- The manifest travels onto `engineRun` on the version, so a version records what the engine actually read.

**Why it is a moonshot / what it unlocks.**
- Each multi-minute, seat- or metered-billed turn becomes an informed act: what is sent, what is withheld and why, local seat or metered cloud, about how long.
- The withheld-render refusal stops being a 502 the creator could not foresee and becomes a toggle.
- The assemblers also give the probe lane a spend-free seam over the two most expensive prompts in the app.
- It pairs with AIO-A, since preview, start and watch all key on the same turn class.

This is distinct from the imaging-service budget-forecast quote (vendor image spend). This card covers reasoning-turn scope and rung.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Preview of `recalibrate` with notes naming only render A's cards → `renders.sent=[A]`, `notSent=[B,C]`. Nothing is spawned under `LOCAL_BINARIES=off`.
2. For a fixture body, the assembler's prompt is byte-identical to the one the pre-refactor route built (golden file).
3. `forceRenders:["B"]` → B appears in `sent`, and a plan that edits B is no longer refused as stray.
4. Preview on the managed posture with no Google key → `engine.available=false` with both descent reasons. The client run control is disabled with that reason, and no "Simulated instead" candidate is staged.
5. Three logged turns of 100/200/300s → `estimate.p50Ms=200000`, `n=3`. The ring's records contain no `prompt` key.
6. Frames preview with 401 beats → the same 413 text `tooLarge` gives the POST, before assembly.
7. A version staged after a run carries `engineRun.manifest`. A version without one, staged earlier, still renders.

**Write set.** `app/api/recalibrate/route.ts`, `app/api/frames/route.ts`, `lib/text/log.ts`, `app/_phases/script/useVersions.ts`, `app/_phases/script/versions.ts`, `app/_phases/frames/useFrames.ts`, the Script and Frames run controls. New: `lib/turns/assemble/recalibrate.ts`, `lib/turns/assemble/frames.ts`, `lib/text/stats.ts`, `app/api/turns/preview/route.ts`, `app/_phases/script/_notes/DispatchStrip.tsx`, `tests/golden-path/turn-preview.probe.spec.ts`.

**Risks & rollback.**
- The assembler extraction is the risky half: a one-byte prompt drift changes model behaviour. Acceptance 2 is the guard.
- The preview cost is the free `--version` probe per call. Debounce it on the client.
- A UI strip invites narration. Use the signal vocabulary only, and photograph it with `pipeline/cx-capture.mjs`.
- Rollback: the routes are unchanged callers of the assemblers, and the strip is one component to remove.

**First session dispatch.**
Read `app/api/recalibrate/route.ts` and `app/api/frames/route.ts` in full, plus `lib/text/router.ts:427-474` and `components/ui/signal/README.md`.
Session 1: extract the two assemblers with a golden-prompt parity probe (acceptance 2), then add `/api/turns/preview` with acceptance 1, 4 and 6.
Gate: `npm run typecheck && npm test`. The UI strip is session 2, with a cx-capture photograph of `studio-script`.

_Runner-up:_ A per-project "turn history" rail of receipts (rung, cost, duration, manifest) with "run again on the other rung" as a compare mode.

_Checked:_
- Read in full: `lib/jobs.tsx`, `lib/usePolling.ts`, `lib/claudeCli.ts`, `lib/harness/protocol.ts`, `lib/model.ts`, `lib/GlobalErrorBridge.tsx`, `app/api/recalibrate/route.ts`, `app/api/frames/route.ts`.
- Skimmed: `lib/imagingClient.ts`, `lib/text/router.ts` (descent loop, `engineStatus`), `lib/text/log.ts`, `lib/text/providers/claudeCli.ts`, `lib/imaging/providers/agy.ts` (second spawn door, no tree kill needed off-shell).
- Traced:
  - every `jobs.start/settle` call site (6 files);
  - every client `fetch("/api/…")`. Only `useVersions.ts:199` omits `accessHeader` on a gated route;
  - abort propagation, which stops at the fetch.
- Not read: `lib/stylePrompt.ts`, `lib/formatBrief.ts` (skim only), `lib/announcer.tsx`, `lib/musicClient.ts`.

---

## auth-persistence

### AUP-A · Verified principal and account vault: the server knows who is calling, and holds the work

**Context:** auth-persistence · **Slot:** A architecture
**Size:** XL · **Effort:** 9/10 · **Impact:** 9/10 · **Risk:** 7/10 · **Gate:** direction
**Registry:** software-engineering/authorization#identity-bearing-keys · software-engineering/browser-credential-boundary#public-vs-server-env-split · software-engineering/sync-replication#conflict-detection-and-policy

**Summary.** The server cannot tell who is calling. The only credential is a secret shipped in the bundle, rate limits are keyed on a forgeable header, and spend ceilings are process-wide. Meanwhile, every project lives only in one browser profile. This card has the server verify Firebase ID tokens itself, with no `firebase-admin`, into one `Principal`. Rate limits and spend key on that principal. On top of it sits a per-account vault, so IndexedDB becomes a cache rather than the only copy.

**Premise (verified).**
- `lib/apiAuth.ts:21-27` and `lib/imagingClient.ts:74-88`: the gate's credential is `NEXT_PUBLIC_IMAGING_ACCESS_SECRET`, "PUBLIC by construction". Both files say "the real upgrade is Firebase ID-token verification" (`apiAuth.ts:24`, `imagingClient.ts:79`).
- `lib/apiAuth.ts:377-381` with `:242-245`: the limiter is keyed on `x-forwarded-for`, which the file admits "a caller can force… by forging".
- `lib/imaging/budget.ts:141`, `:152`: the spend ledger and holds are process-global, so no per-account ceiling is expressible.
- `lib/localMode.ts:3-8` and `lib/firebase.ts:8-12`: "the ONLY thing Firebase does in this app is authentication", and "there is no backend here". Projects, steps, themes, assets and uploads exist only in IndexedDB (`lib/studioDb.ts:12-32`).
- `lib/projects.ts:10-14`: the record is uid-scoped "so the record already has the field a server would key on".
- `lib/devAuth.ts:58` and `lib/localMode.ts:58`: the fixture and local identities throw on `getIdToken`, so a principal model must name those kinds explicitly rather than infer them.

**The move.** Staged, XL.
1. **Principal.**
   - New `lib/principal.ts` (server): `resolvePrincipal(req)` returns one of `{kind:"firebase", uid}` · `{kind:"local-owner"}` · `{kind:"dev-fixture"}` · `{kind:"shared-secret"}` (legacy, flagged), or a typed refusal.
   - It verifies RS256 ID tokens with `crypto.subtle` against Google's `securetoken` JWKS (cached by Cache-Control), checking iss, aud, exp, iat, auth_time and sub.
   - Client side, new `lib/sessionToken.ts`. `useAuth` subscribes `onIdTokenChanged` only to cache the token, never to evict; the `identityEviction.ts` rule stands. `accessHeader()` stays synchronous and returns `Bearer <idToken>`.
   - `guardRequest` keys rate buckets by principal id. `PRINCIPAL_MODE=verified` closes the shared-secret door.
2. **Attribution.** Imaging, music and text spend holds record the principal, and per-principal ceilings sit under the global one.
3. **Vault.**
   - New `lib/vault/store.ts`: per-uid, generation-numbered snapshots of the five stores. File-backed under `foundry-out/vault/<uid-hash>/` locally, with a GCS adapter for hosted.
   - New routes: `GET /api/vault` (manifest), `PUT /api/vault` (`If-Match` generation → 409 on conflict).
   - `studioDb` gains a per-store change counter, and a visibility-aware pusher syncs on change.
   - Eviction becomes "drop the cache once the vault confirms a generation ≥ local". Sign-in on a new device pulls the snapshot.

**Why it is a moonshot / what it unlocks.**
- Signing out, clearing site data, or a second laptop stop meaning lost work.
- The hosted SaaS posture gets real per-account isolation, budgets and rate limits instead of a public secret.
- AIO-A's turn ledger can be keyed per account.
- Every "a real deployment would…" caveat in `apiAuth.ts` gets its answer in one module.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. A token signed with a test RSA key, whose JWK is served as the JWKS (fetch stub) → `{kind:"firebase", uid: sub}`.
2. Wrong `aud`, wrong `iss`, expired, or `alg:"none"` → a typed refusal. It never silently falls through to the shared secret.
3. `PRINCIPAL_MODE=verified` with the legacy bundle secret presented → 401.
4. Two requests with the same uid and different `x-forwarded-for` → one rate bucket.
5. Per-principal ceiling: principal A over budget gets 402 while principal B is still served.
6. Vault `PUT` with a stale generation → 409, and the stored snapshot is unchanged.
7. fake-indexeddb round trip: push, evict, then pull on a "new device" → rows byte-identical per store, upload blobs included.
8. The `local-owner` principal against `/api/vault` → refused by name. Local mode is archive-only (see AUP-B).

**Write set.** Staged:
- Stage 1: new `lib/principal.ts`, `lib/sessionToken.ts`; `lib/apiAuth.ts`, `lib/imagingClient.ts`, `lib/useAuth.tsx`; new probe `tests/golden-path/principal.probe.spec.ts`; `tests/golden-path/harness-gate.probe.spec.ts` (the fixture principal states the same two-condition gate).
- Stage 2: `lib/imaging/budget.ts`, `lib/music/budget.ts`.
- Stage 3: new `lib/vault/store.ts`, `app/api/vault/route.ts`; `lib/studioDb.ts`, `lib/identityEviction.ts`, `lib/useProjects.ts`.

**Risks & rollback.**
- This is a posture change ("no backend") and puts creator data on a server, so it is a direction call, and the data-retention design has to come with it.
- JWKS fetch failure must fail closed for money routes while not locking out reads.
- The vault introduces conflicts. Generation plus 409 is the floor; merge is out of scope.
- Rollback: `PRINCIPAL_MODE=legacy` restores the shared secret. The vault is additive, and eviction keeps the destructive path behind a flag until sync is proven.

**First session dispatch.**
Read `lib/apiAuth.ts` (whole), `lib/useAuth.tsx`, `lib/identityEviction.ts:1-120` (the eviction-trigger rule) and `tests/golden-path/imaging-auth.probe.spec.ts`.
Build Stage 1 only: `lib/principal.ts` with JWKS verification over `crypto.subtle` and an injectable key fetcher, then make `guardRequest` principal-keyed.
Write acceptance 1-4 first. Gate: `npm run typecheck && npm test && npm run check:bundle` (no server secret in the bundle).

_Runner-up:_ Stage 1 alone (verified principal plus principal-keyed rate and spend) as an L. It is the prerequisite for every per-account feature, even without a vault.

### AUP-B · Sign-out cannot destroy work: preview the wipe, take a studio archive, bring it back

**Context:** auth-persistence · **Slot:** B experience
**Size:** L · **Effort:** 6/10 · **Impact:** 9/10 · **Risk:** 5/10 · **Gate:** policy-loosen
**Registry:** software-engineering/data-retention#dry-run-preview · software-engineering/entity-lifecycle#archive-restore-semantics

**Summary.** One click on "Sign out" irreversibly deletes the only copy of every project, step, theme and uploaded reference the account has. So does a session ending in another tab or by revocation. The eviction code justifies this as "over-wiping costs a refetch", but there is nothing to refetch from. This card gives the work a portable home that needs no backend (works in local mode too):
- a dry-run eviction preview;
- a one-file `.gravitone` studio archive with import;
- an involuntary session end that locks the shelf instead of wiping it.

**Premise (verified).**
- `components/ui/UserMenu.tsx:149-156`: "Sign out" is one click with no confirm. It calls `useAuth.signOut`, which always runs `evictIdentity(uid,"signed-out")` (`lib/useAuth.tsx:206`).
- `lib/useAuth.tsx:137-141` with `lib/identityEviction.ts:202-212`: any uid → null transition (another tab's sign-out, a revocation) evicts as `session-ended` with no user act. `lib/firebase.ts:128` makes sessions persist indefinitely, so the trigger is rare and always unexpected.
- `lib/identityEviction.ts:52-58`: the design rests on "Over-wiping costs a refetch". But `lib/localMode.ts:3-8` and `lib/firebase.ts:8-12` state Firebase is auth only and that there is no backend, so IndexedDB is the only copy.
- `lib/useAuth.tsx:179-184` and `components/ui/UserMenu.tsx:136-139`: the code already concedes, for local mode only, that eviction "would wipe the only copy of the owner's work". The same is true signed in.
- `lib/identityEviction.ts:124-147`, `:274-330`: the eviction already computes exact per-store counts inside one five-store transaction, so a dry run is one flag away.
- There is no export, import or backup path anywhere in `lib/`, `app/` or `components/` (grep for `exportProject|importProject|backup` finds nothing).

**The move.**
- New `lib/studioArchive.ts`:
  - `exportAccount(uid, {projectIds?})` streams a gzip file (`CompressionStream`, no dependency): a manifest (`DB_VERSION`, counts, sha256 per section) plus NDJSON rows from the five stores, with upload blobs base64-encoded.
  - `importArchive(file, uid, {onCollision: skip|replace|duplicate})` validates, rewrites `uid` on every by-uid row, and writes in ONE transaction. It returns a report shaped like `EvictionReport`.
- `evictIdentity(uid, reason, {dryRun:true})` returns the report and deletes nothing.
- Sign-out becomes a dialog. It shows `<Tally>` counts and size from the dry run, has "Download archive" as the primary action, and "Sign out and erase" as the destructive confirm. That confirm states its consequence, which the narration law exempts.
- Policy change (why the gate is policy-loosen): an involuntary `session-ended` locks rather than wipes. Rows stay uid-keyed and the gate hides them. They are wiped only on `account-switched` or an explicit erase, and restored when the same uid signs back in.
- `/projects` gets "Import archive". A per-project export makes a project shareable between two accounts.

**Why it is a moonshot / what it unlocks.**
- The worst failure in the app (silent, total, irreversible loss of a creator's work) becomes impossible without a deliberate confirm.
- Moving between machines, browsers or accounts becomes one file.
- Local mode gets a backup story.
- It is the no-backend floor beneath AUP-A's vault, and the archive format becomes the vault's snapshot format.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. fake-indexeddb: export, wipe via `evictIdentity`, then import → every row in all five stores is deep-equal to the original. Upload blobs are byte-identical.
2. Importing account U1's archive into U2 → no row anywhere still carries U1, and U2's pre-existing rows are untouched.
3. `evictIdentity(uid, r, {dryRun:true})` → its report equals the report of the real eviction that follows, and nothing is deleted.
4. An archive whose `DB_VERSION` is newer than the code's → refused by name, nothing written.
5. A corrupt section (sha mismatch) → nothing imported. One transaction, no partial shelf.
6. `onCollision:"skip"` vs `"duplicate"` on an existing project id → kept as-is vs re-minted id with steps re-keyed `${newId}:${phase}`.
7. Under the lock policy: `session-ended` leaves rows resident and hidden, `account-switched` still wipes, and a same-uid re-sign-in shows them again.

**Write set.** `lib/identityEviction.ts`, `lib/useAuth.tsx`, `components/ui/UserMenu.tsx`, `app/projects/ProjectsView.tsx`, `tests/golden-path/identity-eviction-idb.probe.spec.ts`. New: `lib/studioArchive.ts`, `components/ui/SignOutDialog.tsx`, `tests/golden-path/studio-archive.probe.spec.ts`.

**Risks & rollback.**
- The lock policy reverses a documented security stance (resident data on a shared machine), which is why the gate is policy-loosen. Ship the archive and dry-run dialog first; they need no policy change.
- Archive size: plates are about 5MB per composed cut (`studioDb.ts:196-198`). Stream it rather than building one string.
- The archive holds unpublished research, so the download is the user's own act and nothing auto-uploads it.
- Rollback: the dialog is additive, and the lock policy sits behind one branch in `transitionFor`'s consumer.

**First session dispatch.**
Read `lib/identityEviction.ts` (whole), `lib/studioDb.ts`, `lib/assets.ts` (`readUploadPointer`) and `tests/golden-path/dal-real-engine.probe.spec.ts` (the fake-indexeddb pattern).
Build `lib/studioArchive.ts` export and import plus the `dryRun` flag. Write acceptance 1-6 first in `tests/golden-path/studio-archive.probe.spec.ts`.
Gate: `npm run typecheck && npm test`. The dialog is session 2, photographed with cx-capture. The lock policy waits for the operator's call.

_Runner-up:_ `navigator.storage.persist()` on first project create, plus a quota `<StackBar>` in the user menu, so the browser itself does not evict the only copy under storage pressure.

_Checked:_
- Read in full: `lib/studioDb.ts`, `lib/identityEviction.ts`, `lib/apiAuth.ts`, `lib/deployment.ts`, `lib/localMode.ts`, `lib/devAuth.ts`, `lib/capabilities.ts`.
- Read in part: `lib/useAuth.tsx` (listener and sign-out), `lib/firebase.ts` (header and policy), `lib/projects.ts` (header), `lib/useProjects.ts` (header), `components/ui/UserMenu.tsx:130-160`, `lib/imaging/budget.ts` (state shape).
- Traced: every eviction trigger and its call sites, the sign-out UI, the export/backup absence, the `firebase-admin` absence, and the deps (no zip and no JOSE library, so WebCrypto is the path).
- Not read: `lib/themes.ts`, `lib/useThemes.ts`, `lib/useAssets.ts`, `app/globals.css`, `next.config.ts` beyond distDir.

---

## cli-infrastructure-probes

### CIP-A · Engine stand-in lane: a fake `claude` on PATH replays recorded envelopes through real routes

**Context:** cli-infrastructure-probes · **Slot:** A architecture
**Size:** L · **Effort:** 6/10 · **Impact:** 8/10 · **Risk:** 3/10 · **Gate:** none
**Registry:** software-engineering/test-harness#recorded-interaction-fixtures · software-engineering/test-harness#unreached-decisions-pin-nothing

**Summary.** The probe lane can test the reasoning engine's absence and its pieces in isolation, but never a successful turn through the real spawn door. As a result, the most expensive routes' refusal logic, the router's success labelling and the seat-only env strip are unexercised. This card adds a scriptable `claude` stand-in, put first on PATH by a helper, that replays recorded CLI JSON envelopes. Every engine-backed route then runs end to end offline, without spending and without production injection points.

**Premise (verified).**
- `tests/golden-path/text-ladder.probe.spec.ts:22-28`: the probe "CANNOT REACH… a SUCCESSFUL serve, and therefore the rung labelling, `reroutedFrom` and the schemaEnforcement downgrade". `PROVIDERS` is module-private, and "closing that needs an injection point in production code". A binary on PATH needs none.
- `app/api/recalibrate/route.ts:391-412`: the stray-render and blind-conclusion refusals, the two guards that keep a plan from editing what the engine never read, are reached by no probe. A grep of `tests/` for their detail strings finds nothing. The `PromptUnavailable` branch (`:445-449`) is equally unreached.
- `tests/golden-path/cli-sandbox-args.probe.spec.ts:41-55`: the sandbox is asserted against `spawn("node", [argvEcho(), …])`, a replica of the spawn, not `runClaude`'s own (`lib/claudeCli.ts:284`). An argv stand-in already exists, but only in a one-off form.
- `lib/claudeCli.ts:139-150`: the seat-only env strip (`ANTHROPIC_API_KEY` and three more removed at the door) is never observed from a real child. The tests that mention the key (`text-log-line`) are about log scrubbing.
- `tests/golden-path/cli-transport-resilience.probe.spec.ts:33-47`: PATH manipulation inside the serial lane is already established and restorable.
- `lib/claudeCli.ts:314-327`: the envelope contract (`is_error`, `subtype`, `result`, `total_cost_usd`, `session_id`) is parsed but never checked against a real recorded envelope.

**The move.**
- New `tests/_engine/fake-claude.mjs` plus platform shims (`claude.cmd` on win32, executable `claude` on POSIX) in a temp dir.
- New `withFakeEngine(cassette, fn)` in `tests/golden-path/_helpers.ts`. It prepends that dir to PATH and restores it via `keepEnv`.
  - The fake reads stdin and selects a reply by the turn marker (schema hash plus first block heading).
  - It writes the recorded envelope and appends `{argv, envKeys, promptChars}` to a side log the probe reads.
  - Modes: `ok` · `is_error` · `not-json` · `login-stderr` · `exit:N` · `slow`.
- Cassettes live in `tests/_engine/cassettes/*.json`. Each holds the envelope, `recordedAt`, the `cliArgs()` fingerprint and the prompt's sha256 and length. **It never holds the prompt text**, which is `lib/text/log.ts`'s rule.
- New `pipeline/record-engine-cassette.mts` records real envelopes (record mode spends and is operator-run). Playback is the lane default. `npm run verify:text` stays the live certification.
- New probes on top of it:
  - `recalibrate-route-e2e` (200 with full receipt; stray → 502; blind → 502; missing prompt file → 500 "never started");
  - `frames-route-e2e`;
  - a text-ladder success serve (rung, `schemaEnforcement:"prompted"`, `reroutedFrom` after a `not-installed` fake vs no descent on `bad-response`);
  - a real-door sandbox and env-strip check from the side log.

**Why it is a moonshot / what it unlocks.**
- The two highest-cost routes become regression-testable in `npm test`, offline, at zero spend, through the production code path.
- Any refactor of route assembly, the router or the CLI envelope (AIO-A's signal plumbing, AIO-B's assemblers) gets a safety net that exists today only as "run it live and read the log".
- Cassette freshness makes CLI upgrades that change the envelope fail loudly instead of silently.

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. `withFakeEngine(okPlan)` → `POST /api/recalibrate` (devOpen) returns 200 with `engine.rung="preferred"`, `transport="local-subprocess"`, and `costUsd` equal to the envelope's `total_cost_usd`.
2. A cassette whose plan edits a render that was not sent → 502 whose detail names that render id. Nothing is staged.
3. A cassette whose plan's `cards` cites a held conclusion → 502 naming the conclusion id.
4. The fake's side log for a real `runClaude` call shows `--max-turns 1` as a flag and an empty `--allowed-tools` value. This replaces the replica-spawn assertion.
5. With `ANTHROPIC_API_KEY` set in the parent, the fake's recorded `envKeys` contain none of the four metered variables.
6. Fake mode `is_error` → no descent (`bad-response` is not reroutable). A fake absent from PATH plus a stubbed Google fetch → `reroutedFrom` names `claude-cli`.
7. A cassette whose `cliArgs()` fingerprint differs from the current one, or which is older than the declared freshness window → the probe fails with "re-record", not a pass.

**Write set.** `tests/golden-path/_helpers.ts`, `tests/golden-path/cli-sandbox-args.probe.spec.ts`, `tests/golden-path/text-ladder.probe.spec.ts`. New: `tests/_engine/fake-claude.mjs`, `tests/_engine/cassettes/` (3-5 files), `pipeline/record-engine-cassette.mts`, `tests/golden-path/recalibrate-route-e2e.probe.spec.ts`, `tests/golden-path/frames-route-e2e.probe.spec.ts`, `tests/golden-path/engine-door.probe.spec.ts`.

**Risks & rollback.**
- A PATH leak would let a later probe in this serial, single-process lane (`playwright.config.ts:20-29`) spawn the fake. `keepEnv` registration is enforced by `env-isolation.probe.spec.ts:41`.
- Windows `.cmd` resolution through `shell:true` is the exact quirk the lane exists for, so the shim must be tested on both platforms.
- Cassettes could leak creator text, so store only hashes and lengths and add a probe that scans cassettes for prompt-like content.
- Rollback: the lane is purely additive under `tests/`.

**First session dispatch.**
Read `tests/golden-path/cli-sandbox-args.probe.spec.ts`, `cli-transport-resilience.probe.spec.ts`, `text-ladder.probe.spec.ts`, `lib/claudeCli.ts:238-356` and `app/api/recalibrate/route.ts:253-474`.
Build `fake-claude.mjs` with its shims and `withFakeEngine`, hand-write the first cassette (no recording yet), then write acceptance 1-5.
Gate: `npm test` on Windows. Then confirm `npm run verify` stays green.

_Runner-up:_ A Google-rung cassette (stubbed `globalThis.fetch` replaying a recorded `generateContent` body), so the cloud rung's native-schema path is exercised to the same depth.

### CIP-B · Deployment-cell matrix: every route and capability judged per posture cell, derived

**Context:** cli-infrastructure-probes · **Slot:** B-architecture (no UI surface)
**Size:** M · **Effort:** 5/10 · **Impact:** 7/10 · **Risk:** 2/10 · **Gate:** none
**Registry:** software-engineering/test-harness#configuration-axes-cross-the-ladder

**Summary.** The app is about to run in two postures (laptop, Cloud Run), and the answers vary by posture: which routes open, which capabilities show, which engine serves. Today they are checked one environment variable at a time, inside probes that each mutate `process.env` for their own reasons. This card adds a declared set of named deployment cells (axes × values) and one lane that runs every filesystem-derived route, plus `capabilities()` and `engineStatus()`, in every cell. Results are keyed by cell. It fails on the shape `lib/capabilities.ts` says it exists to prevent: "a button that is visible, enabled, and answers 503".

**Premise (verified).**
- `lib/capabilities.ts:11-16` names that failure. `:29-34` admits the flags are not a boundary, and that a capability can be off while its route still serves.
- `lib/capabilities.ts:124-136`: the hosted block is hand-maintained in two places ("the two lists must agree, and until 2026-09-05 this one was missing the last entry"). The second place is `.env.example:113-137`.
- `lib/deployment.ts:95-100`: posture is a three-value function of `LOCAL_BINARIES` and the managed markers. It crosses `GOOGLE_AI_API_KEY`, `IMAGING_ACCESS_SECRET`, `NEXT_PUBLIC_DEV_AUTH`, `NEXT_PUBLIC_LOCAL_MODE` and the Firebase trio. No probe enumerates the product of these axes.
- `tests/golden-path/text-ladder.probe.spec.ts:54-69` checks the plan per posture for the router alone. `harness-gate.probe.spec.ts:77-131` checks a truth table for the dev gate alone. Each is one axis in one module.
- `tests/golden-path/env-isolation.probe.spec.ts:7-12`: seven probes mutated env and four leaked it. The env axis exists today only as per-probe side effects.
- `tests/golden-path/imaging-auth.probe.spec.ts:67-115`: a filesystem-derived route list with declared exceptions already exists (46 `route.ts` files). That precedent is the derivation this lane reuses.

**The move.**
- New `tests/golden-path/_cells.ts` declares the axes and their values. It names the cells that matter: `laptop`, `laptop-offline-rehearsal` (`LOCAL_BINARIES=off`), `cloud-run-saas` (`K_SERVICE` + key + secret + hosted caps), `cloud-run-misconfigured` (no key), `local-mode`, `ci-empty`. Each cell is an env object applied and restored via `keepEnv`.
- New `lib/capabilities.ts` export `HOSTED_CAPS`: the one hosted block, from which the `.env.example` lines are checked rather than restated. A `CAPABILITY_ROUTES` map links each capability to the routes behind it.
- New `tests/golden-path/deployment-cells.probe.spec.ts`. For each cell, against every derived route, `capabilities()`, `engineStatus()` and `localPosture()`, it asserts declared invariants:
  - a capability that is on ⇒ its routes do not answer not-configured or no-engine;
  - a managed cell ⇒ zero spawns (CIP-A's fake, or a PATH marker binary, records any attempt);
  - every gated route 401s in every cell without a secret or dev-auth;
  - `engineStatus` agrees with what the route actually did.
- Output is one line per cell × route verdict, so a red result names its cell.
- `pipeline/preflight.mts` prints which declared cell this machine is in.

**Why it is a moonshot / what it unlocks.**
- Shipping the hosted posture stops being "deploy and see which buttons 503".
- A new capability, route or env axis is judged in every cell the day it lands, because the lists are derived and the cells are declared once.
- The `.env.example` / `capabilities.ts` drift class closes.
- The operator gets a single answer to "what does this deployment actually do".

**Acceptance (3-8 cases a builder writes as failing tests first).**
1. Cell `cloud-run-misconfigured` → `capabilities().musicGenerate` is false, or the music route answers ready. Their disagreement is a failure naming cell and route.
2. Cell `cloud-run-saas` → no route spawns a process. The marker binary's log is empty.
3. Cell `ci-empty` → every route not on the `DELIBERATELY_PUBLIC` list answers 401.
4. A route file added under `app/api/` with no cell expectation → the lane fails, naming the file.
5. `.env.example`'s hosted block differs from `HOSTED_CAPS` by any variable → failure naming the variable.
6. For every cell, `engineStatus("edit-plan").available === false` ⇔ `POST /api/recalibrate` with a valid body answers the no-engine status from `lib/text/errors.ts`.
7. After the lane, `process.env` deep-equals its value before the lane.

**Write set.** `lib/capabilities.ts`, `.env.example` (comment only), `pipeline/preflight.mts`, `tests/golden-path/_helpers.ts`. New: `tests/golden-path/_cells.ts`, `tests/golden-path/deployment-cells.probe.spec.ts`.

**Risks & rollback.**
- Running every route per cell must never reach a vendor. Bodies are the 4xx-before-dispatch shapes `imaging-auth.probe.spec.ts` already uses, the Google key is a sentinel with a fetch stub that refuses, and CIP-A's fake is used where a spawn would happen.
- Lane runtime grows as cells × routes. Keep it around 6 × 46, with no network.
- Rollback: additive. `HOSTED_CAPS` is a constant that `capabilities()` can ignore.

**First session dispatch.**
Read `lib/capabilities.ts`, `lib/deployment.ts`, `tests/golden-path/imaging-auth.probe.spec.ts` (route derivation and `DELIBERATELY_PUBLIC`), `tests/golden-path/env-isolation.probe.spec.ts` and `tests/golden-path/_helpers.ts`.
Build `_cells.ts` with three cells first (`laptop`, `cloud-run-saas`, `ci-empty`), then the lane with invariants 2, 3, 4 and 7. Add `HOSTED_CAPS` and acceptance 5 next.
Gate: `npm test`.

_Runner-up:_ A cross-tab interleaving model checker that drives `mergeJobs`/`applyCancel`/`applyClear` over a simulated shared localStorage with N tabs and random start/settle/reload/storage events, asserting "never two running serialised jobs per project" and "the owner's truth wins". It is only worth doing if AIO-A does not land.

_Checked:_
- Read in full: `cli-transport-resilience`, `gate-vacuous-pass`, `recalibrate-engine-parity` (first 60 lines).
- Read headers and test lists: `cli-kill-tree`, `cli-sandbox-args`, `env-isolation`, `firebase-absent-env`, `harness-gate`, `dal-real-engine`, `cli-exit-classification`, `unhandled-rejection-route`.
- Also read: `playwright.config.ts`, `tests/golden-path/text-ladder.probe.spec.ts` (header and tests), `imaging-auth.probe.spec.ts:55-140`.
- Traced:
  - route-guard reachability (grep of `tests/` for the recalibrate refusal strings: 0 hits);
  - seat-strip observation (none from a real child);
  - posture-axis coverage (single-axis only);
  - registry test-harness techniques: `recorded-interaction-fixtures`, `unreached-decisions-pin-nothing`, `configuration-axes-cross-the-ladder`.
