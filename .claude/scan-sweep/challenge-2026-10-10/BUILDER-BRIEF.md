# Challenge run 2026-10-10 — builder brief

- Repo: C:/Users/mkdol/dolla/gravitone-gcloud, branch `main`. **Commit on this branch; NEVER push, never open a PR.**
  Start every bash call with `cd /c/Users/mkdol/dolla/gravitone-gcloud &&` (a persisted `cd` breaks later calls).
- You are ONE of up to four builders in this SAME checkout at once, plus an unrelated foreign session editing
  `app/foundry/pipeline/*` (uncommitted). Never touch, stage, stash, reset or format anything outside your write set.
- Your card: `.claude/scan-sweep/challenge-2026-10-10/cards/<context>.json`, the entry whose slot you were given.
  The critic's verdict for it is in `critic.json` (same context+slot): **its `revise_change` is part of your card — apply it.**
- Read AGENTS.md (this Next.js differs from your training data; read node_modules/next/dist/docs before Next-specific code)
  and CLAUDE.md's "The app does not explain itself" law (no explanatory prose slots; use components/ui/signal/; both worlds;
  accessibility text is not narration).
- Baseline is RED for foreign reasons: see `BASELINE.md` in the run dir. A red gate whose failing paths are only those is not yours.

## Order
1. **Re-verify the premise** on the current tree. False load-bearing premise -> return `demoted`, no code.
2. **Write the acceptance cases as tests first** (`tests/golden-path/<name>.probe.spec.ts`, Node lane; Python cards: extend
   `pipeline/vlm-probe` tests or the nearest selftest the card names). Run them and **watch them fail**; record how many were red.
   Cases the card marks `[guard]` may be green-before; say so. Add the critic's extra case(s), including one that proves the WIRING
   (the live surface/hook actually uses the new module — a source check with `stripComments` from `tests/golden-path/_helpers.ts`).
3. **Build** inside the write set (+ its tests + at most the coupled files the card/critic names). Growing past that, past L,
   or failing to turn a gate green in two attempts -> revert YOUR uncommitted work (`git checkout -- <your paths>`, delete your new
   files) and return `demoted` with why.
4. **Gates, each in its own invocation, exit code asserted, never through a pipe:**
   ```
   npx playwright test tests/golden-path/<your specs> --output="$TEMP/pw-<context>-<slot>" > "$TEMP/<ctx>-<slot>-mine.log" 2>&1; echo "MINE=$?"
   npm run typecheck > "$TEMP/<ctx>-<slot>-tc.log" 2>&1; echo "TC=$?"      # red is OK only if every error path is in BASELINE.md
   npm run lint:ratchet > "$TEMP/<ctx>-<slot>-lint.log" 2>&1; echo "LINT=$?"  # same rule
   npx playwright test --output="$TEMP/pw-<context>-<slot>" > "$TEMP/<ctx>-<slot>-all.log" 2>&1; echo "ALL=$?"   # FULL suite before the last commit
   ```
   ALWAYS pass `--output` to a dir in $TEMP — four builders share `test-results/` otherwise and clobber each other.
   For a failing test in the full suite: if it is the kit census, or a file a sibling builder is editing, re-run once after a wait,
   then report it; do not "fix" files outside your write set. Python changes: also run the python test you extended.
5. **Commit a short series**, each commit green on your own tests: `test(<context>): ...` then `feat|refactor|fix(<context>): ...`.
   Use pathspec-only commits: `git add <new files>` then `git commit -m "..." -- <exact paths>`. Never `git add -A/.`/`-u`, never a bare
   `git commit`. Before each commit, `git diff --cached --name-only` must list only your paths. Commit body: lens, card title,
   cases red-before/green-after, gate exits. End every message with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
6. Do NOT edit `app/kit/census.json`, `context-map.json`, `lint-baseline.json`, or any generated file — the coordinator owns them.
   If a ratchet (kit census, lint) needs a regen because of YOUR new files, say so in `notes`.
   Do not point any cache inside the repo. Before returning, `git status --porcelain` must show none of your leftovers.

## Return — write it BEFORE replying
`.claude/scan-sweep/challenge-2026-10-10/results/<context>-<slot>.json`:
`{"card":"<context>/<slot>","status":"landed|demoted|partial","shas":[],"tests_added":n,"cases_red_before":n,"cases_green_after":n,
 "guard_cases":n,"gates":{"mine":exit,"typecheck":exit,"lint":exit,"full_suite":exit},"foreign_red":"<which failures were not yours>",
 "files_changed":n,"lines_changed":n,"deviations_from_card":"...","notes":"..."}`
Reply in under 8 lines.
