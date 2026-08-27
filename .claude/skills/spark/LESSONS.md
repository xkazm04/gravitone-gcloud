# Lessons - spark

Append-only reflection lane. One entry per run that taught something. Format:
`## <version used> - <YYYY-MM-DD> - <project>` followed by `- ` bullets. Merged from every copy of this skill on 2026-08-22 when it moved into the registry lane.

## 1.0 - 2026-08-22 - ascent
- Order metaphor/shape questions before presentation questions; a presentation answer given before the metaphor changed had to be re-asked.
- Brief builders: "new files are committed before guard tests run — never edit a guard test to pass pre-commit." One builder widened a doc-sync guard's file enumeration to untracked files; reverted by the Director.
- A new org-scoped table makes the erase/retention path a mandatory touched context; targeting missed it, a builder's question caught it.
- Parallel static-design + live-prototype experiments (5 metaphors) are a strong input for the visual-metaphor wave; the operator chose from the static canvas, so treat prototypes as comparison, not seed.

## 1.0.0 - 2026-08-23 - ai-registry
- Lane-conformance audit (docs/skills-lane.md "the body is generic"): the 1.0.0 body hardcoded ONE repo's specifics - a literal Obsidian vault path, that repo's gate commands (`npm run check`, `check:i18n:strict`, `cargo clippy`, `npm run test:rust`), `context-map.json` as an unconditional requirement, and three host rituals (an active-runs ledger, a decision-capture command, an i18n translate pipeline) stated as method steps. A second repo could not run the skill without either editing the body or silently failing the steps. 1.1.0 moves all of it behind a `## Project overlay` (repo `.claude/spark/config.md` -> vault `config.md` -> defaults) and turns the host rituals into overlay-declared `## Rituals` hooks the loop runs only when declared. Method, roles, waves, liveness rules, worktree/commit doctrine and the retro are unchanged.

## 1.1.0 - 2026-08-24 - personas
- Translator fan-out prompts that say "keep brand/technical terms" cause agents to keep product METAPHOR names (UI variant labels) untranslated, tripping raw-English-value gates. Briefs should enumerate the actual brand list and say metaphor/feature labels are translatable.

## 1.1.0 - 2026-08-25 - personas
- When the base branch moves mid-spark (parallel sessions), merge it into the spark branch BEFORE the final ratchet-gate pass; attribute gate drift per-rule against `git diff base...HEAD -U0` added-line ranges — against stale baselines the drift is unattributable and reads as someone else's.
- A ratchet tool's bulk "update baselines" command updates EVERY drifted rule, including rises your own cleanup just introduced — review its diff before committing it.
- Builder briefs should end with "run the repo's formatter before handback"; two commits bounced on a format-staged hook.
- One conformance builder fed the full list of gate rises (with the per-rule attribution method) closed 13/15 for real — cheaper and better than the Director hand-fixing or blanket-ratcheting.

## 1.1.0 - 2026-08-24 - kp
- Two parallel builders in ONE worktree: one ran `git add` mid-flight and the Director's pathspec commit swept the sibling's half-done files (recovered via soft-reset + restage). Builder briefs must say NEVER stage; only the Director touches the index.
- Long-running dev servers bit twice in one spark: a cached ensureDb missed new DDL and a cached i18n catalog rendered raw key paths - both misread as code defects. When a round changes schema or catalogs, a dev-server restart is part of verification, not optional.
- Wave 1 framed identity as import-vs-fresh; the fork that actually mattered (live shared state vs copy) only surfaced in wave 2 and the operator overrode toward it. Put the sharpest architecture fork in wave 1 even when it seems premature.
