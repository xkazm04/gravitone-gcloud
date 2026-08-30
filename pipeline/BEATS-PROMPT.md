# The beats prompt — logline → beat slots

The instruction set for a beat-variant run: the promotional disciplines' answer to
`RESEARCH-PROMPT.md`. Where that prompt turns a topic into a notebook of facts, this one turns a
logline into **candidate beats per part of the spine**, for a creator to pick one of each. Read
`knowledge/templates/trailer/TEMPLATE.md` and `knowledge/templates/trailer/steps/01-script/PATTERNS.md`
before running it.

**Not read by code yet.** The Research step's beat board (`app/_phases/research/beats/`) draws a
hand-written fixture in exactly this output shape (`app/_studio/trailerFixtures.ts`, n=0). This file
is the contract that fixture was written against, so that a model's output can replace it without the
board changing.

---

## The brief

> You are proposing beats for a *promotional cut* — a trailer — not writing one. Your deliverable is a
> JSON array of `BeatSlot` (shape below), one slot per part of the spine, two or three candidate beats
> per slot.
>
> **You are not choosing.** A creator picks one beat per slot and composes the spine from the picks.
> Every combination of your candidates must be a well-formed chain; the choice between them must be a
> craft choice, never a choice between a defect and a non-defect.
>
> The failure you exist to prevent: a model handed a logline lists the work's best moments in order of
> size, biggest last — a ramp. The form is organised against the ramp (PATTERNS.md § 2: "open strong
> to arrest attention, then *fall back* to a quiet setup, and build from there to a peak").

## Inputs

| Input | Meaning |
|---|---|
| `logline` | One sentence about the work. Everything you propose is anchored to it. |
| `template` | `trailer` / `teaser` / `cinematic` — three contracts, not three lengths (TEMPLATE.md § Three contracts). This prompt covers `trailer`, the rung the others are derived from (PATTERNS.md § 7). |
| `targetS` | Runtime target. `at` timecodes must be plausible for it; nothing else about duration is yours to state. |

## Phase 0 — Write the withholding budget first

Before a single beat: name the work's five assets — turn, reveal, resolution, best moment, novum — and
assign each `spend` / `imply` / `hold`, with a one-sentence `trade` on every `spend` (PATTERNS.md § 9.5;
withholding-budget.md). The default for this rung is hold the turn, hold the resolution, imply the
reveal, spend the best moment only against a decision (TEMPLATE.md § The format). A beat that puts an
asset on screen names it in `spends`. **Never spend a held asset; never show an implied one.**

## Phase 1 — Lay the cue down

Emit a `Cue` with sections in `CueSectionKind` order — mood-open, exposition, response, build, peak,
tail — and mark `isBoundary` honestly: a boundary is where the music breathes, not where you would
like it to (PATTERNS.md § 6, "the cue is the parent"). There must be a boundary before the peak, or the
reset has nowhere to land and the cut has no climax.

## Phase 2 — Name the parts

One `Movement` per slot, in spine order (`SPINE_ORDER`: cold-open → introduction → escalation →
climax → tail), each with a `cueSection`. The reset is a part, not a gap (PATTERNS.md § 9.1): give it
its own slot whose movement carries the `escalation` role, ordered after the last rung and before the
climax, on the cue's build boundary. `MovementRole` has no reset — position is what the checker reads
(structure.ts `checkReset`: immediately before the peak, on a boundary).

Slots for a 120s trailer: cold-open · introduction · escalation ×3 · reset · climax · tail.

## Phase 3 — Propose variants

For every slot, two or three `BeatVariant`s that **differ by strategy**:

- **Cold open** — a moment that needs no context and looks like it resolves soon. Vary what buys the
  attention: an image, a spend of the best moment, the line.
- **Introduction** — the least information that makes the stakes legible (PATTERNS.md § 2). Name at
  least one person, or nothing later can personalise the cost.
- **Rungs** — each raises **exactly one** variable from the closed set (scale · threat · speed ·
  intimacy · cost) in `raises`, and no two consecutive rungs raise the same one. Make the variables
  disjoint BY SLOT so any composition holds. Use the four moves in cost order — widen scope, shorten
  clock, personalise cost, invert frame (PATTERNS.md § 3) — and record the move in `move`. A rung
  closes: "you can say what the viewer knows after it that they did not know before".
- **Reset** — one `reset` beat per variant, `resetHolds` naming **one** thing (line / image /
  nothing), `cueMark` on a boundary (PATTERNS.md § 4). Vary what the silence holds.
- **Climax** — a `peak`, "emphatically not required to be the work's own climax". Vary whether it
  spends the best moment or builds from scale.
- **Tail** — a `title` beat; a button, if any, is described inside it and must be smaller than the
  climax (PATTERNS.md § 2, the one hard constraint).

Every beat's `connector` is `BUT` or `THEREFORE` (`null` only on the cut's first beat). **AND THEN is
a defect** (PATTERNS.md § 1, § 9.3) and must not appear in any variant.

## Phase 4 — Say the risk

Every variant carries a `rationale` (what this beat does for the cut) and, where you can name one, a
`risk` — the honest downside: a spend that repeats an image, a cost personalised to nobody, a reset
one word from the held turn. The board draws `risk` in amber. Absence means you named none, not that
none exists.

## Phase 5 — Audit as a stranger, then stop

Read your own candidates once from ignorance of the work (PATTERNS.md § 5) and write down what a
first-time viewer would now believe. Any belief that names the turn or the resolution is a breach of
the budget — repair the beat, not the wording. Then stop. **Do not compose the spine**; that is the
creator's act.

## The output shape

```ts
BeatSlot[]  // app/_phases/research/beats/beats.ts
  { id, movement: Movement, variants: BeatVariant[] }
BeatVariant
  { id, beat: TrailerBeat, rationale, risk? }
TrailerBeat // app/_phases/script/trailer/types.ts
  { id, movement, at, kind, connector, label, text, raises?, move?, spends?, resetHolds?, cueMark? }
```

Alongside: one `Cue` and one `WithholdingBudget` (same types file). The regression control for what
the composed cut must satisfy is `pipeline/trailer-structure-regression.mts`; the checker is
`app/_phases/script/trailer/structure.ts`, and it is a diagnostic, never a gate (PATTERNS.md § 8).
