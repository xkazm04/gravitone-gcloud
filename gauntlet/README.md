# The Gauntlet — overlay

The app-specific half of `/gauntlet`. The skill (`.claude/skills/gauntlet/SKILL.md`) is the engine;
everything here is what it is pointed at.

**Subject under test: the research methodic, not the app.** See the `targets[]` table in the skill.

```
gauntlet/
  README.md          # this file — template, drain homes
  rubric.md          # finding schema, dimensions, impact scoring, the scored-criteria contract
  lens-spec.md       # the Lens shape + 5 HYPOTHESIS lenses (the cast never sees these before L1)
  env.md             # how to actually run an L2 — the terminal pipeline, not the browser
  accepted-gaps.md   # known and accepted; suppressed so they stop consuming attention
  declined.md        # lenses and proposals refused, with reasons (written by `adopt`)
  creators/*.md      # the durable cast of 20
  runs/<id>/         # artifacts (see skill § Mode: run)
```

## Why "Creator" and not "Character"

`/uat`'s Characters are *users of a UI*. A Gauntlet Creator is a **working video-essayist with a
beat** — they arrive with a topic they were already going to make, and their verdict is about whether
the methodic could research it, not whether the buttons were findable. Different noun, because a
different question.

## Creator template

```markdown
---
id: <kebab-slug>
area: geopolitics | tech | fraud | entertainment
beat: <one line — what this channel is about>
lens-binding: <hypothesis lens id from lens-spec.md>   # attribution only; never shown at L1
hostile: <why this seat is structurally hard>          # omit if not a hostile seat
status: active | retired
---

# <Name> — <channel>

## Who
Two or three sentences of lived experience. Where they came from, what they were burned by, who they
answer to, what is at stake when they publish. This is the texture that makes a voice authentic
rather than generic — a Creator with no history writes reviews that could be about any product.

## The topic they brought
**"<the specific, live topic>"**
Why now, and what they already believe about it (so a notebook that only confirms their prior is a
finding, not a success).

## Manual baseline
- The way they research it today: <process>
- Time: **~<N>h** across <M> sessions
- What they'd accept from the app: **<N>min**, and what they'd trade for it

## Senior bar
Would the notebook pass as *their own* research? Concretely: what makes them reject a research doc.

## Exposure bar
What being wrong costs here. Who complains, to whom, and what happens next.

## Pet peeves
The three things that make them close a tool.

## Scored criteria (applied identically every run)
1. …  (5–8 explicit pass/fail checks derived from the above)

## Voice
How they actually talk — sentence length, register, whether they swear, what they're sarcastic about.
```

## Drain homes

- Findings + reports: `gauntlet/runs/<run-id>/`
- Judge verdict: `gauntlet/runs/<run-id>/VERDICT.md`
- Lens rulings: `gauntlet/runs/<run-id>/LENSES.md`, promoted into `gauntlet/lens-spec.md` on `adopt`
- **Concept docs: `docs/concepts/`** — where a proposal goes when it changes a shared contract and
  the evidence has not been judged. Created 2026-08-12 with `chain-and-independence.md`; the skill
  says `drain` must CREATE this home rather than assume it, because a home no mode ever wrote is how
  a repo accumulates undrained runs.
- Declined proposals: `gauntlet/declined.md`
- Methodic edits land in the real files (`pipeline/*.md`, `app/_phases/research/*.ts`,
  `knowledge/*.md`) — never in a parallel document that describes what the methodic should be

## The cast

| # | Creator | Area | Topic | Hostile |
|---|---|---|---|---|
| 1 | `macro-economy` | Geopolitics | The dollar-share-of-reserves decline | |
| 2 | `sanctions-trade` | Geopolitics | Whether the Russian oil price cap ever worked | |
| 3 | `conflict-osint` | Geopolitics | Drone-vs-armour cost asymmetry | **48h evidence, no literature** |
| 4 | `bill-analysis` | Geopolitics | What the EU AI Act actually obliges | |
| 5 | `news-reaction` | Geopolitics | A story that broke this morning | **no steel-man exists yet** |
| 6 | `electoral` | Geopolitics | Why polling missed again | |
| 7 | `software-eng` | Tech | Why microservices got un-recommended | |
| 8 | `hardware-silicon` | Tech | HBM supply as the real AI bottleneck | |
| 9 | `llm-research` | Tech | Whether benchmark scores still mean anything | |
| 10 | `devtools-business` | Tech | Open-source licence rug-pulls | |
| 11 | `security-breach` | Tech | Anatomy of a supply-chain compromise | |
| 12 | `public-co-fraud` | Fraud | A short-seller report nobody has adjudicated | **named living people** |
| 13 | `crypto-collapse` | Fraud | Where the money actually went | |
| 14 | `public-corruption` | Fraud | A procurement scandal | **named living people** |
| 15 | `consumer-scam` | Fraud | An MLM's income disclosure | |
| 16 | `game-postmortem` | Entertainment | Why a big launch underperformed | |
| 17 | `box-office` | Entertainment | A flop that wasn't a flop | |
| 18 | `streaming-econ` | Entertainment | Why the catalogue keeps shrinking | |
| 19 | `music-industry` | Entertainment | Who actually gets paid per stream | |
| 20 | `creator-economy` | Entertainment | Why a format died | **no numbers exist at all** |

Topics are named precisely inside each Creator file; this table is the index.
