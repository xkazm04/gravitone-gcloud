# Accepted gaps

Known and accepted; do not re-surface as findings.

- **No backend, no model.** Research runs, follow-ups and recalibration are
  mocked fixtures. Accepted for the prototype, on the condition that every
  surface says so.
- **One notebook for every project.** Any project that reads as researched shows
  the Bitcoin notebook. Accepted; the fixture seam is `_shared/notebook/`.
- **Frames / Score / Cut are static mocks.** Out of scope for every
  journey until they are built. (Motion was retired as a step on 2026-08-14 —
  Frames now owns the still and the clip made from it.)

## Added 2026-08-12 (rebalance run)

- **A recalibration does not rewrite beat text — ON THE FALLBACK PATH ONLY.**
  Superseded 2026-08-12 for the model path: an edit plan now returns new beats and
  the matrix is recomputed from them (`script/editPlan.ts`). The text below still
  describes the simulated transform, which runs whenever no model can be reached. The mocked transform re-weights
  research only, so after accepting a rebalance the Candidates beat chain still
  speaks material the new weights cut. Accepted for the prototype **on the
  condition** that the tab states its verification is the original script's
  (`_parts/BaselineOnlyNote.tsx` → `stale-verification`).
  **This is the contract the real function must satisfy:** a model that returns
  new weights without new beats leaves Candidates lying, and a model that returns
  new beats must be re-run through `script/gate.ts` + the constraint ledger
  before it can be accepted. Do NOT remove the `simulated · re-weights only`
  label until both hold.

  **Narrowed 2026-08-14 — what of that contract now holds.** Both halves that
  could be satisfied by code are:
  - *Candidates draws the version, not the fixture.* `Version.beats` was written
    by the model path and read by no component; `ScriptStep.tsx` now draws the
    chain of the version it is showing, marked beat-by-beat against the chain it
    replaced (`_parts/BeatList.tsx` → `against`). Word counts are recounted from
    the chain on screen.
  - *The gate is re-run before the accept decision.* `runGate` takes a
    `GateSubject` (`{ id, beats }`) rather than a fixture render, `gateChains()`
    rolls it up over a version's three chains, and the verdict renders on the
    Candidates tab — where the sticky pad's `accept as baseline` button now also
    lives — plus per render in `_parts/GatePanel.tsx`, which states which chain
    it read.

  **What still does not hold, and will not by code alone:**
  - *The constraint ledger cannot be re-run.* `CONSTRAINT_LEDGER` is hand-typed
    prose about specific renders ("the 93% / 7.6x vendor figures were cut
    entirely"). There is no probe to execute against a rewritten chain — which is
    the exact defect `gate.ts` exists to answer. The ledger now reports **not
    re-scored** on a rewritten chain instead of "clean", and the craft-check block
    beside it says the same. Re-earning those ticks means writing probes, not
    wiring a call.
  - *The gate does not BLOCK acceptance.* It reports; `accept as baseline` stays
    enabled through a blocking verdict. Whether a failing candidate should be
    refused outright is a product call, raised rather than taken.
  - *The simulated fallback still re-weights without rewriting.* Its versions
    carry no `beats`, so Candidates falls back to the fixture chain and the full
    `stale-verification` disclosure — unchanged — applies to it.

  `data-testid="stale-verification"` is unchanged and still present on both
  branches; only its wording narrows, and it keeps the phrase "computed against
  the original" that `uat/driver/drive.mjs:206` matches on.
- **A version's account of itself may live in `summary`, not `refusals[]`.**
  The engine explains structural refusals in prose ("both beats are structurally
  required, so both were rewritten rather than cut") and returns an empty
  `refusals[]`. Accepted: the UI treats `summary` and the itemised lists as one
  record and shows whichever exists. Do NOT key any "did it refuse?" logic on
  `refusals.length` alone.
- **Conflicts are reported on the result, not at note time.** Deliberate: the
  guards run inside the transform, which is where a real model's output must
  also be checked. Flagging at note time would duplicate the rule in two places.
