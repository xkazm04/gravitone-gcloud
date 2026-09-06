# recertify · 2026-09-05-compose · B-001 + B-004

**Commits under test:** the B-001/B-004 build on top of `2ad36a7`. **Environment:** the same
persistent profile (`uat/.profile`), dev server restarted after the build (fresh compile), port 3183.
**Targets:** Priyanka's rerun project `p-mtokidjw-ri3i7v` (has `f-ath` cut past the checkpoint) and
Lena's `p-mtokgh1c-owug0u` (40 s short-form clip). Journal: `l2/journals/recertify-b001-b004.log`,
11/11 checks, exit 0.

| id | before | now | evidence | ceiling |
|---|---|---|---|---|
| PR-L1-2 | cut card spoken 12 s, no marker | **resolved-verified** | row chip `cut · still spoken 12s by Reversal Chain, 13s by Adjudication`; cell `data-conflict=true`; footnote `1 card out of scope is still spoken by a render (f-ath) …` | reports, does not re-attribute; the gate still ignores exclusions (C-003) |
| DA-L1-12 | consequence only as tint | **resolved-verified** | same | signal lives on Coverage, not the duel front |
| HA-L1-5 | pip said "Out of scope" for both | **resolved-verified** | pip `Not taken — a conclusion is out of scope by default. Click to take it.` vs `Descoped — you cut this.`; `row data-scope=not-taken` untinted | footnote's umbrella word stays "out of scope" |
| LE-L1-3 | words-vs-budget only; caveat expert-only | **resolved-verified** | `+5 s over your 40 s at 150 wpm — about 13 words to cut`; `declared deviation — Word budget assumes image-led production at 150 wpm…` on the guided depth; long render `+260 s over your 40 s at 190 wpm` | the render's wpm, not a narration-led one (C-002) |
| LE-L1-2 | guided card never says "derived from" | still open | not in B-004's scope | — |

**Metric deltas.** script-candidates grounding stays 3/4 (the clock is now *computed against*, still
not *read into* the renders). Lena's estimated time-saved moves from ~20 min to ~30 of her 50 min
per short: the subtraction was the stopwatch she was paying to skip; the derived-from lineage is
still one face away.

## New findings for the next drain
- **R-1 (minor, confusion):** on the Coverage footnote the umbrella word for `not taken` + `descoped`
  is still "out of scope" while the row and pip now keep them apart — one word for two things on the
  same tab. Evidence: `matrix-scope-conflicts` text.
- **R-2 (polish, harness):** Priyanka's first L2 drive threw before the cut, so her *rerun* project is
  the only one with a cut past the checkpoint; `created.json` lists both under her name. A recertify
  must pick the project by state, not by Character — the driver could record which scenario steps a
  project completed.
