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
