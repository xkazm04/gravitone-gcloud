---
name: ship-loop
description: Milestone-driven ship-readiness loop for Gravitone Studio (gravitone-gcloud). Maintains an 8-dimension scorecard + append-only backlog, batches items into user-gated milestones (CP checkpoints), executes with atomic commits, and certifies each milestone with a verification gate (types + build, then the browser). Resumable across sessions — all state lives in `.vault/ShipLoop/`. Invoke with `/ship-loop` (resumes) or `/ship-loop boot` (fresh loop after archiving prior state).
argument-hint: "[boot]"
---

# Ship Loop — milestone-driven ship readiness

A permanent loop that moves the app toward a user-defined **ship bar** through scored audits,
user-gated milestone picks, and hard verification gates. Any session can resume it: the state files
are the single source of truth, and this file is the procedure.

> Origin note: adapted 2026-08-11 from the Personas copy at `dolla/personas/.claude/skills/ship-loop/`,
> where the loop ran Boot→M7. The procedure is what worked there; the dimensions, gates and hazards
> below are re-derived for **this** app, which is a very different thing: a UI-first Next.js prototype
> with no backend, no tests and no deploy target yet.

## What "ship" can even mean here (read before Boot)

This repo renders **mocked fixtures** (`app/_studio/`). There is no backend, no persistence, no auth
and no third-party service, on purpose. So the ship bar is NOT "production SaaS" by default — force
that question at CP0 and write the answer into `state.md`. The realistic bars, in order of ambition:

1. **Shareable prototype** — deployed somewhere the user can send a link (Cloud Run / Firebase
   Hosting / Vercel), honest that it is a prototype, fast and correct on a phone and a laptop.
2. **Design-partner demo** — the above + every state a real production reaches is representable and
   legible, plus a `/uat` roster that passes L2.
3. **Product v1** — the above + a real backend behind the fixture seam. **This is a different
   project**, not a milestone: it needs its own architecture decision, and the loop should say so
   rather than accumulating backlog items toward it.

The repo name says `gcloud`, so bar 1 most likely means Google Cloud. Do not assume it — ask at CP0
and record it, because the ops dimension is meaningless until the target is named.

## State files (in `.vault/ShipLoop/`, at the repo root — gitignored)

| File | Contract |
|---|---|
| `state.md` | Current truth: ship bar, scorecard, milestone status, environment notes. Rewrite freely; keep it one screen of load-bearing facts. |
| `backlog.md` | Item table `# / status / dimension / size / description`. **Numbering append-only — never renumber.** Statuses: ☐ todo · ◐ in progress · ☑ done · ✕ cut. |
| `journal.md` | Append-only, one line per event (item done w/ commit SHA, CP resolution, gate result, root-caused saga). Never edit past lines. |
| `decisions.md` | CP answers from the user + auto-decisions taken while AFK (each marked "pending user review at CPn"). |
| `value-case.md` | Dimension-8 (value & market) synthesis. Written once by the value lens, corrected only with code-verified evidence. |
| `archive-*/` | Frozen state of previous loops. Read-only. |

## The 8 scorecard dimensions

1-Build · 2-Functionality · 3-Tests · 4-UAT · 5-Design-language fidelity · 6-UX & accessibility ·
7-Ops (hosting/CI/deploy) · 8-Value & market. Each is 🔴/🟡/🟢 in `state.md`. Dimensions 4 and 8 run
as **lenses** (audit passes that emit backlog items), not fixed at boot.

Two are re-pointed from the engine's originals, and the difference matters:

- **3-Tests starts at 🔴 and is honest about it.** This repo has **no test suite and no linter**. The
  first test is a real decision (Vitest + Testing Library, matching the parent project) and belongs in
  a milestone, not in a gate that pretends it already exists. Until then, "gates green" means types +
  build + a driven browser, and every journal line must say exactly that.
- **5-Design-language fidelity replaces the engine's packaging/security dimensions**, which have no
  referent here (nothing is packaged, nothing is exposed). It scores: no colour literal outside
  `components/ui/tokens.ts`, primitives reused rather than re-rolled, motion entrance-only and
  reduced-motion-safe, and every surface able to render the states its types admit. It is the thing
  most likely to rot silently while the product looks fine.

Security is not absent, it is *narrow*: no secrets in the repo, no `dangerouslySetInnerHTML` beyond
the token stylesheet, and dependency advisories (`npm audit`). Score those under 1-Build and escalate
anything real to a blocker immediately.

## Phases

### Boot (`/ship-loop boot` — only for a fresh loop)
1. Archive any existing `.vault/ShipLoop/` contents to `.vault/ShipLoop/archive-<slug>/`.
2. Run the audit lenses → seed `backlog.md` + the initial scorecard in `state.md`:
   - **Build health**: `npx tsc --noEmit`, `npm run build`, `npm audit`. Record exit codes, not impressions.
   - **Functionality honesty**: does `README.md` claim anything the app does not do? Does any surface
     imply capability the fixtures cannot back?
   - **Coverage of load-bearing paths**: which behaviours would break silently — the phase rail's
     state derivation, the library's filtering, anything computing over fixtures.
   - **Design-language fidelity**: grep for hex/`rgb(` outside `tokens.ts`, hand-rolled primitives,
     JS-driven motion that escapes the reduced-motion rule.
   - **Ops/deploy path**: is there ANY deploy target? (Today: no.) What would the smallest one be?
3. **CP0**: present scorecard + backlog; ask for **the ship bar (see above), the deploy target, and
   the first milestone scope**. If AFK, record provisional picks in `decisions.md` and proceed on the
   least-destructive batch — never on a bar or a hosting choice, which are the user's alone.

### Resume (default)
1. Read `.vault/ShipLoop/state.md`, then `backlog.md` and the tail of `journal.md`. Do NOT re-audit
   what the scorecard already scores.
2. Register in `.vault/active-runs.md` (create if absent), naming any dev-server port you take.
3. Continue: an in-flight milestone → keep executing; a completed one → run/finish its gate; gate
   green → next checkpoint.

### Checkpoint (CPn — before each milestone)
- Present: scorecard delta, recommended next milestone (a coherent batch of backlog items, usually
  4–8 by theme: the honest-states batch, the first-test batch, the deploy batch…), and any product
  decisions the work needs. One question at a time, single-keystroke answerable.
- **AFK protocol**: ask twice ~60s apart; if silent, record a provisional pick in `decisions.md`
  (least-destructive option, marked for re-ask), avoid product-call and dependency edits while AFK,
  and never commit destructive changes on a provisional.

### Execute (milestone)
- One backlog item = one atomic commit, referenced by SHA in `journal.md`. Fan out parallel subagents
  only for disjoint paths — and in this repo, `components/ui/tokens.ts`, `app/globals.css` and
  `package.json` are **single-owner files**: never hand two agents write access to them.
- Respect foreign in-flight work (ledger + `git status` scan; stage only your paths).
- Defer any item whose files are another session's hot area — mark it in `backlog.md` with the
  reason; don't fight over files.
- **Premise-check before executing.** Audits overstate. Verify the claim against current code first —
  and in this repo add the local check: *is the thing I'm about to fix a product defect or a fixture
  value?* Rewriting a component to fix a number that lives in `app/_studio/scenes.ts` is the
  characteristic wasted milestone here.

### Gate (after every milestone — certifies it)
1. `npx tsc --noEmit` — must be clean.
2. `npm run build` — must be green. It runs TypeScript again and is the only check that catches an
   App Router mistake.
3. UI touched → **drive it**: `npm run dev -p 3177` (never 3000), walk every phase and the library,
   and check the three conditions that are cheap and always break — a 768px viewport,
   keyboard traversal with a visible focus ring, and `prefers-reduced-motion: reduce`. Screenshot
   what you assert. Kill the server you started; never one you didn't.
4. Tests, once they exist → `npm run test -- --run`, serialized before the browser pass.
5. Record the gate line in `journal.md` — naming **which** checks actually ran — flip the milestone ☑
   in `state.md`, and update the scorecard.

> **Never invent a gate command.** There is no `npm run lint` and no `npm test` in this repo today. A
> journal line claiming one is fabricated evidence, and it is the easiest lie in this loop.

### Wrap (session end)
Update `state.md` + the ledger entry (commit SHAs), leave no uncommitted work. The next session
resumes from files alone.

## Invariants

- **User owns product calls.** Ship bar, deploy target, scope narrowing, adding a dependency, and
  anything that touches the fixture seam's contract are CP questions — never auto-decided, only
  provisionally deferred.
- **Honesty over green.** A gate that passes while the claim is unverified is not done — distinguish
  "code-verified" from "subagent-claimed" in every journal line. In a repo with no tests, this is the
  only thing standing between the scorecard and fiction.
- **A mocked product may not be scored as a working one.** Dimension 2 (Functionality) scores what
  the *interface* can do; it goes 🟢 when a Character can complete the journey through the studio's
  screens, not when a fixture happens to contain a finished film.
- **Lenses emit items, items get numbers, numbers never change.**
- **Feed the loop.** A backlog item that turns out to be product design rather than repair belongs in
  `.vault/Perfect/directions/` with the user's acceptance — `/perfect` builds those; `/ship-loop`
  hardens what exists.
