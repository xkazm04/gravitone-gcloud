# Deployment

**Status: no deployment target — deliberate.** Nothing in this repository
publishes anywhere. CI (`.github/workflows/gates.yml`) is a verification
pipeline only: it proves what was written and what was assembled, and then
stops. The "gcloud" in the project name refers to APIs this studio *consumes*
— Google AI Studio (Gemini image/vision models) and Firebase Auth — not to any
hosting on Google Cloud. There is no deploy step to break, so every guarantee
here is about the *tree*, not a running service.

(Registry standard this document follows:
`knowledge/software-engineering/engineering-process/continuous-integration/deployment-contract/`.)

## The delivery contract

- **Topology: direct push to main.** No release branches, no environments.
  What lands on `main` is the product.
- **`npm run verify` is the full blocking gate.** The gate list is declared
  once, in `pipeline/gates.mts` (id, npm script, blocking/advisory, `needs`,
  exit-code protocol, rationale). `verify` is `node pipeline/run-gates.mts`:
  it runs every blocking gate in registry order, reports EVERY verdict rather
  than stopping at the first, keeps exit 2 (could-not-run) apart from a fail,
  never starts `check:bundle` unless `build` passed, and writes
  `.gate-report.json`. `node pipeline/run-gates.mts --list` prints the set.
  The `gates` CI job keeps one step per gate, and
  `tests/golden-path/verify-ci-parity.probe.spec.ts` fails unless those steps
  equal the registry's blocking set in order. Adding a gate = a registry entry,
  its npm script, its `gates.yml` step; the probe is red until all three exist.
  A `pipeline/*-regression.mts` or `pipeline/check-*` that no gate runs fails
  the run (gate liveness) unless `UNREGISTERED` in `gates.mts` says why.
  `--parallel` is opt-in (on Windows `npm test` and `build` contend);
  `npm run verify:serial` is the old `&&` chain, kept as the rollback and held
  to the same list by the same probe.
- **The pre-push hook enforces it on main.** `.githooks/pre-push` (wired via
  `core.hooksPath`, set by the `prepare` script on every install) runs
  `npm run verify` before any push that updates `refs/heads/main`. Other
  branches push freely; CI covers them.
- **Escape hatch:** `GRAVITONE_SKIP_GATE=1 git push` skips the local gate,
  and the hook prints the skipped gates from `run-gates.mts --list`.
  Emergencies only, and the reason gets recorded — in the commit message or in
  the skip log below. CI still renders the real verdict either way.
- **A red main is an outage.** With no deploy to roll back, the tree itself is
  the deliverable, and a red `gates` run means nobody downstream can trust
  their own diff. Fixing it comes before the next feature, every time.
- **After every push to main:** `gh run watch --exit-status` — the local gate
  is a mirror, the remote run is the verdict. The `live` job (real-browser
  golden path) stays remote-only on purpose: it needs a ~150MB Chromium and
  minutes of wall clock, which is too slow for a pre-push gate.

### Skip log

*(empty — every `GRAVITONE_SKIP_GATE=1` push records its reason here or in its
commit message)*

## Build contract

- **Node version authority: CI's pin.** `gates.yml` pins `node-version: 22`
  in both jobs, and that is the single declared authority for the toolchain.
  Local development on a newer Node is tolerated — but when local and CI
  disagree, CI's verdict is the contract. (There is no `engines` field in
  `package.json` today; if one is ever added it must match the CI pin.)
- **Windows lockfile caveat** — verbatim from `gates.yml`, at the `install`
  step, because it bites exactly here:

  > FOOTGUN, MEASURED 2026-08-24. This repo is maintained from Windows, and
  > `npm install` there resolves only the optional native/wasm packages that
  > match the host platform. The hoisted entries the LINUX tree needs
  > (@emnapi/core, @emnapi/runtime — pulled in by @tailwindcss/oxide-wasm32-wasi
  > and @img/sharp-wasm32) get pruned out of the lock, and this step is the
  > only thing in the project that can see it. `npm install
  > --package-lock-only` on Windows will strip them again. If this step ever
  > reports "Missing: @emnapi/... from lock file", re-add the hoisted entries
  > rather than regenerating the lock on a Windows box.

- **The build proves absence degrades.** CI's `build` step runs with a
  deliberately empty environment: the optional-dependency contract says an
  absent key must degrade, never crash, and a green empty-env build is the
  proof.

## If a hosting target is ever chosen (likely Vercel)

What it would need, and nothing it would get for free:

- **Environment inventory** (names and purpose; values and full operational
  notes live in `.env.example`):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID` — Firebase web config for Google
    sign-in; public by design, secured by the authorized-domain list. Unset is
    a supported posture (auth off, gated routes fail closed).
  - `GOOGLE_AI_API_KEY` plus its model vars `GOOGLE_IMAGE_MODEL`,
    `GOOGLE_VISION_MODEL`, `GOOGLE_IMAGE_SIZE` — Google AI Studio: image
    generate/edit and recognition. Server-only secret.
  - `LEONARDO_API_KEY` — Leonardo, the dev re-route target for generation.
    Server-only secret.
  - `IMAGING_ACCESS_SECRET` (+ its public browser copy
    `NEXT_PUBLIC_IMAGING_ACCESS_SECRET`) — the shared access secret gating
    the money/compute routes per `lib/apiAuth.ts`; the routes fail closed
    (401) without it.
- **An `engines`-based Node pin** in `package.json`, matching the CI pin, so
  the host resolves the same toolchain the gate graded.
- **The registry's deployment-contract subject** as the standard to implement
  against:
  `knowledge/software-engineering/engineering-process/continuous-integration/deployment-contract/`.
