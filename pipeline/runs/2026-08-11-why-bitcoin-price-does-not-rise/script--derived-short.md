---
render_of: notebook.json
derived_from: script--reversal-chain.md
engine: paradox-teaser
template: short-form-clip
target_duration_s: 45
visual_mode: image-led
rate_wpm: 150
word_budget: 112
actual_words: 108
generated: 2026-08-11
---

# "They never sell" — *derived short*

A clip scoped from the mid-length script, following the derived-short contract in
`short-form-clip/steps/01-script/PATTERNS.md` §4.

**Parent beat used:** Movement 2, turn 2 (the treasury flywheel reversing).
**Why this beat:** it is the only beat in the parent that contains a complete, self-contained
surprise — a company with a public "never sell" identity selling. It needs no setup from the rest of
the script.

---

### The clip · 0:00–0:45

> **[0:00]** ⟨contradiction hook — 6 words⟩
> This company said it would never sell Bitcoin.
>
> **[0:04]**
> It bought billions of dollars of it. It borrowed money to buy more. It made "we never sell" the
> entire brand.
>
> **[0:12]** ⟨the mechanism, compressed to one sentence⟩
> The trick was that its stock traded higher than the Bitcoin it owned — so it could keep issuing
> shares, buying more coins, and making every shareholder richer in Bitcoin terms.
>
> **[0:24]** ⟨the reversal⟩
> Then the stock fell below the value of its own Bitcoin. And the machine only runs one way.
>
> **[0:31]** ⟨the payoff — complete on its own⟩
> In June, Strategy sold thirty two Bitcoin. About two million dollars, from a company holding
> billions. Financially, nothing. As a sentence, everything.
>
> **[0:40]** ⟨the withheld loop — a DIFFERENT question⟩
> Which raises a much bigger one: Bitcoin got every single thing it asked for this year, and it's
> still down fifty percent. Full video explains why.

---

## Derived-short contract check

| Rule | Result |
|---|---|
| **Complete on its own** | ✅ Asks *did the never-sellers sell?* and answers it fully. A viewer who never clicks has a whole story. |
| **The withheld thing is a DIFFERENT question** | ✅ The clip closes "why did the flywheel break"; it opens "why is the whole asset down despite winning" — a new loop, not the missing half of the one just closed. |
| **Pointer explicit and last** | ✅ A named thing (down 50% despite everything), then the pointer. No "watch to find out". |
| **No dependence on the parent's setup** | ✅ Nothing assumes the ETF section, the macro section, or that a longer video exists. |

## Other checks

- **Hook shape:** contradiction (per `params.json § hook.shapes`). Not "did you know".
- **One idea:** yes — a mechanism that only runs in one direction.
- **Visual mode:** image-led → 150 wpm, at the low end of the 110–235 word budget. If produced
  narration-led, the script needs ~60 more words.
- **Close:** the pointer replaces the joke. Neither this subject nor this notebook has a joke in it,
  which is a real limitation — see NOTES.md.

## Unused derived-short candidates

Recorded so the next run does not re-derive them:

1. **"The ETF was an exit"** — 3.67m BTC sold into the ETF bid. Strong, but the mechanism (AP
   create-and-short) needs ~20s to explain and would not fit under 45s.
2. **"The reserve that was never built"** — 16 months on, agencies can't agree how much BTC the US
   owns. Punchy and self-contained, but political rather than mechanical, and the payoff is an absence
   rather than an event.
3. **"Bitcoin is a tech stock now"** — 0.70–0.80 Nasdaq correlation. This is the *thesis*, so using it
   in the clip would spend the parent's ending.
