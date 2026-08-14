# UAT · rebalance-a-script · 2026-08-12

**Characters:** Nadia (essayist) · Tomás (producer) · Priya (standards editor) ·
Ben (evaluating owner)
**Levels:** L1 theoretical over the code, then L2 in a real browser (chromium,
fresh context per scenario, `seed-why-bitcoin`).
**Scope honesty:** every render here is a mocked fixture and the recalibration is
a deterministic transform. This run judged the **interface and the contract** —
what is shown, refused, labelled and gated. It did not judge output quality;
nothing generates.

## Verdict

`L2-conditional → fixed → L2-pass.` The journey completed structurally at L1, but
**four of the five guards a rebalance needs did not exist**, and L2 confirmed all
four live. All four are now implemented in `script/recalibrate.ts` and reported
in the pad. 10/10 expectations hold; the six existing drive suites still pass
(150/150).

## Confirmed findings (all fixed)

| # | Severity | Dimension | Finding | Evidence |
|---|---|---|---|---|
| F1 | **blocker** | trust | A note could descope the steel-man — material Step 1's own control **refuses** to descope and states why. The rebalance walked around the scope layer. | L2 `s4-steelman.png`; `recalibrate.ts` GUARD 1 |
| F2 | **blocker** | trust | A note could give screen time to a card the creator had already taken **out of scope**. Two systems, opposite answers, no complaint. | L2 `sc-scope-conflict.png`; GUARD 2 |
| F3 | major | clarity | Two contradicting notes on one track resolved silently; the creator was never told which one lost. | L2 `s2-conflict.png`; GUARD 3 |
| F4 | major | senior-quality | Cutting every fact a turn argues from left the turn in the script at full weight. The scope layer already models this (`woundsOf`); the rebalance was not asking. | L2 `s5-wound.png`; GUARD 4 |
| F5 | major | trust | After **accepting** a rebalance, the weights were the new version's but every check beside them — craft checks, constraint ledger, gate — was computed against the original script and displayed with no attribution. | `_parts/BaselineOnlyNote.tsx` |

## What passed before any fix

- One recalibration per project; notes locked while it runs.
- A candidate is staged, never auto-accepted; discarding keeps the notes.
- Runtime is fixed, and an over-committed plan reports an **overrun** rather than
  silently rescaling (Tomás's hardest constraint — held).
- Free-text notes are kept, sent, and marked as moving nothing.
- Deltas, the baseline ghost bar, and sort-by-what-moved answer "what changed"
  without diffing by eye (Nadia's #1 — held).

## Character voices

**Priya (standards editor)** — *"F5 is the one that would have got me. A tick
computed against a previous draft, sitting next to the current one, is worse than
no tick: it manufactures confidence I did not earn. The new line saying the
checks are the original's and have not been re-verified is the minimum, and I
would not sign off without it. I still want the checks actually re-run — the note
tells me they weren't, which is honest, but honest-and-unverified is where I have
to stop."*

**Nadia (essayist)** — *"F1 is the one that scared me. I would have written three
notes, hit recalibrate, and shipped a script with no counter-case — and the
surface that is supposed to tell me the counter-case is mandatory would have kept
saying so while it was gone. The refusal line fixes it. I would still like the
conflict warning before I run, not after, but I can live with after."*

**Tomás (producer)** — *"Overrun was right the first time and that is the thing I
came for. I do not read the argument; I need to know it fits. 'over budget —
Reversal Chain +47s' is exactly the sentence I forward to the client."*

**Ben (evaluating owner)** — *"Every refusal is explained instead of just
disabled, and the pad still says `simulated`. That is the label that made me
stay. The moment it comes off, I want to know a real model produced that and it
was checked the same way the first draft was."*

## Panel verdict

The loop is trustworthy **because it refuses**. Before this run the rebalance was
the one surface in the app that could quietly undo decisions every other surface
protects; it is now the surface that states, in the creator's own terms, what it
would not do. The remaining honesty debt is F5's tail: the checks are *labelled*
stale rather than *re-computed*, and that is the first thing the real function
has to close.

## Ready for a real model — the contract

1. Re-weighting without new beats leaves Candidates lying. A real recalibration
   must return beats, or Candidates must refuse to render.
2. New beats must be re-run through `script/gate.ts` and the constraint ledger
   before the candidate can be accepted.
3. Guards 1–4 apply to a model's output exactly as they apply to the mock. A
   returned plan that descopes required material, or funds an out-of-scope card,
   is refused — not accepted-and-flagged.
4. The `simulated · re-weights only` label comes off when 1–3 hold, and not
   before.
