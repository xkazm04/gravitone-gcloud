# Almanac

## Philosophy
The studio as a star atlas. Every candidate is a star, and most stay faint. A person picks a few, and the dotted gold line through the picks is the film: the cut. The door is an engraved night chart; the 19 real pictures are its only light, each in a circular eyepiece. The four real groups are constellations, each with its own drawn figure and tint, all labelled stylised: Bracket is a prism splitting one ray into six, Templates a lyre, Disciplines a pair of dividers, Engines a balance. The identity shares that world: the G asterism (five studio steps on a construction circle), GRAVITONE lettered in constellation capitals, Prussian Night with gold leaf, and a single red (Aldebaran) kept for the pick.

## How it stays readable at scale
The chart is a fixed 1600×1000 stage (1000×2250 on phones), letterboxed inside a full-bleed sky, so it never stretches. There are three levels: Sky, then a constellation (the camera flies in and the others dim), then a plate. Breadcrumbs, a back pill, Esc and the arrow keys work at every level. The Index filters as you type, and Enter opens the plate. One canvas of faint stars stands for the rest of the catalogue.

## The wow moment
The sky rises out of Deep Field. The stars ignite, the figures draw themselves in, the four picks flare, then the cut draws through them. Hovering a star puts its name at the centre in large italic. Opening a star expands its eyepiece circle into an engraved plate with registration marks.

## Known limits
The chart is dense at 390px. Every eyepiece is at least 44px, but the per-star labels in the zoomed Bracket crowd one another. Figures stretch slightly on the vertical chart.

The Foundry runs on sample data. The 19 pictures are real product output, but the run IDs, scores, verdicts, recipes and techniques around them are illustrative, and the header labels the page a proposal. A few pictures appear in more than one tab (for example, a style's exemplar is also a candidate in a forge run). Verdicts are held in memory, so a reload starts fresh.

## What changed in round 2

**1. The door's type floor is now real: 12 px minimum at every size, and 0% of visible text is under it.**
Answers: *"fix the 11.1 px minimum type at 1920x1080 (30% of visible text under the 12 px floor)."*
The cause was structural. Every chart label (constellation names, star names, graticule numbers, THE CUT) was sized in chart units inside the scaled camera. At 1920×1080 the camera scale is 1.08, so a label specified at 12 units computed to 11.1 px, even though it rendered at 12 px. Those labels now live in a screen-space layer. Each frame of a camera flight projects them to their chart positions, so their computed size is their rendered size, and they stay sharp through a zoom instead of being resampled. Sizes follow the stage scale with a floor: `max(12px, 12.5px × scale)` for caps and `max(17px, 23px × scale)` for constellation names. The brand sheet had the same hidden fault. The G-asterism construction labels were SVG text at 1 unit, which rendered at about 9 px. That drawing is now built in pixel-true units with 13 px labels, and the magnitude numerals are 15 px. An audit of every visible text node by computed font size covered 23 views: the door, its constellation level, and all four Foundry tabs, at 390×844, 1280×800, 1920×1080 and 2560×1440. It finds a minimum of 12 px and nothing under it.

**2. A second page, `foundry.html`: the product's /foundry route rebuilt in the Almanac identity.**
Answers: *"add into the variant another page to see the styles in action for more practical pages. Use /foundry route to rework."*
It has the same tasks and the same information as the real route, in a new brand, and no code from it was ported. There are four tabs, each carrying its count as a tally: Cull 4, Extract 2, Styles 13, Dojo 1. A tally turns gold when something is running or waiting on a person, and it disappears when the list cannot be read. The page's figure is Fornax, the Furnace, a real constellation named for a chemical furnace, drawn as an engraved kiln and retort and labelled stylised. Its four stars are the four modules; clicking one opens that module, and the active one is ringed.
- **Cull.** A run list shows each run's status mark and progress. The matrix puts styles down and mechanisms across, with the scene's source frame pinned beside it and its annotation chips. The keyboard does everything: arrows move, K keeps, X rejects, U clears, Enter compares. Row K and row X judge a whole style at once. Every real state is present: a live run that ticks while you watch, a run ready to cull, a failed run showing its real error, and a committed run that is read-only with deleted tiles marked absent. The dock carries the counts, the save state ("saving…", "saved", "save failed — retry a verdict") and the keys. The Commit button shows the one clause that blocks it ("run is generating", "keep at least one candidate first").
- **Destructive confirm.** A rail shows kept, rejected, and undecided hatched into rejected. It states the consequence and the ledger path, and its button reads "Delete 9, keep 3". A failed commit keeps the dialog open and says nothing was deleted. After a commit, rejected tiles become "deleted", findings.md opens as its own document (read by row and by column), and the kept renders join the Styles catalogue.
- **Styles.** A family rail sits beside cards, each with one picture (a kept render, else a source) and a status of proven or candidate. Styles with no picture show "no render yet".
- **Extract.** Runs are driven from the page. Resume advances a live grouping run until the sample's GPU step fails ("flux-dev — CUDA out of memory"), and the control becomes Retry. A committed extraction is shown read-only. The new-run form accepts dropped files and previews them.
- **Dojo.** Improvement cards show the claim, the standard challenged, a judge chip and a Gemini agreement chip, with a wall of paired images. The judge's pick carries a gold ✦ PICK mark, and any Gemini disagreement is quoted. K approves and X rejects. Its confirm has a third, untouched outcome, because a Dojo commit leaves undecided media alone.
- **Sample switch** (header): Full, Empty, Offline, Flaky. The empty, unreachable and failing-save states can each be seen without editing a file.

**3. The door and the Foundry link both ways.**
Answers the host's reading: *"linked from the door (and back)."*
The door's footer has a Foundry pill, and the brand sheet has a new "Working marks" section that ends with a link to the Foundry. On the Foundry, the wordmark and the first breadcrumb, Door, lead back. On phones, the door's three pills share one row, so the footer is no taller than in round 1.

**4. The identity proven under load: a working vocabulary, not a new skin.**
Answers the host's reading: *"Show the identity working under load: tables, tallies, status vocabulary, focus rings, a modal, a destructive confirm."*
Each state reuses the door's own world:
- Kept is the door's pick, an Aldebaran ring with a four-point star. The ring draws itself and the tile flares, the same beat as the picks on the door.
- Rejected is occulted: a dark disc slides across the picture.
- Undecided is a dashed ring, and live is gold and turning. Committed is a double ring: charted, read-only.
- Scores are magnitudes: a star sized by its weight, beside the percentage.
- Grader credits use three marks: full, half and crossed.
- The focus ring is the plate's registration corners.

One colour was added and is declared in the brand sheet: **Antares** `#EE6A8C`, for errors and for what a commit deletes. This keeps red-orange meaning "a person kept this" everywhere.

**5. Levels, and heavy content on its own surface.**
Answers: *"Levels, not one layer"* and *"Heavy content gets its own surface."*
The Foundry has three levels: module, then run, then candidate. The candidate is a full-screen comparison: source beside candidate at full width, craft and style tables, the grader's words, and the prompt. Its tile flies into place, ← and → step, and K, X and U decide. A style's recipe, observables, negative and evidence ledger form a full document with ← and → between styles. So do a Dojo technique's claim, rule, triggers, laws and evidence wall. Every level has its breadcrumb, a named back button and Esc.

**6. Practical-first type on the working page.**
Answers: *"Body text at 14 px or larger at a 1280 x 800 window; nothing the user must read below 12 px; no label truncated mid-word."*
Body text is 15–16 px, table text 14.5 px, and labels at least 12.5 px. Style origins moved out of the narrow row headers. Filenames and dates wrap instead of ending in an ellipsis. On phones the breadcrumb shrinks to Door rather than cutting off a run ID. The page never explains itself: state rides on tallies, marks and one-clause locks. The only sentences are consequences and real errors.

**7. Kept, as praised:** the chart, the arrival, the three door levels, the centre-stage hover name and the eyepiece-to-plate opening are unchanged apart from the label layer. `prefers-reduced-motion` still gets the calm version on both pages.
