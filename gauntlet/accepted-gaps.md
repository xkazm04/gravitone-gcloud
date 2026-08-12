# Accepted gaps — known, and deliberately not findings

Suppressed so they stop consuming attention every run. Each entry says *why* it is accepted and what
would move it back onto the board. Append when the owner accepts one; never delete — a gap that
stops being acceptable becomes a finding with `recurrence` already earned.

---

### `known-blocker` — L3 cannot run: there is no notebook loader

`app/_phases/research/ResearchStep.tsx` reads a hardcoded fixture
(`app/_phases/_shared/notebook/notebook.ts`). A notebook produced at L2 has no path onto the board,
so the surface level is unreachable.

**Accepted because:** the app is a UI-first prototype by design; the research backend was never built
and the fixture is the deliberate stand-in.
**Moves back on the board when:** any loader lands — even a dev-only "paste a notebook.json" affordance
would open L3 for all twenty Creators at once. It is plausibly the highest-leverage `ui` item in the
repo, and the run should keep saying so in `SUMMARY.md` without re-litigating it as a finding.

---

### `scope-note` — the app cannot run research at all

There is no LLM wrapper doing real work; `lib/jobs.tsx` mocks durations. L2 therefore measures the
**methodic**, not the product's execution of it. Every time-saved number is an estimate of what the
methodic *would* save if executed as written, and must be reported with that caveat rather than as a
product measurement.

**Accepted because:** prototype scope, explicitly chosen.
**Moves back on the board when:** a real runner exists — at which point time-saved becomes measurable
and the confidence field starts meaning something.

---

### `by-design` — conclusions have no sources

Conclusions are reasoned from the dimensions, not researched, so they carry no citation. A Creator
noting "these cards have no sources" has found the design, not a defect. The *falsifier* is what
substitutes for a source, which is why an uncheckable falsifier IS a finding and a missing source is
not.

**Accepted because:** opt-in asymmetry plus mandatory falsifiers is the deliberate trade.
**Moves back on the board when:** a run shows creators taking conclusions into scripts without
reading the falsifier — that would mean the safety mechanism is decorative.

---

### `present-broken` — untagged cards fall into "The number"

Facts written by a follow-up with no `CARD_DIMENSION` entry hit `?? DEFAULT_DIMENSION` and are filed
under the price column. Three round-1 follow-up facts did exactly this. Documented at
`app/_phases/_shared/notebook/dimensions.ts:42-49`.

**NOT accepted — listed here only to stop twenty Creators rediscovering it.** It is a real `ui` +
`notebook-schema` finding, already known, and any lens work must not deepen a silent fallback. Cite
it as `G-000` rather than opening a new id.
