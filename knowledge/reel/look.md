# The reel look: what the owner picked, and why

The standard a stat reel is held to. It records the owner's picks from the `reel-look` contest (2026-11-17),
in their words first, then what those words ask of every later reel. A new reel is briefed with this file;
a reel that would not stand beside these four is not done.

The picked cuts and their source: `.contest/arena/reel-look/entries/` (seat B = `claude-claude-fable-5-2_high`,
seat C = `claude-claude-opus-5-5_xhigh`), each `variant-<n>/clip.mp4`, `still.png`, `reel.html`.

## The four picks

| Reel | Picked | The owner's words |
|---|---|---|
| 1. Formula One wins, flat | **B/1 Grand Prix Lithograph** | "Both are looking good, B has edge with its animations. We should involve fact drivers are changing teams in time into the animation" |
| 2. Formula One wins, in depth | **B/2 Slipstream** | "B looks amazing" |
| 3. Orbital launches | **B/3 Towers of Light**, with a reservation | "B has more clarity but may struggle to display full world view. Data for both will need review from multiple sources as they seem invalid" |
| 4. Electricity | **C/4 Sun and Wind** | "C diagram looks better. We can use header space for the news tag, we will need to research more if we find correlation specific event causing major trend change (passing bill, contract, new government and policy), insrtead of commenting one country passed another" |

What each pick is:

- **B/1 Grand Prix Lithograph.** The ranking as a printed race poster that moves: five inks on grained paper,
  each driver an illustrated car of their own era in the ink of the team they were winning for, the trail
  behind the car its wins. A lead change is a card rising over a card while the clock holds. Canvas 2D.
- **B/2 Slipstream.** One unbroken head-on tracking shot down a wet straight at dusk; a car's distance behind
  the leader is its gap in wins, and the world never stops. Modelled cars of three eras, reflections, motion
  blur, bloom. three.js r187.
- **B/3 Towers of Light.** Every launch is one bead of light stacked at the real place it left from; towers
  on a night Earth drawn from map polygons. three.js r187.
- **C/4 Sun and Wind.** The chart is a night sky over a working landscape: countries' lines as lit filaments
  above turbines, pylons and solar rows; the legend above the full-width chart is a live leaderboard. Canvas
  2D with a WebGL bloom pass.

## What the picks ask of every reel

*(The host's reading. The owner's words above outrank it.)*

1. **The subject's own things carry the data.** Cars are the bar heads, beads stand at launch sites, turbines
   stand under a wind line. A reel is drawn from its subject's world, not dressed after the chart is done.
2. **A change is staged as an event, with weight.** The clock holds, one thing visibly passes another, a card
   lands. The owner chose B/1 over an equally good frame on its animation.
3. **In depth, the world never stops.** The rejected 3D reel halted whenever the leader did not win. In B/2
   the road, the light and the spray keep travelling and the data moves against them.
4. **Clarity beats spectacle.** B/3 was picked over a denser, more spectacular globe because it reads.
5. **A chart is a place.** C/4's lines are light over a landscape that says what the lines are made of; the
   chart runs full width; the legend sits above it and is the leaderboard.
6. **The clock is the month and the year.** No "race 481 of 1149", no source line on screen. The source lives
   in the page's data and in the video's description.
7. **Flags from files, teams as type and colour, no logos, no likenesses.** Illustration is drawn in code.

## Open orders from the owner (not yet done)

- **Team changes are animated (reel 1).** A driver changing team over time is itself shown in motion, not
  only as a tag whose text changes.
- **A full world view (reel 3).** B/3 holds one region of the globe; the finished reel must be able to show
  the whole Earth. C/3's globe is the reference for that view.
- **The launch data is reviewed against several sources before any launch reel is cut.** The owner judged the
  numbers in both launch cuts to "seem invalid". Until that review is written down with its sources, the
  launch table is not publishable, whatever its licence.
- **Event cards name causes (reel 4, and every reel).** A card says what caused a trend to change: a bill
  passed, a contract signed, a new government, a policy. "One country passed another" is the chart restating
  itself. Each cause needs research and a source; where no cause can be shown, no card. The header space
  takes the card ("the news tag").

## The stack that produced them

Both seats, independently, stayed in the browser: a page served over local http to headless Chromium on the
RTX 4090 (`data/tools/render.mjs` in the contest's data folder), current three.js (r187) with post-processing
for the 3D reels, canvas 2D for the flat ones, real OFL web fonts vendored beside the page. Measured: 0.5 to
0.7 s a frame, so a 60-second reel renders in 15 to 20 minutes. Nobody used an offline renderer.

`/reel`'s own harness (`pipeline/reel.mts`) still inlines a 2023 three.js build into a file page with system
fonts. Moving it onto this stack is the next change to the pipeline; until then a reel at this standard is
made the way the contest made them.

## Round two picks (2026-11-17, `reel-look-2` and the trend prototype)

Taken: **B/2 Legal Tender** (Fable: rates engraved as a banknote), **C/3 The Strait** (Opus: exporters as
container ships, lane = rank), and four trend reels, **Silicon Crown** (Nvidia), **Ballot Night** (midterms
against gas), **Checkout Lane** (grocery prices), **Hormuz Heat Price** (energy in four markets). Dropped: both
boxing reels, both Germany what-ifs, both GDP projections, B/3, C/2, and the crypto-theft reel.

The owner's words, verbatim:

- On C/1 The Ring Turns (boxing): "Overanimated and hectical. Web search and use posters of the fighters as
  background images to each half, redesign and animate elements on top rather"
- On C/4 Blueprint (Germany what-if): "It is unclear what is the goal of the video. The outcome of whatif
  scenario are raw numbers, not impact"
- On B/5 The Long Throw and C/5 Projector (GDP projection): "Overpopulated with elements"
- Then: "many items do share high similarity instead of following high level philosophy of high quality design"

What this adds to the standard *(host's reading)*:

8. **Calm beats busy.** Over-animation and too many elements were the named faults. One moving idea per frame.
9. **A what-if ends in an impact a person can feel** (homes powered, tonnes, lives, money per person), not in a
   second set of raw series.
10. **Convergence is a defect.** Two seats arrived at the same dark ground, bloom, glowing lines, gold accent
    and condensed sans for different subjects. The house standard is a level of craft, not a look: each reel
    gets its own art direction, and a reel that looks like a sibling has failed the brief.
11. **Open question, not yet resolved:** the owner asked for fighters' posters as backgrounds to the boxing
    halves. Fight posters are copyrighted artwork and show real people's likenesses; this conflicts with the
    no-likeness and no-scraped-artwork rules. It needs the owner's decision (licensed or press-kit imagery,
    or a drawn poster style that resembles nobody) before the boxing reel is redone.

## Round three picks (2026-11-17, ten subjects with assigned art directions)

Taken: **cut paper / film franchises**, **ink notebook / population**, **8-bit / programming languages**,
**engraved map / largest empires**, **Memphis / Wikipedia languages**. Dropped: watercolour life expectancy,
woven warming, the chess table, the clay EV what-if; the Olympic poster had no verdict.

Assigning each reel a named art direction, and showing builders every earlier still, broke the convergence:
the ten stills were unlike each other at thumbnail size. That is now the method for a new reel.

The owner's notes, verbatim:

- Cut paper: works "Idea"; fails "Visuals are dual tones, if we would have background poster changing based on
  the franchise, it would work better" (posters are copyrighted and show actors: answered with a drawn
  cut-paper backdrop per franchise instead).
- Ink notebook: works "Idea"; fails "Black and white dual tones can be enriched with subtle coloring of flags".
- Engraved map: "Good idea but poor execution. Map areas are lazy and not precise, small typography hard to read".
- Clay EV what-if: works "Nicer artwork and execution"; fails "Content of what if scenario is not interesting,
  information like filling x pools is useless and not providing any realization of the fact."

12. **A what-if's impact must change what the viewer understands**, not convert a number into a novelty unit.
    Pools of petrol were judged useless: the consequence has to be a fact the viewer did not know (who would
    lead, what would not have happened), not a bigger-sounding measure.
13. **Two tones are a limit, not a style.** The owner asked for colour in both two-tone picks.
14. **Maps are precise or absent.** A rough symbol standing in for territory reads as lazy.
