# scan-sweep — project overlay (gravitone-gcloud)

No key overrides. The skill's defaults are correct for this repo: the context map is
`context-map.json`, the outbox is `.personas/memory-outbox.jsonl`, the digest is
`.personas/backlog-digest.json`, and the gates come from `.ai/manifest.yaml`'s
`capabilities` block.

## Gates, in the order that actually holds

Run each in its OWN invocation, `&&`-chained, with the commit as the last link — and
never through a pipe. `npm run typecheck | tail -3 && git commit` takes `tail`'s status
and commits over a red gate.

```
npm run typecheck && npm run lint:ratchet && npm test && git commit …
```

`npm test` is the Node probe lane (`tests/golden-path/`, ~350 cases, ~7s) and is the right
rung for anything phrasable as a claim about a module. `npm run test:live` drives the
assembled app in Chromium and its own header REFUSES claims a probe could witness — do not
put module-level assertions there. A React external store read through
`useSyncExternalStore` is witnessable by neither: the probe lane has no DOM and the live
lane will not take it. For those, the established local idiom is a SOURCE ratchet
(`tests/golden-path/object-url-ownership.probe.spec.ts` is the model) — comments stripped
before matching, the population walked off the filesystem rather than listed, and a
"the walk read nothing" guard so a silent miss cannot read as success.

## Skill improvement log

- **2026-08-29 — the memory outbox is at its finding cap and nothing in this repo drains
  it.** `.personas/memory-outbox.jsonl` stood at 188 lines / 28 findings when this round
  started and 196 / 30 when it ended: the cap is 200 lines and **30 finding lines**, so the
  next round can record ZERO findings until the Personas app ingests the file (ingest
  deletes it; there is no `/dev-tools/*` route that does — probed four candidates, all 404,
  so it is a UI action). The four rounds before this one each reported "outbox near cap" or
  "at cap" and each silently dropped findings while the ledger recorded the context as
  swept. **Check `wc -l` and the finding count as part of §2, before reading any code**, and
  if the finding headroom is under ~4, say so to the operator up front rather than
  discovering it at emit time with the analysis already paid for.
- **2026-08-29 — three files have been DRIFT since before the map ledger began, and a
  delta scan has already failed to pick them up.** `app/_phases/_shared/useLoadFor.ts`,
  `lib/devAuth.ts` and `lib/usePolling.ts` are unmapped under directories the map covers
  comprehensively (app 99.4%, lib 96.9%). The one ledger line
  (`.claude/scan-history/context-map.jsonl`, 2026-08-29T10:03, delta) post-dates all three
  and did not map them. Per CLAUDE.md that is "a finding, not a verdict to accept" —
  so do NOT spend another delta scan on them reflexively; report them and let the operator
  decide. New files landing under `tests/` are SELECTIVE (43.5% mapped) and are not drift.
- **2026-08-29 — `.ai/registry-map.json`'s deviation verdicts go stale, and six
  skills read them as truth.** Of five conform deviations checked across this
  loop, TWO had already been fixed and the map still called them deviations:
  `evidence-bound-visuals` said sceneSpec.ts "never reads the fact's grade" (the
  grade cap is implemented, wired at useFrames.ts:591 and probed by
  scene-grade-cap), and `review-iteration-loops` said no connector is re-checked
  at an edit's seams (applyEdits returns chainBreaks, probed in five cases).
  Read a deviation as a HYPOTHESIS to re-verify against current code, never as a
  finding to act on — and re-run `/conform` for a context before trusting its
  verdicts. The map also caps `paths` at 12 per context, so 13 of 18 contexts
  were evaluated against at most half their files.
- **2026-08-29 — 12 of 18 contexts still carry a NULL group**, including `research-step`.
  These are rows written before the 2026-08-29 ingest fix and they stay NULL until a scan
  re-emits the context, which never happens for a context that has not changed. Assigning
  them is a Dev Tools → Context Ledger action, not something a scan will fix.
- **2026-09-05 - the `| tail && git commit` trap bit this round even with the clause freshly read**: 67a9c73 landed over a red suite. The shape that held for the next nine commits: `npm test > "$TEMP/npmtest.log" 2>&1; S=$?; grep summary; test $S -eq 0 && git add <paths> && git commit`. Also: `fake-indexeddb/auto` makes the IDB half of `evictIdentity` probe-able in the Node lane (tests/golden-path/identity-eviction-idb.probe.spec.ts). And the map gate found 3 NEW lib/ drift files (foundry/training/{store,types}.ts, imaging/providers/ollama.ts) beside the 2 standing ones; a long bash heredoc carrying JSON with apostrophes failed to parse under Git Bash - write ledger scripts to a file and run them.
- **2026-09-05 — this repo is polyglot and the outbox finding-count grep is whitespace-sensitive.**
  Two things for the next round. (1) `pipeline/` holds ~965 lines of Python in
  `foundry/` alone and more in `vlm-probe/`, and NOTHING in the repo executes any of
  it: CI installs Node only, both test lanes are Playwright/TypeScript. So §7's "run
  the repo's own gates" is satisfied by `npm run typecheck && npm run lint:ratchet &&
  npm test` and those say NOTHING about a Python change — they cannot go red for it.
  `pipeline/foundry/selftest.py` now exists as that lane's instrument (5 cases,
  stdlib-only on purpose, sub-second, no GPU); run it after any edit under
  `pipeline/foundry/`, and prefer extending it over writing a throwaway probe. It
  found 3 of this round's 5 defects on its first run. (2) The §2 outbox check needs
  `grep -cE '"type":\s*"finding"'` — the file is written with a space after the colon,
  so the space-less pattern reported 0 findings against an actual 5.
- **2026-09-05 — a Python probe against these modules is cheap and the GPU is not needed.**
  `forge.py` imports cleanly on a box with no card: `guard`, `consistency`, `probe`,
  `replicate` and `style` have no module-level third-party imports, and Pillow/numpy are
  imported INSIDE `crop_letterbox` and `publish`. So `stage_generate` and `stage_grade`
  can be driven end to end by faking three seams — `F.guard.require_model`,
  `F.run_ollama`, `F.grade.run_style_readback`. That is how the two most severe defects
  of this round were both found and measured. Do not assume this directory needs the rig.
- **2026-09-05 — the source-ratchet comment stripper in this repo was unsound, and a probe
  written against it passed vacuously.** Nine probes each carried a private
  `.replace(block-comments).replace(line-comments)` pair. Stripping BLOCK comments first
  means a block-open sequence sitting inside a LINE comment really opens a block — and this
  repo's prose is full of route globs (`/api/imaging/` + star). The phantom block runs to the
  next real terminator: measured, 14 of 268 files under `app/` and `lib/` lose a contiguous
  region, up to 80% of `lib/imaging/api.ts`. **Use `stripComments` from
  `tests/golden-path/_helpers.ts`** (added 442e51f), never a local pair. Seven older probes
  still carry the old one — adopting it there is a backlog card, because it may legitimately
  turn one red by letting it see code it had been missing. And: a JSDoc that QUOTES the bad
  pair terminates itself, so write that explanation as `//` lines.
- **2026-09-05 — seeding the defect is what caught it, not reading the probe.** Both new
  probes this round looked correct and one was vacuous. The step that found it was
  §7.6's: restore the pre-fix source, run the probe, and require it to go RED — and for a
  probe covering N surfaces, seed each surface INDEPENDENTLY. The upgraded
  `cull-keys.probe.spec.ts` was only trustworthy once CullGrid alone and ExtractBoard alone
  had each been made to fail. Budget a couple of minutes per probe for this; it is the
  cheapest assertion in the round and it caught two real problems here.
- **2026-09-05 — long bash heredocs carrying Python that carries JS/TS regexes mangle
  backslashes twice.** `\n` inside a `python - <<'PY'` block became a literal newline in a
  written regex and produced a syntactically broken test file. Use the Edit/Write tools for
  any content containing backslashes — the same rule §7.6 already states for pattern
  authoring — and reserve heredoc Python for pure data moves.
- **2026-09-06 — the outbox is at 191/200 lines and the NEXT round cannot record itself.**
  Three rounds this session took it 82 → 120 → 156 → 191, ~36 lines each, almost all of them
  per-lens coverage nodes. Findings are fine (12 of 30); the LINE budget binds first, and the
  overlay's 2026-08-29 entry records five earlier rounds silently dropping output while the
  ledger recorded the context as swept. **Ingest the file in the Personas app before the next
  round** — it deletes it, and nothing in this repo can. If it is still full, emit the findings
  and the round node only, skip the per-lens coverage nodes, and mark the snapshot degraded.
- **2026-09-06 — the strongest parity leads in this repo now fail, and that is the result.**
  Round 3 hunted the §4.6 pair shape hard and the best candidate — a second run clock in the
  newer `guided/` face — turned out to be a file that explicitly refuses to fork it and cites
  the bug. What DID yield, four times out of four, was a different tell: **a docstring making a
  promise the code does not keep.** `woundsOf` says "three beats away" and walks one hop;
  the notice said "out of scope" and counted cuts; `standingOf` says a dangling id is REPORTED
  and one branch did not; `revisionsOf` states a limit nobody had pinned. On a codebase whose
  comments are this good, read the prose as a SPEC and diff it against the code — it is the
  highest-yield instrument here, and it is what §4.6's grep battery misses.
- **2026-09-06 — `cd` inside a Bash call persists and silently breaks later tool calls.**
  A `cd app/_phases/research` early in the round made a later `npx playwright test tests/...`
  report "No tests found" — which reads exactly like a broken spec file, not a wrong cwd. Use
  absolute paths or a leading `cd /c/Users/mkdol/dolla/gravitone-gcloud &&` in every call that
  runs a repo-root command.
- **2026-09-06 — scan-sweep v4.0.0 (three lanes) applied to this repo's backlog.** The split
  is in `.claude/scan-history/lanes.jsonl`: A:0 / B:8 across 6 write-set groups / C:4. Zero
  Lane A is the expected result — v3.0 already built everything a probe had measured, and
  every S card left was `Method: simulation` with its instrument named. Lane B is dispatched
  with `/scan-sweep --ab-only --workers 6`; the director merges into main and never pushes.
  The wave's ledger will be `.claude/scan-history/ab.jsonl`. Worktrees go under `C:/t/`.
