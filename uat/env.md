# Environment for L2

- **App:** `NEXT_PUBLIC_DEV_AUTH=1 NEXT_DIST_DIR=.next-drive npx next dev -p 3183`
  The bypass is non-production-only (`lib/devAuth.ts`) so it must be `next dev`.
  **Never use port 3000** — the user's own server lives there.
- **Preflight:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3183/projects` → 200,
  and the `dev-auth-banner` testid must be present or the run reports nothing.
- **Driver:** Playwright chromium (`@playwright/test`, already a devDependency).
  `uat/driver/drive-script.mjs <runName> <<'EOF' … EOF` — inline steps, one process,
  one JSON journal on stdout. Exit `0` = every expect held · `1` = driver threw ·
  `2` = an expect FAILED (a finding).

## Where the data lives — and the persistence rule (2026-09-05)

All product data — projects, step records, themes — is **IndexedDB in the
browser profile**. There is no server database. So:

- L2 drives a **persistent profile** at `uat/.profile/` (gitignored). Every
  project a run creates stays there, across runs and across sessions; nothing
  in the driver deletes it. Open it by hand with
  `node uat/driver/drive-script.mjs --headed …` to see what the Characters left.
- Each run also **exports what it wrote** to `runs/<id>/created.json` (project
  ids, titles, disciplines) — the record the persistence rule asks for.
- Isolation is by PROJECT, not by context: each Character creates their own
  project, so state never leaks between Characters. Do not reuse a project
  across Characters.
- The account is `dev-automation-user` (devAuth). A fresh profile seeds the six
  demo projects on first `/projects` mount (`app/_studio/projectSeed.ts`).

## Fixtures each journey needs

| Journey | Needs | How |
|---|---|---|
| rebalance-a-script | `seed-why-bitcoin` researched | seeded on `/projects` mount |
| compose-from-scratch | nothing — the Character creates the project | wizard at `/projects/new` |

**Style stage precondition:** a fresh account has NO locked theme. The wizard
offers the six presets, which are all tagged `educational`; whether a trailer
or free project can be created on a fresh account is therefore a finding, not
an assumption — preflight it.

## Grounding — the shared denominator

The research and script surfaces are **replayed fixtures**: the research run
walks a stored trace and lands on the Bitcoin notebook whatever the topic; the
beat board deals the Glass Harbor slots whatever the logline. Score every AI
surface against this ONE list (per-Character additions are named, never a
different denominator):

`research-run` — sources the output should use: (1) the typed topic, (2) the
project's logline, (3) the discipline/template, (4) the target runtime, (5) the
account's prior notebooks. Fixture reaches 0/5.
`beat-board` — (1) logline, (2) template (teaser/trailer/cinematic), (3) target
runtime, (4) the locked style's tone. Fixture reaches 0/4.
`script-candidates` — (1) the scope decisions, (2) the runtime, (3) the
template band, (4) the notebook. Reads (1),(3),(4) live; runtime from the
render fixture, not the project → 3/4.

## What L2 may and may not judge here

Every render is a mocked fixture. L2 judges **the interface and the contract**
— what is shown, refused, labelled and gated — and whether a Character can
finish the job and TELL that the material is a stand-in. It must not judge
"output quality"; nothing generates. Recalibration is a real model turn and is
optional in this journey.
