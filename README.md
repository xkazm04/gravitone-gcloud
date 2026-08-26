# gravitone-gcloud

A content creation studio, prototyped UI-first. Next.js 16 (App Router,
Turbopack) + React 19 + Tailwind v4.

## What this is

A studio extracted from `dolla/arm/gravitone/web`'s `/studio` route on
2026-08-11 and cut loose from the Arm hackathon project it grew inside. Three
routes:

- **`/`** — the door. No copy at all: a contact sheet of the fixture project's
  own frame candidates at page scale, and one button that opens Google sign-in.
- **`/projects`** — the shelf, drawn as a progress matrix: projects down, the
  five steps across, one thin row each. Read a column and you see where the whole
  shelf is jammed. Create, edit and delete live here. Signed-in only.
- **`/studio?p=<id>`** — one production walked through five steps: Research
  (Triage board), Script (Manuscript), Frames (Lightbox — the still AND the
  clip made from it), Score (Spotting), Cut (Timeline), over a **Library**
  view (Shelves) where
  every asset is captioned, filed and traceable to the direction that made it.
  Signed-in only, and it needs a project — `/studio` on its own is a redirect
  back to the shelf.

**Auth is Google, and only Google** — Firebase Auth, ported from the parent
project, same Firebase project (see `.env.example`; three public variables, no
service account, no server). Every gated route fails CLOSED: no config means
nobody gets in, not everybody — and a config missing *any* of the three
variables counts as no config (`firebaseReady`, `lib/firebase.ts`).

**…except in local mode.** `NEXT_PUBLIC_LOCAL_MODE=1` runs the studio as a
fixed local owner with no Firebase at all (`lib/localMode.ts`) — the
self-hosted single-user posture this paragraph always implied, now a flag
instead of a fork. Nothing about the data changes, because nothing about the
data ever involved Firebase: it lives in the browser's IndexedDB either way.
Local mode wears a quiet "local" badge, has no sign-out (there is no session
to end, and the eviction one would trigger is the opposite of what a local
owner wants), and does not relax the money-route access gate.

**Sessions do not expire.** A 12-hour client-side ceiling existed until
2026-08-12 and was removed at the owner's instruction, so this is the policy
rather than an omission: `browserLocalPersistence` holds the refresh token
across reloads, browser restarts and closed tabs, `sessionExpired()` returns
`false` unconditionally, and the enforcement loop that signed a stale user out
is gone. Signing in once is signing in until the user signs out or Google
revokes the token; there is no server-side session to revoke either, because
there is no server. The cost is stated in full where the policy lives
(`lib/firebase.ts`) and is worth repeating here: **a session left on a shared
machine never ends on its own.** Re-introduce a ceiling before this holds
anything that would matter if a second person opened the laptop.

**Projects are real, and so is a growing share of what they contain.** A project
record — name, logline, template, target runtime, per-step progress — is created
by the user and persisted to the browser's IndexedDB (`lib/studioDb.ts`,
`lib/projects.ts`), and each step's own content is persisted beside it
(`app/_phases/_shared/stepStore.ts`). Below that seam, `app/_studio/*.ts` still
holds fixture data (scenes, runs, assets, score cues).

**Three paths now call out of this app, and all cost real money.** This sentence
used to read "no model, backend or third-party service is called anywhere in
this app". That was true when it was written and is not true now:

- **A local `claude` CLI process** (`lib/claudeCli.ts`), spawned server-side by
  `/api/recalibrate` and `/api/frames`. It authenticates with the machine's
  logged-in Claude subscription rather than an API key — there is no key to
  hold or leak, and a recalibration is a minutes-long Opus 5 turn billed to
  that subscription.
- **Three image vendors** — Google, Leonardo and Qwen — reached only through one
  chokepoint (`lib/imaging/router.ts`), each behind its own key
  (`lib/imaging/env.ts`) and billed per call (`lib/imaging/pricing.ts`). A plate
  is generated for money; a fully composed sixteen-frame cut is sixteen of them.
- **A music vendor** — ElevenLabs, reached only through `/api/music/generate`
  (`lib/music/`), behind `ELEVENLABS_API_KEY`. The Score phase's cues render
  through it: the cue row (title, intent, bpm, exact duration) is translated
  server-side into a section plan, so the browser never speaks the vendor's
  wire format and the briefing doctrine lives in one file (`lib/music/plan.ts`).
  Spend is gated by the same access gate as imaging but not yet by the budget
  ledger — the rate limit is the only ceiling, stated in the route.

Everything else still follows the original plan: prototype the flow at the UI
layer first, and only then decide what the backend and the providers have to be.

## Who owns what

This repo is managed by the **Personas** app (project `gravitone`). Two artifacts here are generated
by it and must not be hand-edited — the next scan overwrites both from its database:

- `context-map.json` — the context taxonomy every skill in `.claude/skills/` reads.
- the `<!-- personas:context-map -->` block inside `CLAUDE.md`.

To change the taxonomy, change it in the app (Dev Tools → Context Ledger) and rescan. Everything
else in this repo — including `README.md`, `AGENTS.md` and the skills — is hand-authored and yours.

## Layout

```
app/page.tsx        the door — the wordless landing
app/_landing/       the door's art + the Enter button
app/projects/       the shelf (gated)
app/_projects/      the shelf's surface — the progress matrix + the create/edit dialog
app/studio/         the studio (gated) — the one-row stepper and the step router
app/_studio/        shared fixtures, types and small render parts
app/_phases/<step>/ one directory per production step (research · script · frames · score · cut)
                    — each step grows its own components, state and step-only fixtures here
app/_library/       the Shelves library view
components/ui/      the design language (see below), plus AuthGate, UserMenu and the form primitives
lib/                auth + storage: firebase, useAuth, studioDb (IndexedDB), projects, useProjects
knowledge/          craft knowledge per project template and production step (see below)
pipeline/           terminal-first prototype of topic -> notebook -> script (see below)
```

## The knowledge library

`knowledge/` holds what we know about **making the content**, as opposed to building the app: one
folder per project template, one per production step, each with grounded craft rules
(`PATTERNS.md`), machine-readable defaults the UI consumes (`params.json`), the sources those rules
came from, and the corpus they cite.

It exists because the prototype's real blocker was not UI, it was grounding: a step designed without
craft rules produces surfaces invented from intuition, and output that is shallow because nothing
told it what good looks like. Every claim in there carries an evidence label (MEASURED · OBSERVED ·
INFERRED · ASSUMED) and a sample size.

**Read the relevant `PATTERNS.md` before designing or building a step surface**, and
`knowledge/CRAFT-BASELINE.md` before that — it holds the narrative theory every step builds on, and
names the failure the library prevents: the *wiki timeline*, correct facts joined by "and then",
accurate and unwatchable.

First entry: `knowledge/templates/short-educational-video/steps/01-script/` — beat composition for
educational video, from Economics Explained and Fireship. It identifies two narrative engines and the
one law (every adjacent beat joined by BUT or THEREFORE). `/research` (craft mode) writes these.

## The script pipeline

`pipeline/` is where the Script phase is being fine-tuned by hand before it becomes UI. The shape:

```
topic  →  notebook.json  →  script renders
          (the asset)       (disposable)
```

A **notebook** is researched once and rendered many times — different engines, lengths and tones.
It stores tensions, mechanisms and pre-linked causal chains rather than prose, which is why one
notebook can produce a 5-minute reversal chain, a 4-minute adjudication and a 45-second derived clip
with no additional research. `pipeline/RESEARCH-PROMPT.md` is the instruction set being tuned;
`pipeline/runs/*/NOTES.md` is where each run's process findings land.

## The design language

Carried over intact so the extraction changed no pixels:

- `components/ui/tokens.ts` — **the single source of truth**, and the only file
  here allowed to contain a colour literal. It exports both the TS constants
  components render with (`SURFACE`, `TEXT`, `EASE`) and the `--gt-*` custom
  properties CSS reads.
- `components/ui/GravitoneTokens.tsx` — emits those properties as a
  server-rendered `<style>` in `app/layout.tsx`, so they resolve on first paint.
- `app/globals.css` — consumes the vars: aurora, grain, glass panel, focus ring,
  themed scrollbars. It holds no colour literal that draws anything. The three
  hand-written `rgba(103,232,249,…)` scrollbar values became
  `--gt-scroll-thumb{,-hover}`, and `.chip-tech` went with the rest of the dead
  code. What remains are two hex values **inside comments** — `--gt-ink`'s own
  value where the focus ring's contrast is explained, and the ~13.7:1
  measurement — which the rule exempts by name: prose recording a measurement is
  not a colour that draws chrome.

  The rule itself is scoped rather than absolute, because it had to be. Three
  standing exemptions: Tailwind utility classes (names, not literals); **style
  preset data** in `app/library/presets.ts` and `LibraryAtelier.tsx`, whose hexes
  describe what a *generated image* should look like and are prompt input rather
  than furniture; and prose like the above.
- `components/ui/Primitives.tsx` — Eyebrow, Panel, Button, Waveform, Wordmark.
- `components/ui/StudioFrame.tsx` — the app shell (aurora + nav). Descended from
  the source repo's `AppFrame`, and it carries **no auth gate of its own**. The
  gate exists — it is `components/ui/AuthGate.tsx` — and it is mounted
  **per route**: `app/projects/page.tsx`, `app/studio/[projectId]/page.tsx` and
  `app/library/page.tsx` each wrap their view in it. That is deliberate and
  should stay: the landing page uses no frame at all, so a gate inside the frame
  would gate nothing the frame does not already contain, while leaving the one
  ungated route looking gated. Add a gated route by wrapping its page, not by
  touching the shell.

Deliberately left behind in the source repo: the AudioBus / narration / feedback
docks, Sentry, the API-key and voice modules. (Firebase auth was on that list
too, and came back — see the auth paragraph above.) The Signal
Layer CSS in `globals.css` is kept but currently inert — no bus writes the
channels yet; the comment there says so and says what mounting one would take.

## Develop

```
npm install
npm run dev     # http://localhost:3000
npm run build
```
