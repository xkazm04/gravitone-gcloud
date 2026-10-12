# Challenge run 2026-10-10 — scout brief (READ-ONLY except your cards file)

Repo: C:/Users/mkdol/dolla/gravitone-gcloud (Next.js app; read AGENTS.md - this Next.js has breaking changes).
Base sha: b08bc7e. Run dir: .claude/scan-sweep/challenge-2026-10-10/

You are the SCOUT for exactly one context. You change NO code. The only file you write is
`.claude/scan-sweep/challenge-2026-10-10/cards/<context>.json` - write it BEFORE you reply.

## Read, in this order
1. `.claude/skills/scan-sweep/references/challenge.md` §1, §3, §4 (floors, slots, card shape).
2. Your context's `file_paths` in `context-map.json` (entry with your `name`). Read them all, in full
   for anything under ~600 lines. Use bash with a leading `cd /c/Users/mkdol/dolla/gravitone-gcloud &&`.
3. The registry subjects that govern it: `.ai/registry-map.json` row for your context -> subject `file`
   (resolve under `../ai-registry`). Read the golden path and the techniques relevant to your two ideas.
4. NEVER-RE-PROPOSE sources - a card restating any of these is void:
   - `docs/concepts/moonshots-2026-10-05/*.md` (72 prior challenge cards, all contexts; many BUILT)
   - `git log --oneline --since=2026-10-03 -- <your paths>` (what already landed, incl. a prior challenge run's 12 cards on 2026-10-05)
   - `.claude/scan-history/lanes.jsonl` and `.claude/scan-history/open-backlogs.jsonl` (open Lane B/C)
   You MAY adopt an open, unbuilt high-effort item (cite it) - that is a good card.
5. CLAUDE.md's law "The app does not explain itself" binds every UI card: no explanatory prose
   slots, use `components/ui/signal/` vocabulary, both themes (obsidian/almanac worlds).

## Return exactly two cards
- Slot A `architecture-challenger`: the ONE structural move that stops this context being the reason
  something else is hard (rule implemented twice -> one module; boolean cluster -> state machine;
  hand-list -> derived; sync path -> job). Counted cost, file:line.
- Slot B `ux-elevation`: the experience LEAP (five steps -> one; a blind decision the app has data for;
  a status you should be able to act on; a missing compare/bulk/undo/preview/resume mode). If the context
  has no user surface, a second architecture card on a DIFFERENT seam, slot "B-architecture (no UI surface)".

Floors (all): size M or L; effort >= 5; impact >= 7; risk 4-8; write_set <= ~15 files and <= ~800
changed lines; 3-8 `acceptance` cases, each `input -> expected`, writable as FAILING tests in the Node
probe lane (`tests/golden-path/*.probe.spec.ts`, Playwright runner, no DOM) BEFORE the build. UX cards:
cases are on the logic module under the surface (pure state/derivation), not on pixels. Mark any case that
is green-before by design as `[guard]`.
Gate field: never `irreversible` or `policy-loosen` (those are never built here) - if your best idea
needs one, pick another. No cross-repo contracts.

A builder will run in a SHARED checkout with up to 3 siblings; keep the write set inside your context's
paths plus new files beside them, its tests, and at most one coupled file outside (name it).
For every file in `write_set`, say in `file_classes` whether it is hand-edited, generated-by-X, or a
release artefact.

## Card JSON (the file is a JSON array of two)
{"context","slot","lens","title"(<=80),"size","effort","impact","risk",
 "write_set":[...],"new_files":[...],"shared_surfaces":[...],"file_classes":{"path":"hand|generated-by-X"},
 "acceptance":[...],"premise":["path:line - fact", ...],"rollback":"...","gate":"none|contract|policy-tighten|architecture|direction",
 "runner_up":"one line","registry":"<subject slug(s) + technique slug(s) applied>",
 "body":"## Summary\n...\n\n## Description\n...\n\n## Flow\n- ...\n\n## Expected impact\n...\n\n## Evaluation\nClaim: ...\nBefore: 0 of N acceptance cases pass\nAfter: N of N\nMethod: gate - ...\nResult: better\nGate: ...",
 "evidence":"<proof block: exact lines / grep output / counts>"}

Every `file:line` is repo-relative as `git ls-files` prints it, and must be true on b08bc7e.
Ambition matters: a critic grades whether this is the move a principal engineer/designer would make
here, or a big-sounding tidy-up. Grounding and falsifiability are graded too.

Reply (short): the two titles, sizes, and the runner-ups. Nothing else - the file is the deliverable.
