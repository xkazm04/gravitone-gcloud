---
product: "Gravitone Studio"
stack: "Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4. No database — the studio's data is browser IndexedDB. Server-only vendor seams: lib/imaging, lib/music, lib/text, lib/foundry."
runtime_floor: "node 20+ (next 16). Measured working on node 24."
preflight: "npx tsx pipeline/preflight.mts"
preflight_json: "npx tsx pipeline/preflight.mts --json"
preflight_selftest: "npx tsx pipeline/preflight.mts --selftest"
env_example: ".env.example"
env_local: ".env.local"
record: ".vault/Onboarding/"
---

# onboarding overlay — gravitone-gcloud

Scaffolded 2026-08-29. The engine is `.claude/skills/onboarding/SKILL.md`; this file is only what is
true *here*.

## The preflight is the authority

```bash
npx tsx pipeline/preflight.mts             # the ladder, for a human
npx tsx pipeline/preflight.mts --json      # the same reading, for a tool
npx tsx pipeline/preflight.mts --tails     # + last-4 of each secret that is set
npx tsx pipeline/preflight.mts --selftest  # proves the capability loop is matrix-driven
```

It imports this repo's real predicates — `capabilities()`, `ABSENCE_REASON`, `localPosture()`,
`describePosture()`, `LOCAL_MODE`, `firebaseReady`, `FIREBASE_VARS`, both `isConfigured()`s, both
routers' `planFor()`, `isMusicConfigured()`, `accessSecret()`/`ACCESS_SECRET_VAR` — and reports what
**they** say. **Do not restate its findings from this file; run it.** Every table below exists to
tell you where a verdict comes from, never to substitute for one.

It contacts no vendor, writes nothing, and spends nothing. `--selftest` proves the one claim it
makes about itself: hand `capabilityRows` a matrix with keys that exist in no source file and they
come out as rows, because the loop walks `capabilities()` rather than a list inside the script.

## zero_config — say this first, always

**`NEXT_PUBLIC_LOCAL_MODE=1` gives a fully working studio with zero credentials and zero accounts.**

Projects, steps, themes, assets and all five phase surfaces (Research · Script · Frames · Score ·
Cut), on this machine, right now. The data layer never needed a server: `lib/studioDb.ts` is raw
IndexedDB with no dependency and no Firestore. Firebase was only ever the doorman, and local mode
satisfies the gate with a stable local identity instead of dropping it.

It is documented at `.env.example:18-31` — **below** a Firebase block the reader does not need,
which is exactly why nobody finds it. Lead with it.

`.env.local` is gitignored here (`.gitignore:34` is `.env*`, with `!.env.example` at :38), so an
appended secret does not land in a commit. Confirm that is still true before writing, every time.

**What local mode does NOT do, and the operator must be told both:**
- Work lives in **this browser profile** and syncs nowhere. That is the posture and the caveat.
- It does **not** open the money routes. `IMAGING_ACCESS_SECRET` (+ its `NEXT_PUBLIC_` twin) is
  still required by `lib/apiAuth.ts`, which fails closed. Being local changes *who you are*, not
  *what spending requires*.
- Anything that generates — a plate, a cue, a clip — still needs its vendor key. Local mode gets you
  the whole studio; it does not get you a render.

## ladder — cost order, and the predicate that decides each rung

| # | Rung | Cost | Decided by |
|---|---|---|---|
| 1 | Studio shell · projects · steps · themes · assets | free, instant | `lib/studioDb.ts` — nothing to configure |
| 2 | Identity — local mode | free, instant | `lib/localMode.ts` · `LOCAL_MODE` |
| 2b | Identity — Firebase (only if you want real Google sign-in) | free account | `lib/firebase.ts` · `firebaseReady` / `FIREBASE_VARS` |
| 3 | Reasoning · rung 1 — the machine's `claude` binary | **no key**; bills the operator's logged-in seat | posture: `lib/deployment.ts` · `localPosture()` · probe: `lib/claudeCli.ts` · `probeClaude()` |
| 4 | Route access gate | free — a locally-chosen string | `lib/apiAuth.ts` · `accessSecret()` |
| 5 | Reasoning · rung 2 — Gemini | metered | `lib/text/env.ts` · `isConfigured("google")`; chain from `lib/text/router.ts` · `planFor()` |
| 6 | Imaging · generate / edit / recognize | metered, per render | `lib/imaging/env.ts` · `isConfigured()`; chain from `lib/imaging/router.ts` · `planFor()`, split by `IMAGING_ENV` (`dev`\|`prod`) |
| 7 | Music · generate (Score) | metered | `lib/music/elevenlabs.ts` · `isMusicConfigured()` |
| 8 | Local video render (ComfyUI) | hardware | `nvidia-smi`, then `pipeline/vlm-probe/guard.py --status` |

**Rung 3 is the one newcomers are never told about.** It needs no key, no account and no vendor: if
the operator already has a `claude` login on this machine, the reasoning routes work for free. Offer
it before Gemini, every time.

## absent_by_design — no key reaches these

Never present one of these as "not set up yet". Each has its sentence written in the repo already —
quote `ABSENCE_REASON[<key>]` from `lib/capabilities.ts`, do not compose your own.

| Capability | Why it is absent, and where that is written |
|---|---|
| Reasoning rung 3 (a no-model floor) | **Deliberately does not exist.** `lib/text/router.ts` "NO FLOOR": there is no heuristic that writes an edit plan and no rule-based art direction — the first version of that step *was* such a table and it produced a narrated slide deck. The bottom of the ladder is an honest refusal naming every engine tried. `LadderRung` has no `floor` member so nothing can quietly claim otherwise. |
| Music section-edit · Music SFX | In the **cloud** posture only: ElevenLabs' stored-song inpainting and its sound-effect model have no Google Cloud equivalent — a missing product surface, not a model difference. `lib/capabilities.ts:63-77`. Locally, with a key, both work. |
| Local video render | Needs a GPU rig running ComfyUI with 24GB-class VRAM — the annotator alone measured **22.3 GB resident**. Not portable to the hosted posture. `lib/capabilities.ts:79-88`. |
| Desktop tooling | Structurally impossible when hosted: it assumes the app and the operator share a machine. `lib/capabilities.ts:90-95`. |

Note the two axes. `NEXT_PUBLIC_CAP_*` flags default **on**, so a normal checkout has everything
enabled and a hosted deployment turns things off on purpose. So an absent row here means either the
flag was turned off deliberately, or the hardware/posture is genuinely missing — and the preflight
prints which.

## vendors

One account each. Every one of them is optional; none is needed to see the studio.

| Variable | Account | Page | Notes worth repeating |
|---|---|---|---|
| `IMAGING_ACCESS_SECRET` + `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` | **none** | — | **The R4 exception.** Locally chosen, not vendor-issued. You may offer to generate it — and you must write **both** halves in the same edit, because the gate fails closed and the browser can only present the secret that shipped in its bundle. Gates imaging, music, frames, recalibrate and foundry. |
| `GOOGLE_AI_API_KEY` | Google AI Studio | see `.env.example`'s own comment | One key, two seams: the text engine's cloud rung *and* all three imaging capabilities. Both `AIza…` and `AQ.…` shapes work. |
| `LEONARDO_API_KEY` | Leonardo | linked in `.env.example`'s Leonardo comment | Dev **re-route target** for generate, not the default — it reads no style references. |
| `QWEN_API_KEY` | Alibaba DashScope | see `.env.example` | Recognition in dev. `QWEN_BASE_URL` only if the account lives on the Beijing host. |
| `ELEVENLABS_API_KEY` | ElevenLabs | see `.env.example` | The Score step's render. Cues are written and edited without it; only the render is gated. |
| `NEXT_PUBLIC_FIREBASE_*` (3) | Firebase console → Project settings → Web app | see `.env.example` | Only if you want real Google sign-in. A **partial config is a missing config** — all three or none. |

**Take the link from `.env.example`'s comment block, not from this table and not from memory.** The
preflight already does exactly that, and this table deliberately does not duplicate the URLs so that
it cannot come to disagree with them.

## verify

`free` — run these, they cost nothing and contact nobody:

- `npx tsx pipeline/preflight.mts` — re-read the ladder after any change
- `npm run typecheck`
- `npm run lint:ratchet` — **fails in EITHER direction** against `lint-baseline.json`; a drop is as
  fatal as a rise. Never re-baseline as part of onboarding.
- `npm run check:manifest`
- `npm test` — Playwright golden-path, offline, bills nothing
- `npx tsx pipeline/verify-text-engine.mts` — posture + zero-token probes

`spends` — **print the command, do not run it**, and mark the capability *unverified*:

- `npx tsx pipeline/verify-text-engine.mts --spend` — real turns through the router
- `npx tsx pipeline/verify-text-engine.mts --roster` — free at the vendor, but it *is* a network
  call to Google. Ask first anyway; "free" is the vendor's word, not the operator's policy.
- `npx tsx pipeline/integration-imaging.mts` — real renders, real balance
- anything under `npm run test:live`

## never_touch

- `.env.local` beyond **backup + append** of values the user pasted in this session
- `.env.example` — if it disagrees with `lib/`, that is a **finding**, reported with both locations
- `lint-baseline.json` — a measurement, and re-baselining is a human diff whose commit names the cause
- `package.json` / `package-lock.json`, `context-map.json`, `components/ui/tokens.ts`,
  `app/globals.css` — Director-only in this repo (see `.claude/perfect/config.md` `## Class C`)
- `lib/**` — onboarding reads predicates; it never edits them to make a report nicer

## Known findings on this repo (2026-08-29)

Carry these forward rather than rediscovering them:

- **`pipeline/vlm-probe/guard.py --status` crashes on a machine with no NVIDIA driver.** `status()`
  calls `vram()` which shells straight to `nvidia-smi`, unguarded, so you get a `FileNotFoundError`
  traceback instead of a reading. The preflight probes `nvidia-smi` first and skips the guard rather
  than reproducing the crash. Not fixed — reported.
- **`.env.example`'s access-gate block names only `app/api/imaging/{generate,edit,recognize}` and
  `app/api/frames` as gated.** `app/api/music/*`, `app/api/recalibrate` and `app/api/foundry/*` are
  gated too (`app/api/recalibrate/route.ts:296-304` records that recalibrate was the one omission,
  since fixed). Newcomers reading only `.env.example` will under-estimate what the gate controls.
- **`lib/localMode.ts` exports the predicate `LOCAL_MODE` but not the variable name behind it**, so
  the preflight is the one place that spells `NEXT_PUBLIC_LOCAL_MODE` out. It cross-checks the name
  against `.env.example` and reports a discrepancy if it stops appearing there, so a rename
  surfaces instead of quietly lying — but an exported `LOCAL_MODE_VAR` would remove the need.
- **`lib/claudeCli.ts` spawns `claude` as `(cmd, args[])` with `shell: true`**, which node 24 flags
  as `DEP0190`. Harmless here (no interpolated input), but it prints a deprecation warning into any
  script that reuses the probe. The preflight filters that one warning out of its own output.
