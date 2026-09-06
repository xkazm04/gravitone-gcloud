# Concept · scope ↔ script reconciliation

**From:** uat drain 2026-09-05-compose (C-003; HA-L1-2, PR-L1-2, DA-L1-12). **Status:** open.

## The gap
The scope is the creator's decision about the notebook; the script is what a render said. Today
they meet in one place — Coverage — and disagree silently: a descoped fact still shows the seconds a
render spends on it (verified live: `usage=spoken text=12s` on a row pipped `—`), and a not-taken
conclusion that a render *did* speak would show as ordinary seconds. `gateChains` reads every
conclusion, never the scope. On the fixture the null case holds only because no render speaks a
conclusion (HA-L1-2, uncertain for that reason).

Hana's bar: "the script must honour that exclusion visibly." Priyanka's: "a scope and a script
that disagree without a warning is the one workflow I said I would refuse."

## What B-001 does now
Marks the disagreement on the Coverage row and counts it. That is disclosure. This concept is about
enforcement.

## Decision to make
1. **Report only** (B-001): the row says "cut · still spoken"; the gate adds a `scope` rule that
   emits a violation per spoken-but-excluded card; accepting stays possible (the gate never blocks —
   `RecalibrateControl`'s override receipt already handles a blocking verdict).
2. **Refuse adoption** of a candidate that speaks an excluded card until a recalibration
   re-attributes it — stricter than the existing gate doctrine ("it reports; the click is
   deliberate"), and would strand the fixture renders on every project with a cut.
3. **Re-attribute on accept**: a recalibration that returns new beats is already re-gated; extend
   `gateChains` with the scope so the *candidate* is judged against exclusions before the accept
   button — the only path where enforcement has something to act on.

## Recommendation
1 now (with B-001), 3 as the rule for the model path. 2 is declined: it makes running the gate the
expensive choice, which the gate's own header argues against.

## Guardrails
- `not taken` stays a default, not a decision; a not-taken conclusion that is spoken is a *render*
  defect, and the row should say which render.
- The constraint ledger's "not re-scored" honesty stays; a scope rule must be a probe, not prose.
