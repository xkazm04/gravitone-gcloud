---
name: scout
memory: none
category: Development
description: The nightly training loop - search the web and YouTube around knowledge/scout/watchlist.md for art styles, scenes and craft worth learning, bring them onto this box, replicate them as kernel jobs (extracted still styles, scene recipes with replica stills and at most two Hailuo clips, craft findings) inside a $15 night, and leave ONE Board packet pkt:scout:<night> for a few minutes of K/X in the morning. Successor of train-style and of dojo's hand-run corpus study. Wraps pipeline/scout.mts; it never keeps, rejects or commits anything on the Board. Invoke with /scout night [--dry] [--until HH:MM], /scout folder <dir> [extract args], /scout status [<night>].
argument-hint: "night [--dry] [--until HH:MM] | folder <dir> | status [<night>]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Scout - find it at night, decide it in the morning

One night is one bounded run: **sources** found on the web, **candidates** made from them, **one packet**
the operator triages. The CLI (`pipeline/scout.mts`) and the kernel do everything that spends or writes;
this skill does the two things only a reader can: choosing what is worth studying, and writing findings
in words. Operator doc: `docs/scout.md`. Design: spark `media-training-loop` (2026-10-22).

**The verdict is never yours.** Nothing this skill does admits a style, a scene or a finding into the
Library or `knowledge/`: only the operator's commit of `pkt:scout:<night>` does (hitl-approval,
truncated-verdict-space). You pre-filter; you never keep.

## The money and the rights (read before every night)

- **$15 per night, at most two 5-second Hailuo clips** - the operator's standing grant for this loop
  (2026-10-22). The night's ceiling is enforced by the CLI per launch; never raise `--ceiling`, `--clips`,
  `IMAGING_BUDGET_USD_PER_WINDOW` or `VIDEO_BUDGET_USD_PER_WINDOW` on your own. A refused launch is the
  ceiling working: close the night, do not retry around it.
- **Sources are reference-only.** Public, official or promotional material only: an artist's own page or
  channel, a studio's trailer, a museum, an editorial site. Never anything behind a login or a paywall,
  never a re-upload or a pirate mirror, never a private person's account. Held on this box for study;
  only frames are kept; nothing is redistributed.
- **A source seeds words, never pixels.** It is never passed to a generator as a reference; a clip
  animates our own replica still (the scene producer refuses anything else).
- **Craft, not content.** A recipe, a finding or a watch line never names a person, a title or a franchise.

## /scout night

The scheduled entry (Task Scheduler, `pipeline/scout-schedule.ps1`) runs `claude -p "/scout night"` at
the operator's hour; the operator may also type it after a workday. Either way:

### 0. Preflight - no spend

1. `npx tsx pipeline/scout.mts doctor` - with `--dry` when the night will be dry (the vendor keys and
   the dry pin are then notes, not failures). Exit 1 -> write the failing lines into the night summary
   (step 6) and stop. Never install, configure or work around a missing binary or key.
2. **Commit yesterday's kept knowledge.** The Board's apply wrote kept findings into
   `knowledge/templates/**/PATTERNS.md` and kept watch lines into `knowledge/scout/watchlist.md`.
   `git status --short knowledge/` - stage ONLY files whose diff consists of lines carrying a
   `<!-- scout:` marker (read each `git diff` first; anything else in that file is someone's WIP and the
   file is skipped), then `git commit -m "knowledge(scout): <n> findings kept from <nights>"` on the
   current branch. **Never push.** Nothing to commit is fine.
3. `npx tsx pipeline/scout.mts status --json` - an earlier night still `open` (a killed run) is closed
   first: `close <id> --stop failure`. Untriaged packets do not stop tonight; they queue.

### 1. Open

`npx tsx pipeline/scout.mts open --live --until 06:30 --json` (a typed `/scout night --dry` drops
`--live`; `--until` from the argument when given). Note the night id. Then read, in this order:
`foundry-out/scout/<night>/taste.md` (what the operator kept and threw, with reasons - **a channel or a
kind of look rejected twice is not searched again**), `knowledge/scout/watchlist.md`, and what the
Library already holds (`pipeline/foundry/styles.json`: names and recipes - a look already there is not a
find).

### 2. Discover - your judgement, the night's quality

Aim for a packet of **about 20 rows**: ~8 style sources (grouped below into 3-5 extract runs), 3-4 scenes,
2-4 findings, 0-2 watch lines. Search around each watchlist line first, then outward for what the Library
lacks (a medium, a palette family, a lighting idiom, a cutting rhythm none of its styles covers).

- Pictures: an image URL or a page whose pictures carry one coherent look. Video: a trailer, a short, a
  music video whose SHOTS teach something - composition, light, a camera move, a cut rhythm.
- Read a video's captions for findings when it has them: `yt-dlp --skip-download --write-auto-subs
  --sub-format vtt -o <scratch>/<id> <url>` - quote verbatim, delete the file after.
- One line of `why` per source, in your words: what it would teach that the Library does not have.

Write the sources as JSON (`[{url, kind, title, channel, why, found, watch}]`) to a scratch file and
`npx tsx pipeline/scout.mts add-source <night> --json <file>`. A URL seen in an earlier night is skipped
by the CLI; take that as information, not an error.

### 3. Ingest

`npx tsx pipeline/scout.mts ingest <night>` - pictures fetched, videos cut to gated keyframes, the
download deleted. A failed source keeps its tool sentence; do not retry it by another route.

### 4. Make the candidates

Check `status <night> --json` for the remaining money before each launch.

1. **Styles.** Group ingested pictures/keyframes that share ONE look (technique, palette roles, finish -
   not subject) into 1-4 sources per run: `style <night> --sources s-01,s-04 --slug <look-words>`.
   One extract run per group. The engine reads, replicates from words and transfers; its scores are a
   pre-filter, not a verdict - you do not re-judge them by eye.
2. **Scenes.** Ingest keeps ONE frame per cut, so neighbouring keyframes are different shots (in a
   video essay, different films). Look at the keyframes first (`Read` them, or a contact sheet:
   `"$FFMPEG" -v error -i sources/s-NN/k-%03d.jpg -vf "scale=320:-1,tile=6x4" -frames:v 1 <scratch>/sheet.jpg`),
   then for the 3-4 most instructive shots: `scene <night> --source s-NN --frames k-012.jpg` - one frame
   per scene. Skip frames that are a talking head, a screenshot, or carry burnt-in text (an essay's
   captions, a counter). The first two scenes in priority order get a clip while the cap allows; put the
   shot whose MOTION teaches most first.
3. **Findings.** From captions you read and the cut timestamps ingest recorded: a claim (<= 140 chars, a
   rule a director could follow) + the verbatim quote or the measurement + the knowledge step it
   belongs to (`knowledge/templates/<template>/steps/<step>/`). `finding <night> --json <file>`.
   A finding the existing PATTERNS.md already states is not a finding.
4. **Watch lines.** A channel or site that produced two or more good sources tonight and is not on the
   watchlist: `watch <night> --entry "<channel - url>" --why "<what it teaches>"`.

### 5. Stop

Stop launching at the first of: the deadline, a refused launch for money, ~20 rendered rows, three
consecutive failed launches (`--stop failure`), or nothing left worth studying (`sources-exhausted`).
`npx tsx pipeline/scout.mts close <night> [--stop <reason>]` - it prints the packet id and the counts.

### 6. The night summary - for the operator, not about yourself

Append to `.vault/Scout/nights.md` (create it): the date, the night id, the packet link
`/board/pkt:scout:<night>`, counts by kind, settled and held USD, the stop reason, and at most three
lines of what the night could not do (a source that refused, a doctor line). No narration of your process.

## /scout folder <dir> [extract args]

The train-style path, kept: a folder of pictures on disk through the extract engine.
`npx tsx pipeline/scout.mts folder "<dir>" --slug <slug> --dry` first (prints the receipt), then without
`--dry` once the operator has seen the number in this session. The run is decided on its own packet,
`/board/pkt:extract:<run-id>`. Over ten minutes: launch it with `Start-Process` and poll the log with
Monitor, never a Bash background task. `--resume <run-id>` continues a stopped run; an `interrupted`
job holds `cloud.google` until the lane is acknowledged on Runs.

## /scout status [<night>]

`npx tsx pipeline/scout.mts status [<night>] --json` - render it as a short table: night, state, stop,
rendered / failed / pending, USD, and the packet link for every closed, untriaged night.

## What NOT to do

- Do not keep, reject or commit on the Board, and do not run `pipeline/decide.mts` for a scout packet.
- Do not pass a source picture or frame to any generator, and do not "improve" a replica by attaching one.
- Do not raise a ceiling, a cap or a budget window; do not switch a dry night to live.
- Do not edit `night.json`, `styles.json` or a PATTERNS.md by hand.
- Do not push. Do not stage anything outside `knowledge/` in step 0.
- Do not re-read a source the doctor or the ingest refused through another tool.

## Lessons

Append to `.claude/skills/scout/LESSONS.md` only what would change the next night (a search that
always returns re-uploads, a source type the gates mangle, a prompt the scene door keeps refusing) and
the file it argues a change in. A night that went as written writes nothing there.
