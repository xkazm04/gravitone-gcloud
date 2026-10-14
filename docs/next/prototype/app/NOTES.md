# The Watershed

## Philosophy
The Weir stays the one floor and the one gate. Around it, the same river gets its banks: **Projects** draws each project as a composition on the resources that carry it, **Runs** is where you steer it, the **Ledger** gauges every act, the **Library** is the reservoir, and the **Calendar** rail opens into the month. One design system (`tokens.css`, `shell.js`) builds all of it, at the floor's sizing, with no label under 12 px.

## How it stays readable at scale
- **Library:** 5,000 items, virtualised, with a "rendered N of M" readout.
- **Ledger:** 688 events plus this session's acts, virtualised, with a day histogram and live facets.
- **Runs:** lanes split into sub-tracks up to their capacity. The selected project's thread is lit and the rest dims.
- **Month:** a busy day shows what fits, then +N.

## Where every current module went
- **Projects + Studio + wizard** → `projects.html`: Plan, Runs, and Compose (N) with Film, Album video and Explainer recipes.
- **Board** → the Weir column and the Board sheet. Gates are also a row in Runs.
- **Calendar** → the floor rail, which expands to a month (C).
- **Library** → `library.html`.
- **Foundry stations** → the floor's Foundry column, Board verdicts and Library styles. The Pipeline canvas becomes Runs.
- **Articles** → the Article lane, Packet Review, Library · documents, and the Explainer recipe.
- **Sound lab** → the Audio lane (⇧3), triage on the Board, and Library audio facets. A kept take becomes an Album video.
- **New** → `ledger.html` and `kit.html`.

## What was absorbed (a-d) and how
**a)** The calendar rail grows leftward into a month grid. It has channel toggles, and publish errors appear verbatim. `Esc` returns to the rail.

**b)** The Ledger is a typed, append-only event list. Each event records actor (operator/agent/machine), a linked subject, lane, cost with its source, and time. Filters live in the URL hash. A JSONL view and `GT_LEDGER.query()` serve agents. Acts on the Floor and in Runs append live.

**c)** The vocabulary is the spine. The rail runs Kind, then that kind's real vocabulary (style observables; genre/mood/instrument; registry bundle), then State, Collections and Origin. Counts are live: OR within a group, AND across groups. 342 items are real. 4,658 are an illustrative scale-up derived from them, labelled and switchable.

**d)** A project is a recipe of parts. Each part is a job: a model on a lane, with units, minutes, cost and dependencies. **Plan** prices every model choice in its picker. **Runs** is the day-line across seven resources, the Weir and the Calendar. From there you can:
- reorder, pause or retry;
- re-route, with ΔETA, Δcost and queue position shown first;
- see what blocks what, through to the real calendar slot.

## The wow moment
In Runs, open *Why the Bitcoin price does not rise* and click **frames ×40**. Its upstream lights cyan and its downstream amber. The re-route list already prices Google: *eta −1h 23m, +$1.60*. Take it: the bar jumps lanes and the chain slides earlier. The Ledger count ticks up.

## Known limits
- **Runs minutes and costs are illustrative**, except the model's estimates: 1.6 min/plate, $47–92 per article, 4 min per Suno prompt, 31.5 min encode.
- **My calls:** the re-route catalogue, a four-session Text seat, and text-seat jobs attributed to the *agent* actor.
- **Session acts survive a reload.** `shell.js` keeps a journal (`gravitone.next.journal.v1`) beside the ledger; each route replays its own acts through its own functions over the fixture baseline. A run that is still in flight restarts. The reset control in the header appears after the first operator or agent act and clears both keys.
- **Some data is derived or broken:** 341 ledger timestamps are derived (marked ≈), and the fixture export mp4s cannot be decoded, so their tiles say so.
