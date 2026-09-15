# Amara — compose-from-scratch · L1 (theoretical, code-grounded)

Character: `uat/characters/amara-brand-launch.md` (AM) · buyer, in-house marketing, non-technical.
Journey: `uat/journeys/compose-from-scratch.md` · scenarios S4 (free → beats), S5 (fresh account, style stage), S6 (return visit + shelf hand-off).
Extra lens (buyer): the shelf (`ProjectsMatrix.tsx`, `parts.tsx`) and the expert quick-create dialog (`ProjectDialog.tsx`) as "what my team sees on Monday".

Impact scoring: `frequency` · `reachability` · `trust_erosion` each 1–5 (5 = every user / one click from the front door / would stop a buyer).

Motivation (verbatim): *The manual way: brief → agency beat sheet → two review rounds is ~4 days of calendar time and a fee. She will adopt a tool where her team composes a reviewable beat list in one hour on day one — and she will not buy one whose first project needs a detour.*

Senior bar (verbatim): *A senior brand lead refuses a spot that opens without the product's promise and refuses beats that do not pay it. The composed cut must show the promise and its payer, and the structure check must not say "works".*

---

## Surface model

### Reachable set for a free-discipline project on a fresh account

| Stage | Surface | Route decided by | Reachable? |
|---|---|---|---|
| Shelf | `app/projects/ProjectsView.tsx` → `app/_projects/ProjectsMatrix.tsx` | seeded 6 demo rows on first mount (`app/_studio/projectSeed.ts`) | yes |
| Create (guided) | `app/projects/new/page.tsx` → `app/_projects/wizard/CreateWizard.tsx` + `stages.tsx` on `components/ui/deck/Deck.tsx` | `onCreate` always routes here (`ProjectsView.tsx:146`) | yes, **dead-ends at stage 3 for `free`** (below) |
| Create (expert) | `app/_projects/ProjectDialog.tsx` | header button (`ProjectsView.tsx:94-100`) | yes, **Create disabled for `free`** (below) |
| Studio | `app/studio/[projectId]/StudioView.tsx` + `Stepper.tsx` + `phases.tsx` | opens on `project.phase` (`StudioView.tsx:106-110`) | only if a project exists |
| Research (free) | `ResearchStep.tsx:96-98` → `BeatsResearch` → `ModeChooser` (`beats/ModeChooser.tsx`) → `BeatVariantBoard` | `discipline === "free"` and `beats.mode === null` → chooser (`ResearchStep.tsx:122`) | yes |
| Beat board | `beats/BeatVariantBoard.tsx`, `SlotColumn.tsx`, `VariantTile.tsx`, slots from `beats.ts#slotsFor` → `GLASS_HARBOR_SLOTS` (`app/_studio/trailerFixtures.ts:114`) | `slotsFor("free")` returns the Glass Harbor 8 slots (`beats.ts:47-49`) | yes |
| Script (trailer half) | `ScriptStep.tsx:104-110` → `trailer/TrailerScript.tsx` via `useTrailerCut.ts` | `discipline === "free" && picks.mode === "beats"` | yes (H6 free+beats confirmed) |
| Script (explainer half) | `ScriptStep.tsx:126` → `ExplainerScript` | free + facts | reachable but not Amara's path |

**Reachability verdict before judging:** the studio half of the journey is fully reachable *if* a project exists. The project cannot be created. Everything from "Research" down is therefore evaluated as designed experience, conditional on H1 being fixed.

### H1 — executed, not eyeballed

`CreateWizard.tsx:110-113` filters presets with `styleFits(p, discipline)`; `lib/themes.ts:133-135` is `discipline === "all" || !theme.discipline || theme.discipline === discipline`; every preset carries `discipline: "educational"` (`app/library/presets.ts:49,66,83,100,117,134`). Reproduction over the presets file:

```
educational presets fitting: 6 / 6
trailer     presets fitting: 0 / 6
free        presets fitting: 0 / 6
```

With `fittingThemes.length === 0` (fresh account, `lockedOnly([])`) and `fittingPresets.length === 0`, `CreateWizard.tsx:231-232` renders `EmptyStyleDeck` (`stages.tsx:158-177`). The style stage's `done` is `styleId !== null` (`CreateWizard.tsx:224`), so `Deck.tsx:148` disables Next and `Deck.tsx:65-66` makes stage 4 unreachable. The only affordance is `<Link href="/library">commission one in the library →</Link>` (`stages.tsx:169-174`), which unmounts `CreateWizard` and its `useState` picks — while the deck copy two lines above says "Your picks here are kept while you go back a stage" (`stages.tsx:166-167`). **H1 confirmed** for `free` and `trailer`.

The shelf banner contradicts this: `ProjectsView.tsx:105-107` says "the create wizard offers presets that lock on create" — true only for educational.

### The expert dialog vs the wizard (buyer check)

| Rule | Wizard | Dialog | Agree? |
|---|---|---|---|
| Discipline/template/runtime copy | `DISCIPLINE_NOTE`, template `note`, runtime hint | same catalogues | yes |
| Style offered | locked themes + presets minted on create (`CreateWizard.tsx:151-172`) | locked themes only (`ProjectDialog.tsx:268-290`) | **no** — the dialog never offers a preset, even for educational |
| Empty style state | `EmptyStyleDeck` → `/library` | amber line "Lock one in the library, or one from a brief" (`ProjectDialog.tsx:268-273`), Create stays disabled (`:111`) | both dead-end; the dialog does not even route |
| Discipline change with non-fitting template | cleared, stage reopens (`CreateWizard.tsx:127-130`) | moved to first-of-discipline (`ProjectDialog.tsx:124-137`) | stated difference, documented in the header comment |
| Close-on-success | yes | yes | yes |

Commissioning a style in `/library` is a vendor render (`app/library/LibraryAtelier.tsx:11` — proofs come back from `/api/imaging/generate`; `Playground.tsx` prices it via `/api/imaging/pricing`). For a fresh account that is a key + spend before a single beat exists. Definition-of-done item 7 ("nothing forced me into … spending money") is violated *by the create path itself* for a free project.

### Wiring audit (one grep per suspected unread value)

- `targetS` / runtime in `research/beats/*` and `script/trailer/*`: **zero reads**. `composeCut` hard-codes `rung: "long-cut"`, `lane: "wide-release"` (`cut.ts:61-62`).
- `reportPhase` writers: only `app/_phases/frames/useFrames.ts:724`. Research beats `confirm()` (`useBeatPicks.ts:62-75`) and the cut save (`useTrailerCut.ts:83-86`) never report. `parkAt` leaves `updatedAt` alone by design (`lib/projects.ts:516-520`). **H4 confirmed.**
- `script-trailer` step: written only by `useTrailerCut.ts:85`; no reader ever deletes/invalidates it. On hydrate, a saved cut wins and the picks are not re-read (`useTrailerCut.ts:51-57`); `reopen` only nulls `confirmed` (`useBeatPicks.ts:81`).
- "fixture"/"Glass Harbor"/"stand-in" in `script/trailer/*.tsx`: **zero matches.**
- `promises:` in `trailerFixtures.ts`: **0** — no fixture beat declares a promise.
- H5 (one slot set for every promotional template): true in code (`beats.ts:48`), but Amara is `free` and the free board says it borrows the trailer spine — not raised here; belongs to the trailer Characters.
- H2 (Bitcoin notebook): not on Amara's path (beats mode).

### Grounding scores (env.md denominator)

- `beat-board` — (1) logline ✗ (2) template ✗ (3) target runtime ✗ (4) locked style's tone ✗ → **0/4**, matches the accepted fixture ceiling. What is NOT covered by the ceiling: the disclosure line names only the logline ("whatever the project's logline", `BeatVariantBoard.tsx:44-47`) and the composed cut then *asserts* a rung the runtime contradicts (AM-L1-9).
- `research-run`, `script-candidates`: not met on this path.

---

## Walkthrough (in Amara's shoes, cognitive-walkthrough questions per stage)

**0 · The shelf (`/projects`).** Six demo rows appear on a "fresh" account. *Does she know these are not hers?* The matrix has no "demo" marker; the row titles ("Why the Bitcoin price does not rise") and the amber banner about styles are the only cues. The banner tells her the wizard offers presets that lock on create — she trusts it. The "New project" CTA goes to the wizard; "quick create — the expert form" is muted in the header. Good separation for a team of three: juniors get the wizard.

**1 · Discipline.** Headline "What kind of video is this?" — her vocabulary. Three cards: "Educational video", "Movie · game trailer", "Any video". Her promo is neither of the first two; "Any video" with "no craft template — your own discipline; the studio only keeps time" is the honest third answer and she takes it. *Will she know what to do?* Yes. *Will she see feedback?* The rail summarises "Any video". The trailer card's body says "a promotional cut that opens a debt another artifact pays" — her pet peeve word, on the card she nearly picked. (AM-L1-3)

**2 · Template.** "Which craft format inside it?" — for a discipline that just told her it has no craft template. One card, "Free form", "15–600s accepted" (honest: *accepted*, not *measured*, `stages.tsx:82-87`). A one-card question she must click through. (AM-L1-12)

**3 · Style.** "Which visual identity does it render in?" — she expects presets (the shelf banner promised them). She gets: "No locked style fits any video yet … commission one in the library →". Next is disabled; stage 4 is greyed. *Is the action available?* No. The only way forward leaves the wizard and, despite the copy, drops her picks. In the library, a style needs generated proofs (a paid render) before it can lock. **Her rule: she will not buy a tool whose first project needs a detour. This is the detour.** (AM-L1-1)

She tries the expert form. Discipline "Any video" → the style row says "No locked style fits any video yet. Lock one in the library, or one from a brief, which fits every discipline." Create & open is disabled. Same wall, less signposting. (AM-L1-2)

*Everything below is the designed experience once a free project exists.*

**4 · Name & clock.** Title, optional logline ("It is what the script step argues back against" — for her path, nothing argues against it; the beats are fixed), runtime hint "Nothing was measured for a free-form video… the studio only keeps time." She types 45. Honest. Create & open → `/studio/<id>` with her title as the headline, the pill "ANY VIDEO · FREE FORM · 45s" and "PROTOTYPE · MOCKED DATA" beside it (`StudioView.tsx:203-211`). Good.

**5 · Research — the mode question.** Eyebrow "any video · research mode". Two big buttons: "facts to involve — A topic goes in, a notebook comes out, and you scope what the script may use." / "beats to choose — Candidate beats per part of a spine; you pick one each, and Script opens on the spine." Reversible, stated. *Can her junior answer this from the words on screen?* "notebook", "scope", "spine", "Script opens on the spine" — studio nouns, none defined here. A brand junior knows "beats" from a beat sheet and would pick right by elimination, but not by understanding. (AM-L1-4)

**6 · The beat board.** Header: "Any video · beat variants … This project has no craft template; it borrows the trailer spine because it is the only beat vocabulary the studio has." and "fixture · n=0 · the Glass Harbor slots, whatever the project's logline — a model run from pipeline/BEATS-PROMPT.md is what replaces them". *Does she know this is a stand-in before deciding?* **Yes** — this is the best-labelled surface on the path (criterion 3 passes). Eight columns, each "nothing picked here — the spine has a hole at <role> until one is" (amber), 2–3 tiles each with kind / connector / timecode / "raises scale" chips, rationale, risk. The content is a heist film. Her junior can read a tile; the chips (`rung`, `raises intimacy`, `holds nothing`) are jargon but the rationale sentences carry it. Compose is disabled until all eight are picked, with "unpicked: …" as the tooltip. She composes: "Step 2 opens on this frozen spine. Reopen to change a pick; it must be composed again." The ModeSwitch locks with a sentence about `researched` — accurate, over-technical.

**7 · Script (trailer half).** "composed from — 8 picked parts · cue: Low Tide — candidate cue · lane: wide-release" then "*<her title>* · long-cut · the cue is a candidate, not frozen". Energy curve, eight movement sections, promise ledger, withholding budget, structure panel. *Does the surface say any of this is a stand-in?* **No.** Her title sits over Mara, tide-gates and "campaign-glass-harbor"; the withholding budget lists five assets "of the work" that belong to a film she has never heard of, with no fixture line anywhere on the step. This is the first place the borrowed material appears unlabelled (H3: the board labels it, Script does not). (AM-L1-5)

The **promise ledger** reads "0 promised · 0 incomplete" and "no promise declared on any beat — the ledger is empty, which is not the same as the cut promising nothing". Criterion 4 asks it to "name a payer or say none" — it says none, and says it carefully. Her senior bar wants the promise and its payer on the composed cut; the composed cut carries neither because the fixture declares none. She can type a promise and a payer herself (placeholder "the moment in the work that pays this" — "the work", not "the artifact"; fine). (AM-L1-6)

The **structure panel** header: "malformed: no · 55% enforced · N pass · 0 violation · N unmeasured", note "This says the cut is well-FORMED. It says nothing about whether it works — see the efficacy row." The efficacy row is `unmeasured` on every report. **The check never says "works".** Senior bar met on this point. Strength.

The ladder row passes "A long cut, and no part is declared dropped" for a 45-second project whose beats run to 1:50. Nothing on the step says the runtime was never read. (AM-L1-9)

**8 · The review round (S6, the loop her job is made of).** She sends the link to her junior; the junior reopens the spine, swaps the climax, composes again, opens Script — and sees the *old* cut. `useTrailerCut` loads the saved cut and never re-reads picks; nothing clears `script-trailer`. The board's own copy ("it must be composed again") and the ModeSwitch lock text both imply Script follows a re-compose; `cut.ts:7-9` says the opposite is the design ("once composed, the cut is the creator's and the board's picks are its history"). Neither surface tells her which. (AM-L1-8)

**9 · Monday, the shelf.** Her row: title, grey "draft" dot, five hollow cells ("not started" on hover for Research and Script both), "Run 0:45", "Updated 3d ago" — the creation time. Clicking the row opens at the parked step (Script, if she moved the rail), so the work is *there*; the shelf just never says so. Footer "Locked · stopped" counts nothing for her. Criterion 5 fails. (AM-L1-7)

Persistence itself holds: mode + picks (`research-beats`), the research flag, the cut (`script-trailer`), the bookmark (`parkAt`) — all per project in IndexedDB; the studio reopens on her title and her parked step. Strength.

---

## Scored criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | A free-discipline project can be created on a fresh account without leaving the wizard | **FAIL** | `CreateWizard.tsx:110-113,231-232`; `stages.tsx:158-177`; `presets.ts` all `educational`; predicate reproduction 0/6; `Deck.tsx:65-66,148` |
| 2 | The research-mode question is answerable by a junior from the words on screen | **CONDITIONAL** | `ModeChooser.tsx:18-29,35-40` — answerable by elimination, not by the words; L2 junior read-aloud needed |
| 3 | The beat board states the fixture/borrowed nature of its vocabulary | **PASS** | `BeatVariantBoard.tsx:40-47` |
| 4 | The composed cut's promise ledger names a payer or says none | **PASS (weak)** | `PromiseLedger.tsx:45-48` says none, honestly; the fixture declares no promise at all (`trailerFixtures.ts` — 0 `promises:`), so the senior bar is not reached by the composed cut |
| 5 | The shelf row reflects the project's state after composing | **FAIL** | `reportPhase` only in `useFrames.ts:724`; `parkAt` leaves `updatedAt` (`projects.ts:516-520`); `ProjectsMatrix.tsx:138-139,150-156,163-165` |

Senior bar: structure check never says "works" — **met** (`StructurePanel.tsx:85-96`, `structure.ts:1243-1251,1292-1294`). Promise + payer on the composed cut — **not met** (fixture-bound).

---

## Findings

```json
[
  {
    "id": "AM-L1-1",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "blocker",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 5 },
    "dimension": "reachability",
    "title": "A free (or trailer) project cannot be created on a fresh account: the wizard's style stage is empty and its only exit leaves the wizard and drops the picks",
    "expected": "Stage 3 offers at least one honest choice for 'Any video' — an untagged preset, a 'no style yet, decide at Frames' card, or presets not filtered by discipline — so Create & open is reachable without a detour.",
    "got": "styleFits(p, 'free') is false for all six presets (every preset is tagged educational), lockedOnly([]) is empty on a fresh account, so EmptyStyleDeck renders, Next is disabled, stage 4 is unreachable, and the one CTA is a Link to /library that unmounts CreateWizard's useState picks — under copy that says 'Your picks here are kept while you go back a stage'. The shelf banner meanwhile promises 'the create wizard offers presets that lock on create'.",
    "evidence": [
      "app/_projects/wizard/CreateWizard.tsx:110-113",
      "app/_projects/wizard/CreateWizard.tsx:224",
      "app/_projects/wizard/CreateWizard.tsx:231-232",
      "app/_projects/wizard/stages.tsx:158-177",
      "app/library/presets.ts:49,66,83,100,117,134",
      "lib/themes.ts:133-135",
      "components/ui/deck/Deck.tsx:65-66,148",
      "app/projects/ProjectsView.tsx:105-107",
      "app/library/LibraryAtelier.tsx:11"
    ],
    "code_check": "node predicate over presets.ts: educational 6/6, trailer 0/6, free 0/6 fit; fresh account has no locked theme (env.md style-stage precondition); commissioning in /library requires /api/imaging/generate proofs before lock.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Fresh uat/.profile, /projects/new → Any video → Free form → assert EmptyStyleDeck and disabled Next; follow the library link, return, assert discipline/template state is gone. Env: NEXT_PUBLIC_DEV_AUTH=1, no themes in IndexedDB."
  },
  {
    "id": "AM-L1-2",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "inconsistency",
    "severity": "major",
    "impact": { "frequency": 3, "reachability": 5, "trust_erosion": 4 },
    "dimension": "consistency",
    "title": "The expert quick-create dialog dead-ends on the same wall with no route, and disagrees with the wizard about presets",
    "expected": "Both create faces offer the same set of styles for a discipline, or the dialog says plainly that the wizard is the path for a first project and links to it.",
    "got": "ProjectDialog never offers presets (even for educational) and requires a themeId to enable Create & open; for 'Any video' it prints 'No locked style fits any video yet. Lock one in the library, or one from a brief' with no link, while the shelf banner and the wizard both name presets as the answer. Same catalogues, two different sets of options.",
    "evidence": [
      "app/_projects/ProjectDialog.tsx:99-104",
      "app/_projects/ProjectDialog.tsx:111",
      "app/_projects/ProjectDialog.tsx:264-291",
      "app/_projects/wizard/CreateWizard.tsx:107-113",
      "app/projects/ProjectsView.tsx:87-100,103-116"
    ],
    "code_check": "valid = title && (project || themeId) at ProjectDialog.tsx:111; fittingThemes derives from lockedThemes only (no PRESETS import in the file).",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Open 'quick create — the expert form' on a fresh profile, pick Any video, assert Create & open disabled and no preset pills; compare with the wizard's educational style stage (6 presets)."
  },
  {
    "id": "AM-L1-3",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "vocabulary",
    "severity": "minor",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 2 },
    "dimension": "legibility",
    "title": "The trailer discipline card calls the product 'another artifact', and the free card answers a 'discipline' question with 'your own discipline'",
    "expected": "Discipline cards in the buyer's words: 'a promo that makes a promise the product pays', 'anything else — no template, the studio only keeps time'.",
    "got": "DISCIPLINE_NOTE.trailer = 'a promotional cut that opens a debt another artifact pays' is the card body on the stage headed 'What kind of video is this?'; DISCIPLINE_NOTE.free reuses the word 'discipline' inside the answer to the discipline question. Same strings reach the dialog's Segmented notes.",
    "evidence": [
      "lib/projects.ts:133-137",
      "app/_projects/wizard/stages.tsx:55-72",
      "app/_projects/ProjectDialog.tsx:229-234"
    ],
    "code_check": "grep 'artifact' across app/_projects, lib/projects.ts, beats, script/trailer/*.tsx: only lib/projects.ts:135 reaches a surface.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Read-aloud with a non-technical tester: does 'artifact' on the trailer card read as 'the product'? Env: any."
  },
  {
    "id": "AM-L1-4",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "vocabulary",
    "severity": "minor",
    "impact": { "frequency": 3, "reachability": 4, "trust_erosion": 2 },
    "dimension": "legibility",
    "title": "The research-mode chooser is answerable by elimination, not from its words ('notebook', 'scope', 'spine')",
    "expected": "Two options a junior can pick between from the sentence alone: 'Look things up first — get facts to build the script on' vs 'Choose the beats — pick one moment per part of the video'.",
    "got": "'facts to involve — A topic goes in, a notebook comes out, and you scope what the script may use.' / 'beats to choose — Candidate beats per part of a spine; you pick one each, and Script opens on the spine.' Four studio nouns, none defined on the surface. The reversibility sentence is good and should stay.",
    "evidence": [
      "app/_phases/research/beats/ModeChooser.tsx:18-29",
      "app/_phases/research/beats/ModeChooser.tsx:35-40"
    ],
    "code_check": "Strings read verbatim; no glossary/tooltip on the surface (no title attributes on the option buttons).",
    "verdict": "uncertain",
    "resolution": "open",
    "l2_priority": "Junior read-aloud: hand the chooser to a tester with the brief 'compose beats for a 45s launch spot', record which they pick and why. Env: free project exists (needs AM-L1-1 fixed or a seeded free project)."
  },
  {
    "id": "AM-L1-5",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "trust",
    "severity": "major",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 5 },
    "dimension": "trust",
    "title": "Script's trailer half shows Glass Harbor beats, cue and withholding budget under the project's own title with no stand-in label anywhere on the step",
    "expected": "The 'composed from' block repeats the board's disclosure ('fixture · n=0 · borrowed Glass Harbor material, whatever this project is about') and the withholding budget names itself as a sample campaign, not campaign-glass-harbor for her launch.",
    "got": "TrailerScript prints '<her title> · long-cut', 'cue: Low Tide — candidate cue', and WithholdingPanel prints 'withholding budget · campaign-glass-harbor' with five heist assets. grep for fixture/Glass Harbor/stand-in in script/trailer/*.tsx returns nothing. The board labelled the material; the step that looks most like a deliverable does not.",
    "evidence": [
      "app/_phases/script/trailer/TrailerScript.tsx:82-101",
      "app/_phases/script/trailer/WithholdingPanel.tsx:31-35",
      "app/_phases/script/trailer/useTrailerCut.ts:63-71",
      "app/_studio/trailerFixtures.ts:50-86",
      "app/_phases/research/beats/BeatVariantBoard.tsx:44-47"
    ],
    "code_check": "grep -rn -i 'fixture|glass harbor|stand-in|n=0' app/_phases/script/trailer/*.tsx → 0 matches; composeCut takes title from the project and cue/budget from GLASS_HARBOR_* constants.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": false,
    "scope_note": "The CONTENT is an accepted gap; the missing disclosure on this surface is not (accepted-gaps.md: 'on the condition that every surface says so').",
    "l2_priority": "Compose a spine on a free project, open Script, screenshot the header + withholding panel; assert no text on the step says the material is borrowed. Env: free project with a composed spine."
  },
  {
    "id": "AM-L1-6",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "fixture",
    "severity": "moderate",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 3 },
    "dimension": "senior-bar",
    "title": "The composed cut carries zero promises, so the ledger — honest as it is — never lets her check the one thing her senior bar asks for",
    "expected": "At least one fixture variant declares a promise (with or without a payer) so the ledger's 'incomplete' state and the structure panel's promise rows are exercised, and the composed cut shows a promise she can grade.",
    "got": "No slot variant in GLASS_HARBOR_SLOTS declares `promises`; the ledger opens on 'no promise declared on any beat — the ledger is empty, which is not the same as the cut promising nothing' and the promise rule emits only its 'extraction unmeasured' row. She can add one by hand; the placeholder 'the moment in the work that pays this' is in her language.",
    "evidence": [
      "app/_studio/trailerFixtures.ts:114-378",
      "app/_phases/script/trailer/PromiseLedger.tsx:27-28,45-48",
      "app/_phases/script/trailer/structure.ts:966-1000"
    ],
    "code_check": "grep -c 'promises:' app/_studio/trailerFixtures.ts → 0.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "scope_note": "Fixtures may grow richer, not happier — adding a promise with no payer would make the ledger's amber 'incomplete' reachable.",
    "l2_priority": "After compose, assert promise-ledger shows '0 promised'; add a promise, leave payer blank, assert 'incomplete' and a promise violation row in the advisory group."
  },
  {
    "id": "AM-L1-7",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "broken-flow",
    "severity": "major",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 4 },
    "dimension": "hand-off",
    "title": "Composing a spine and editing the cut never move the shelf: the row stays 'draft', Research and Script cells stay 'not started', Updated stays at creation",
    "expected": "Confirming a spine reports Research as working/done and seeding a cut reports Script as working, so the Monday shelf shows where the project stands and sorts it to the top.",
    "got": "reportPhase has exactly one caller (Frames). useBeatPicks.confirm writes the research record but not progress; useTrailerCut saves the cut but not progress; parkAt deliberately leaves updatedAt. The matrix therefore draws hollow cells, a grey 'draft' dot and the creation time for a project with a composed, edited cut. The Stepper badges inside the studio read the same progress and stay grey.",
    "evidence": [
      "app/_phases/frames/useFrames.ts:724",
      "app/_phases/research/beats/useBeatPicks.ts:62-75",
      "app/_phases/script/trailer/useTrailerCut.ts:83-86",
      "lib/projects.ts:516-520,533-542",
      "app/_projects/ProjectsMatrix.tsx:138-139,150-156,163-165",
      "app/studio/[projectId]/Stepper.tsx:42,61-66"
    ],
    "code_check": "grep -rn reportPhase app lib (excluding lib/projects.ts) → only frames/useFrames.ts. H4 confirmed.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Compose + edit a cut, return to /projects, assert cell-<id>-research and cell-<id>-script carry title '… not started' and the row dot title is 'draft'. Env: free project with a composed spine."
  },
  {
    "id": "AM-L1-8",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "inconsistency",
    "severity": "major",
    "impact": { "frequency": 4, "reachability": 4, "trust_erosion": 5 },
    "dimension": "trust",
    "title": "Reopen → change a pick → compose again leaves Script on the old cut, and the board's copy says the opposite",
    "expected": "Either re-composing replaces (or offers to replace) the cut in Script, or the board says 'Script keeps the cut you edited; re-composing does not overwrite it' before she reopens.",
    "got": "useTrailerCut hydrates from the saved `script-trailer` cut when one exists and never re-reads picks; reopen() only clears `confirmed`; nothing invalidates the step. cut.ts documents this as the design ('once composed, the cut is the creator's and the board's picks are its history'), but BeatVariantBoard says 'Reopen to change a pick; it must be composed again' and the ModeSwitch lock says Script reads the spine — both imply the re-compose lands. The review round her job is made of silently does nothing.",
    "evidence": [
      "app/_phases/script/trailer/useTrailerCut.ts:51-57",
      "app/_phases/research/beats/useBeatPicks.ts:77-81",
      "app/_phases/script/trailer/cut.ts:7-9",
      "app/_phases/research/beats/BeatVariantBoard.tsx:72",
      "app/_phases/research/ResearchStep.tsx:128-133"
    ],
    "code_check": "grep -rn 'script-trailer' app lib → one writer (useTrailerCut.ts:85), readers in frames only; no delete/reset path.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Compose with climax-a, open Script (note 'the floor goes'), back to Research, reopen, pick climax-b, compose, open Script — assert the climax section still reads 'the floor goes'. Env: free project."
  },
  {
    "id": "AM-L1-9",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "grounding",
    "severity": "moderate",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 3 },
    "dimension": "grounding",
    "title": "A 45-second free project composes as a 'long-cut' with beats to 1:50, the ladder rule passes it, and no surface says the runtime was never read",
    "expected": "The board's disclosure names the runtime among what the fixture ignores, and the composed-from line either derives the rung from targetS or says 'rung: long-cut (fixture; your 45 s was not read)'.",
    "got": "composeCut hard-codes rung 'long-cut' and lane 'wide-release'; targetS is read nowhere under research/beats or script/trailer; checkLadder passes 'A long cut, and no part is declared dropped'; TrailerScript prints '<title> · long-cut'. The board says 'whatever the project's logline' — the runtime is not in the sentence.",
    "evidence": [
      "app/_phases/script/trailer/cut.ts:57-68",
      "app/_phases/script/trailer/structure.ts:1027-1046",
      "app/_phases/script/trailer/TrailerScript.tsx:89-90",
      "app/_phases/research/beats/BeatVariantBoard.tsx:44-47",
      "app/_studio/trailerFixtures.ts (at: 0:00 … 1:50)"
    ],
    "code_check": "grep -rn 'targetS|runtime' app/_phases/research/beats app/_phases/script/trailer → comments only; fixture timecodes 0:00,0:12,0:30,0:45,1:00,1:16,1:22,1:50.",
    "verdict": "confirmed",
    "resolution": "open",
    "mock_bound": true,
    "scope_note": "The 0/4 grounding is the accepted ceiling; the finding is the positive claim ('long-cut', ladder pass) made over an unread runtime, and the disclosure line that omits it.",
    "l2_priority": "Create a 45 s free project, compose, assert trailer-composed-line contains 'long-cut' and structure-rule-ladder contains a pass. Env: free project."
  },
  {
    "id": "AM-L1-10",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 4, "trust_erosion": 0 },
    "dimension": "honesty",
    "title": "The free path never over-claims: 'accepted' not 'measured', 'borrows the trailer spine', 'fixture · n=0', a reversible mode switch, and a structure check that refuses to say 'works'",
    "expected": "—",
    "got": "Template chip '15–600s accepted' and runtime hint 'Nothing was measured for a free-form video'; board header names the borrowing and the fixture before any pick; ModeSwitch states nothing is discarded; StructurePanel header is 'malformed: yes/no/unmeasured' with the standing efficacy row 'does this cut work — unmeasured' on every report. This is exactly the instrument a senior brand lead would accept running a review on.",
    "evidence": [
      "app/_projects/wizard/stages.tsx:82-87,237-239",
      "app/_phases/research/beats/BeatVariantBoard.tsx:37-47",
      "app/_phases/research/beats/ModeChooser.tsx:74-100",
      "app/_phases/script/trailer/StructurePanel.tsx:40-45,81-96",
      "app/_phases/script/trailer/structure.ts:1243-1251,1289-1294"
    ],
    "code_check": "efficacyRow() is unconditionally appended at structure.ts:1267 and counts in `unmeasured`, so enforced can never read 100.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Assert structure-malformed text is one of yes/no/unmeasured and structure-rule-efficacy shows 'unmeasured' on a freshly composed cut."
  },
  {
    "id": "AM-L1-11",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "strength",
    "severity": "none",
    "impact": { "frequency": 5, "reachability": 5, "trust_erosion": 0 },
    "dimension": "persistence",
    "title": "Return visit holds: mode, picks, the research flag, the cut and the parked step are all per-project records, and the studio reopens on her title at her step",
    "expected": "—",
    "got": "research-beats (mode/picks/confirmed), research (researched), script-trailer (cut/budget) are saved after hydration with latest-wins tickets; parkAt bookmarks the rail click; StudioView opens on p.phase or ?step=. Delete names what it takes ('N saved steps — Research, Script'). The wizard keeps picks on a failed write and says 'nothing is kept' on its exit link.",
    "evidence": [
      "app/_phases/research/beats/useBeatPicks.ts:40-49",
      "app/_phases/script/trailer/useTrailerCut.ts:48-86",
      "app/studio/[projectId]/StudioView.tsx:104-110,153-176",
      "app/_projects/ProjectDialog.tsx:409-422",
      "app/_projects/wizard/CreateWizard.tsx:188-197,291-298"
    ],
    "code_check": "All three step writers are gated on `hydrated` and keyed by projectId; no cross-project key.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Compose, reload /studio/<id>, assert studio-headline is her title and trailer-script is present with the same picks."
  },
  {
    "id": "AM-L1-12",
    "journey": "compose-from-scratch",
    "character": "amara",
    "cert_level": "L1",
    "type": "friction",
    "severity": "minor",
    "impact": { "frequency": 4, "reachability": 5, "trust_erosion": 1 },
    "dimension": "flow",
    "title": "'Any video' is followed by a one-card template stage asking 'Which craft format inside it?'",
    "expected": "A single-template discipline auto-fills its template and the deck skips or collapses the stage ('Free form — 15–600s accepted — set the clock at the last stage').",
    "got": "templatesFor('free') has one entry; the stage still renders the headline 'Which craft format inside it?' under a discipline whose card just said 'no craft template', and Next stays disabled until the one card is clicked.",
    "evidence": [
      "lib/projects.ts:227-233,253-255",
      "app/_projects/wizard/CreateWizard.tsx:208-218",
      "app/_projects/wizard/stages.tsx:75-95"
    ],
    "code_check": "TEMPLATE_FAMILY maps exactly one id to 'free'.",
    "verdict": "confirmed",
    "resolution": "open",
    "l2_priority": "Count clicks from /projects/new to the name stage for Any video (expect 3 picks for a 2-decision path)."
  }
]
```

---

## Verdict

**L1-fail** — criterion 1 is a confirmed blocker (the free project cannot be created on a fresh account without leaving the wizard, and leaving it loses the picks), and criterion 5 fails (the shelf never reflects a composed project). Criteria 3 and the "never says works" half of the senior bar pass cleanly; criterion 2 is conditional pending a junior read-aloud; criterion 4 passes literally and fails the senior bar because the fixture carries no promise.

grounding: beat-board 0/4

time-saved-if-it-all-worked: ~40 min to a reviewable beat list on day one (vs ~4 days of calendar time and a fee) · confidence: medium — the minutes are real (wizard ~3, mode ~1, eight picks ~15, compose + read the cut + add a promise and payer ~15), but the list she would review is a heist film's until a model run replaces the slots, so "reviewable" is one disclosure and one fixture away.

Hypotheses: H1 confirmed (free and trailer). H4 confirmed (only Frames reports). H6 confirmed (free+beats → TrailerScript; free+facts → explainer). H3 refined: the board labels the fixture before any pick; the first unlabelled meeting is Script's trailer half (AM-L1-5). H2 not on this path. H5 true in code but not raised for a free Character.

Phase that loses her: **Create.** She never reaches the studio on her own account, and the studio is the part that would have sold her.

---

## First-person review (L1, designed experience)

I came to make a 45-second launch spot and to see whether three people could run this without me standing behind them.

The first screen asked the right question in my words — educational, trailer, or "any video" — and I appreciated that it did not force "trailer" on a promo. Then it asked which craft format a no-craft video has, and I clicked the one card because there was nothing else to do. Then it told me no style fits "any video" and sent me to a library to commission one. That is the detour. I said I would not buy a tool whose first project needs one, and I meant the first project, not the fifth. The shelf had just promised me presets. The expert form was the same wall without the signpost. Adopt? Not as it stands — and my junior would have messaged me at this exact screen.

If someone had created the project for me: the studio opens on my title, tells me it is a prototype on mocked data, and the research step asks a question I could answer by guessing and my junior probably could not. The beat board is the best thing here. It says, before I touch anything, that it borrowed a trailer's spine and that the beats are a hand-written stand-in for a model run. Eight columns, two or three real choices each, a reason and a risk on every tile, compose disabled until every part has a pick. That is a beat sheet I would put in front of a review — if it were about my product.

Script is where I would lose trust. My title sits over a heist film's beats, a cue called "Low Tide", and a "withholding budget" for a campaign that is not mine, and nothing on that page says any of it is borrowed. The promise ledger is empty and says so honestly, but the promise is the whole point of a launch spot and the composed cut carries none; I would have to type it in. The structure check is the part a senior would respect: it says "malformed: no" and then, in the next line, that this says nothing about whether the cut works. Good. Then it calls my 45-second spot a "long cut" and passes it.

Worth the wait? The path from a blank page to eight chosen beats is maybe forty minutes against four days and an agency fee, and the software never once pretended to know more than it does. That is rare and I would tell a peer that part. I would also tell them that when my junior reopens the spine to swap the ending and composes again, Script keeps the old cut and nobody says so, and that on Monday the shelf will show our project as a draft with nothing started. Hand-off is my job. Right now the tool does the work and then hides it.

What is missing for my job: a way to create the project at all; the same "this is borrowed" sentence on Script that the board already has; a promise on the composed cut; and a shelf row that moves when the work does. Fix the first and I will run a second project. Fix all four and I will ask about seats.

## First-person review (L2, live experience)

L2 verdict: **L2-conditional** — my first project needed no detour and Monday's shelf tells the truth, but the beat list my junior would review is still a harbour heist.

I finished. Live, the style stage dealt six looks chipped "written for educational video · fits any" — the journal reads `presets=6 borrowed=true` — and I never saw a library link. The studio opened on "Glow Serum launch — 45s". The detour is gone, and it went while I was walking.

What changed between design and walk: Script now carries the sentence the board already had (`the withholding budget is labelled a stand-in on Script`) and names my 45 s against the fixture's 1:50. I typed a promise, left the payer blank, and the ledger read **1 PROMISED · 1 INCOMPLETE** with a violation row naming the beat. That is the review conversation, as a form. And `/projects` shows `Research — locked · open here`, `Script — in progress`; the row sorted to the top.

Still missing for my job: the beats are Glass Harbor, so there is nothing for three people to review yet; the mode question still says "notebook" and "spine"; the expert form still offers no presets to a truly fresh account. Would I tell a peer? "Create a project today — it is honest at every step. Do not schedule the review until the board reads your logline."
