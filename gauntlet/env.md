# Environment — how a Gauntlet level actually runs

The per-app file. Where `/uat`'s env.md describes a browser and a port, this one describes a
**research pass**, because that is what is under test.

## L1 — dry fit

No environment. The agent reads files. Required reading, in order:

1. `pipeline/RESEARCH-PROMPT.md` — the instruction set
2. `pipeline/NOTEBOOK-SCHEMA.md` — the shape of the deliverable
3. `app/_phases/_shared/notebook/dimensions.ts` — the seven columns, their purposes and their
   `emptyMeans` (an `emptyMeans` is a *claim about what an empty column signifies*; test it)
4. `app/_phases/_shared/notebook/conclusions.ts` — the leap ladder and the falsifier requirement
5. `knowledge/CRAFT-BASELINE.md` — the one law
6. `knowledge/ENGINES.md` — the seven engines, and § D-honest vs D-rigged
7. `pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/` — the worked reference. Read
   `notebook.json` and one script. **This is what "it worked" looks like; your job is to find where
   your topic wouldn't have.**

**Do not read `gauntlet/lens-spec.md`.** It contains the orchestrator's hypotheses and reading it
will bias the pass toward confirming them.

## L2 — live notebook

Runs in the **terminal**, not the browser, executed by the agent using `WebSearch`/`WebFetch` exactly
as the Bitcoin run was. The app has no research backend; the triage board renders a hardcoded
fixture. Driving the browser here would test the fixture.

```
gauntlet/runs/<run-id>/<creator>/
  notebook.json          # conforms to pipeline/NOTEBOOK-SCHEMA.md — no exceptions, and a field you
                         # wanted and couldn't fill is a `notebook-schema` finding, not a workaround
  script--<engine>.md
  NOTES.md               # what the run did, what it couldn't find, what it had to invent
```

**Budget:** 4–8 searches for Phase 1 per the prompt, plus what Phase 2 needs. A run that blows past
this to make the topic work is itself the finding — record the actual search count.

**Never fabricate a source.** An L2 that cannot find real material for a topic reports that. A domain
whose evidence is not reachable in one research pass is precisely what this exercise hunts, and
inventing a citation to complete the run destroys the only thing the run was for.

### The computed checks (run them, do not estimate)

```bash
# word count + runtime at the notebook's declared wpm
python knowledge/templates/short-educational-video/steps/01-script/corpus/metrics.py gauntlet/runs/<id>/<creator>/script--<engine>.md
```
If that script does not cover for a check you need, write the check — an arithmetic claim in a
report that was eyeballed is how a script shipped claiming 5:00/947w over a 6:07/1161w body.

## L3 — surface (browser) — BLOCKED

Would load a produced notebook into the live triage board. **There is no loader.**
`app/_phases/research/ResearchStep.tsx` reads `_shared/notebook/notebook.ts`, a hardcoded fixture.

Recorded as `known-blocker` in `accepted-gaps.md`. When a loader lands:

```bash
NEXT_DIST_DIR=.next-gauntlet NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3184
node pipeline/drive-research-step.mjs http://localhost:3184
```
Port 3184 is reserved for the Gauntlet so it never collides with the user's `:3000` or the drive
suites' `:3183`. Release the port and delete `.next-gauntlet` when done.

**Server hygiene** (scars, all paid for already): kill by the port-holding PID and assert the server
prints Ready — `kill $(cat pidfile)` does not kill node, and a stale server has answered for three
consecutive runs before now. Never pipe `npm run build` into `head` — SIGPIPE kills the build and
leaves a half-written `.next`.

## Fixture readiness

The cast needs **distinct** topics. Two Creators researching near-identical subjects hide exactly the
defects the run is for — a shared column gap reads as convergence when it is duplication. Before a
run, assert every Creator's topic is genuinely different in *shape*, not just in subject: at least one
with no numbers, one with no counter-case literature, one whose actors are private individuals, one
whose evidence is entirely interpretive.
