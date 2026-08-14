# Environment for L2

- **App:** `NEXT_PUBLIC_DEV_AUTH=1 NEXT_DIST_DIR=.next-drive npx next dev -p 3183`
  The bypass is non-production-only (`lib/devAuth.ts`) so it must be `next dev`.
  **Never use port 3000** — the user's own server lives there.
- **Preflight:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3183/projects` → 200,
  and the `dev-auth-banner` testid must be present or the run reports nothing.
- **Driver:** Playwright chromium (`@playwright/test`, already a devDependency).
- **Fixture:** project `seed-why-bitcoin` — the only seeded project that ships
  researched (`_shared/stepStore.ts::seededFor` matches `/bitcoin/i`). Projects
  are seeded into IndexedDB when `/projects` mounts, so **visit `/projects`
  before deep-linking** into `/studio/<id>` or the guard redirects.
- **Isolation:** each scenario uses a fresh browser context. Scope, notes and
  versions persist to IndexedDB per project, so a reused context carries state
  between scenarios and will produce false passes.

## What L2 may and may not judge here
Every render on this surface is a MOCKED fixture and the recalibration is a
deterministic transform, not a model call. L2 judges **the interface and the
contract** — what is shown, refused, labelled, and gated. It must not judge
"output quality", because nothing generates.
