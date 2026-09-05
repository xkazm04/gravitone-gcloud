# /uat overlay - Gravitone Studio

This directory is the per-app overlay for the lane skill `/uat` (the engine lives in the ai-registry
skills lane and is linked at `.claude/skills/uat`). The engine is app-agnostic; everything below is
what is true about **this** product. Run recipe, ports, driver and fixture states live in
[`env.md`](env.md) - that file is the authority on how to reach the app, and this one on how to judge it.

```
characters/*.md     durable users (JTBD, expectations, pet peeves, MOTIVATION, SENIOR-BAR,
                    scored criteria, SURFACE-BINDING, language, background/voice)
journeys/*.md       goals (NOT scripts) + user-POV definition-of-done
env.md              how to start the app + which FIXTURE STATES each journey needs to exist
accepted-gaps.md    baseline of known-and-accepted issues (won't re-surface)
rubric.md           evaluation lens + severity + finding types (scaffold on next init if absent)
driver/lib.mjs           L2 core - persistent profile (uat/.profile), resolver, waits, snap/probe, idb()
driver/drive-script.mjs  THE driver - inline step script on stdin, one process, exit 0/1/2
driver/drive.mjs         the 2026-08-12 rebalance driver (kept; fresh-context, one journey)
runs/<date-slug>/        per-Character reports, findings.json, SUMMARY.md, l2/ scripts + journals,
                         created.json (what the run wrote into the profile), gitignored shots/
```

## What the product is

A **content-production studio**: one production walked through its phases over a Library that knows
every asset's lineage. So the acceptance question is never "does phase X render" but "can *this kind
of person* get *their* production through, and would they trust it with real work?"

Motion was retired as a step on 2026-08-14 - Frames now owns the still and the clip made from it.

## THE ONE RULE THAT CHANGES EVERYTHING HERE: the product is mocked

Every surface reads fixtures from `app/_studio/` (and the per-step stores under `_shared/`). Nothing
calls a model, a backend or a service, and that is deliberate at this stage. Therefore:

- **L2 judges the INTERFACE, never the output.** "Is the generated shot any good?" is not a question
  this app can answer yet - there is no generation. A Character who complains the take is bad is
  reviewing a fixture, and that finding is void.
- **What IS testable, and is the whole point right now:** can the Character understand where they are
  in the production, decide what to do next, see why something is blocked or refused, find an asset
  again later, and trust what the screen claims? Those are interface questions, and they are exactly
  what is cheap to fix now and expensive to fix after a backend lands.
- **The senior-quality bar is re-pointed accordingly:** not "would a senior accept this output" but
  "would a senior accept this as the instrument they run a production on".
- Any finding whose evidence is the *content* of a fixture is a `fixture` finding at most (the mock is
  unrealistic / self-contradicting), never a product defect. Tag it `mock_bound: true` and say which
  it is.
- **No test suite exists**, so nothing is already covered - but that also means a UAT finding is the
  ONLY signal for that behaviour. Write the evidence as if the reader has no other way to reproduce
  it, because they don't.

## Reachability model

There is no auth, no tier and no feature flag, so reachability is purely **navigational and
data-driven**: a surface is unreachable if no click path leads to it (a drawer with no trigger, a
state no fixture produces) or if the fixture set never puts an item in that state. A finding about the
"blocked shot" panel is mis-attributed if no fixture shot is ever blocked - check the fixtures before
judging, and **if the state is unreachable, THAT is the finding**.

## Expressiveness audit - L1's sweet spot for this product

For every state the fixture types admit (`app/_studio/types.ts` and the per-step stores), can the
surface actually render it? A `refused` cue, a `blocked` shot, a scene with zero picks, a cut with
four gaps, an asset with no caption. **A type that admits a state no component draws is a hole the
user falls into the moment real data arrives** - and it is fully visible in code. Highest-yield L1
check in this repo.

## Scope honesty

Out of scope **by design**, and the category is large and load-bearing: anything requiring a backend,
a model, persistence, auth, upload or export. "I couldn't actually render the shot" is not a finding;
"I couldn't tell that the shot would never render" is. `accepted-gaps.md` holds the standing list.

## Mock honesty (the local trap)

Never "fix" a finding by making a fixture flatter. Deleting the blocked shot to make the phase look
clean destroys the only evidence the interface can be tested against. **Fixtures may grow richer;
they may not grow happier.**

## Who the Characters should be

This studio serves people who *make things*: solo creators, small production teams, agencies, and the
clients who approve their work. When adding to the roster, span the real spread - cross
**maker <-> approver**, **solo <-> team**, and **craft-first <-> deadline-first**. Always keep at
least one **client/approver** (they surface trust and legibility gaps makers are blind to) and one
**first-timer** (the phase model is a strong opinion - someone has to meet it cold). An all-editor
roster tests a fiction. Ground each in research: how that role actually runs a production today
(Premiere/Resolve + a spreadsheet, Frame.io for review, a shot list in Notion, a Discord thread of
takes), what the real approval loop looks like, and **how long the job takes the current way** (that
anchors time-saved).

## Anchor journeys

The product's real high-value flows, for `init`/`update` to draw from:

- know where the production stands and what is blocking it
- pick the frame for a scene and know why the others lost
- find out why a shot never rendered
- understand what the cut is missing before showing a client
- find an asset weeks later and prove where it came from
- hand the project to someone else without explaining it

## Synthesis note

For this studio, explicitly call out **which phase loses people** ("Script and Frames land; X loses
everyone at the blocked shot, because nothing says what unblocks it"). The phase model is the
product's central bet, and where it leaks is the finding that matters most.

## Feed the loop

A P0/P1 theme that needs product work rather than a patch belongs in
`.vault/Perfect/directions/<slug>.md` with `status: proposed` - but only with the user's explicit
acceptance. `/uat` finds; `/perfect` decides and builds.

## Drain homes

- Analysis doc: `docs/product/uat-insights/<run-id>.md`
- Backlog: `docs/BACKLOG.md`
- Concept docs: `docs/product/concepts/`
