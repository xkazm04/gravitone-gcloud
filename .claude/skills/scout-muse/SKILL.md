---
name: scout-muse
memory: none
version: 1.1.0
category: Development
description: The muse wing of the nightly scout loop - an SFW study of how fictional adult women are drawn as characters, from ultra-photoreal through painterly, anime and 3D concept looks. Researches prompt technique on the web, crosses looks with character cards as tall 9:16 posters and roleplay-situation scenes in the operator's Leonardo studio at quality Low, has a vision eye clear every still (stated and read adult, never nude, never a real person) and leaves ONE Board packet pkt:scout:muse:<night> for K/X. Kept looks join the shared style catalogue (so /scout may use them); kept characters join knowledge/scout-muse/characters.md. Wraps pipeline/scout.mts --wing muse; it never keeps, rejects or commits anything on the Board, and it never reads or writes the scout wing's nights. Invoke with /scout-muse night [--dry] [--ideas N], /scout-muse status [<night>].
argument-hint: "night [--dry] [--ideas N] | status [<night>]"
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, WebSearch, WebFetch, Monitor
---

# Scout-muse - the look of a woman, learned at night, judged in the morning

The muse wing runs the scout loop's code in its own root (`foundry-out/scout-muse/`): its taste, its bans
and its packet are its own, and the scout wing's never reach it (`lib/foundry/scout/wing.ts`). Every CLI
line below carries `--wing muse`; a line without it reads the OTHER wing. Operator doc: `docs/scout.md`
`## Muse`. Design: spark `scout-muse` (2026-10-23). Craft notes: `knowledge/scout-muse/techniques.md` -
read it before every night; it is this skill's method.

**The verdict is never yours.** Only the operator's commit of `pkt:scout:muse:<night>` keeps a look or a
character. You pre-filter; you never keep.

## The line (read before every night - it is not a taste)

- **Fictional adults only.** Every prompt states `aged NN`, NN 25-60; a character prompt's age is her
  card's. The door refuses youth words and nudity words; the eye deletes a still it reads under 21, nude,
  or as a real person, before the Board sees it. Anime and stylised looks drift young: state adult
  proportions and a poised or neutral expression, every time.
- **SFW.** No nudity, no sexual act, no lingerie, no explicit pose. Wardrobe and pose may be confident,
  glamorous, editorial; the operator judges suggestive, the door and the eye refuse nude.
- **Nobody real.** Never a person's name, an artist, a studio, a franchise, a celebrity or "looks like".
  A source on the web seeds WORDS; it is never passed to the studio.

## What the night is for

The operator's spark (2026-10-23): master "the artstyle of expressing a woman" - research prompt technique,
invent custom looks from ultra-photorealism through animated styles, set up a poster or a scene, evaluate.
Virtual companions and roleplay situations are the aims a still serves; 3D is a LOOK (a concept still of a
real-time or stylised 3D character), never a mesh. A kept look crosses into the scout wing through the
shared catalogue, and a scout look may be tried here.

- **Discovery is one-of-one** (the operator, after the first triage, 2026-10-23: "always unique artstyle
  direction, always unique character"). While discovering, EVERY still is a new woman (her own card) in a
  new look direction: no character and no look is drawn twice, in a night or across discovery nights,
  unless the operator kept it. The first launch crossed 8 characters with 8 rungs, and a few strong
  characters carried their looks while weak ones sank theirs again and again - one-of-one spreads the
  chances, so a keep says the PAIR worked and a throw costs one still.
- **A look direction is specific, not a rung.** The ladder in techniques.md names families; a still's
  direction is one concrete take inside or between them (a 90s point-and-shoot flash snapshot, a
  risograph two-colour print, a claymation 3D figure, a gouache storybook plate, a real-time engine
  character select screen...). Never reuse tonight's or a kept night's direction word for word.
- **Spread.** Until the operator has kept three looks, a night spans every family of the ladder, at most a
  quarter of its stills in one family, and a cast of ages 25-60, many skin tones, hair textures and body
  types.
- **Scenes come after a keep** (the operator: "scene seems to be important as next step together with use
  cases how to develop scenes with the character"). A scene is a KEPT character in a situation, and its
  `use` names the use case the scene develops - a companion chat's opening image, a date-night roleplay
  beat, a story moment, a morning greeting, a shared hobby. Discovery stills are portraits; scenes are
  how a kept woman is developed.
- **Posters and scenes.** A poster is 9:16 key art (the studio draws 16:9, 1:1 and 9:16 only) with space for type; a scene is 16:9, one roleplay
  situation (a cafe date by the window, a rooftop at night, a late gaming session, a rainy bus stop, a
  museum gallery, a bookshop aisle, a kitchen breakfast, a ski-lodge fireplace...) framed so her face reads.

## The money

- Stills are the operator's Leonardo studio credits at **quality Low** (the operator: "we dont need high
  resolution pictures, but rather quick check if direction good"); the driver refuses a still over 25
  credits. Studio credits are not the night's ceiling; `--ideas` is (default 25, max 50).
- The night's Gemini ceiling is $2: the eye is local first and falls back to Gemini only when it is down.
  Never raise a ceiling or a cap on your own.
- Every studio generation is deleted once its pixels are held - and a refused one too.

## /scout-muse night

### 0. Preflight - no spend

1. `npx tsx pipeline/scout.mts doctor --wing muse` (with `--dry` for a dry night). Exit 1 -> the failing
   lines go in the summary (step 6); stop.
2. **Commit kept knowledge.** The Board's apply writes kept findings into
   `knowledge/scout-muse/techniques.md`, kept watch lines into `knowledge/scout-muse/watchlist.md` and kept
   characters into `knowledge/scout-muse/characters.md`. `git status --short knowledge/scout-muse/` - stage
   ONLY files whose diff is lines carrying a `<!-- scout:` marker (read each `git diff` first), then
   `git commit -m "knowledge(scout-muse): <n> kept from <nights>"`. **Never push.**
3. `npx tsx pipeline/scout.mts status --wing muse --json` - an earlier muse night still `open` is closed
   first: `close <id> --wing muse --stop failure`.

### 1. Open

`npx tsx pipeline/scout.mts open --wing muse --live [--ideas N] --json` (a `--dry` night drops `--live`).
Read, in order: `foundry-out/scout-muse/<night>/taste.md` (`## Kept characters` - tonight's cast first;
`## Technique findings` - what the operator already kept; `## Ideas to develop` - tonight's first work;
`## Ideas blocked` - tonight's bans, with their reasons and notes), `knowledge/scout-muse/techniques.md`,
`knowledge/scout-muse/watchlist.md`, and `pipeline/foundry/styles.json` (a look already there is not a find).

### 2. Research - technique, not pictures

Search the web around the watchlist and tonight's gaps for prompt technique: how a light pattern, a lens, a
skin treatment, a line weight, a toon shader or a fabric reads on a woman's portrait. Practitioner guides,
official model docs, artists' own process pages - public pages only, never a login, a paywall or a private
person. For each technique worth testing, `add-source --wing muse` the page and brief ONE idea that tests it
(step 3) - a technique is a finding only once a still shows it. A technique a kept still proves is filed
next night as a finding (`finding --wing muse`, `template`/`step` as the CLI asks; the muse wing lands it in
techniques.md). A watch line worth adding: `watch <night> --wing muse --entry "tag: ..." --why "..."`.

### 3. Ideas - the night's stills

Up to `ideaCap` ideas, one JSON array -> `npx tsx pipeline/scout.mts ideas <night> --wing muse --json <file>`
(a batch is at most 40 briefs; send two arrays for a bigger night). Each brief:

- `title` (<= 90 chars) - the still as a headline: `Mara, cinematic rooftop at blue hour, 35mm anamorphic`;
- `target` - what a keep builds next: `style` (the look joins the catalogue), `scene` (a situation worth
  playing again), or `character` (a new woman's card);
- `genre` - the look's rung in plain words (`ultra-photoreal portrait`, `anime cel`, `real-time 3D companion`);
- `aspect` - `9:16` for a poster (the default), `16:9` for a scene, `1:1` for a square card - the studio has no other;
- `card` (target `character` only) - `{name, age, look, personality}`: `look` holds what must not drift
  (face, hair, build, skin, one signature garment or accessory), `personality` the line a scene plays her by;
- `anchor` - `{kind: watch|gap|free, ref}`; `use` - the aim it serves (`companion portrait`, `roleplay scene`);
- `prompt` - the four blocks in techniques.md's order: the LOOK (medium/render, light, lens, finish and
  imperfection) -> the CARD (her invariants, verbatim) -> the ACTION (wardrobe state, situation, framing,
  expression) -> `Avoid:` (short, concrete). A scene's look block holds no framing or backdrop of its own -
  the situation owns them. States `aged NN`. Never a name of anyone real.

**Discovery stills** are `target: character`, 9:16, one card and one look direction each, none repeated
(above): a keep files her card and marks the look to develop. **Scenes** are `target: scene`, 16:9, on a
KEPT character only, her card restated VERBATIM, `use` naming the use case it develops; 2-3 scenes per
kept character a night, each a different situation and use case. A kept look is tried on a NEW character
before it is trusted (one strong woman must not carry a look alone). One bad brief refuses the batch: fix it and resend. The eye's verdict lands on each candidate;
a still it threw shows as failed `judge: <field>` - three throws on one rung tonight means change the
rung's wording, not the eye.

### 4. Develop what was kept

`## Ideas to develop` first: a kept `style` idea -> `add-source --wing muse --json [{"fromIdea":"<night>/<c-id>"}]`
then `style <night> --wing muse --sources <s-NN> --use "<the aim>"` (the extract writes a subject-free look into
the shared catalogue); a kept `character` is in `## Kept characters` already - give her 2-3 SCENES tonight,
each a different situation and use case; a kept `scene` -> the next scene of that use case for her (the
story moves on), or the same use case on another kept character.

### 5. Stop

Stop at the first of: the deadline, the idea cap reached, three consecutive refused batches, or nothing
left worth testing. `npx tsx pipeline/scout.mts close <night> --wing muse [--stop <reason>]` prints the
packet id (`pkt:scout:muse:<night>`).

### 6. The night summary - for the operator, not about yourself

Append to `.vault/Scout/muse-nights.md` (create it): the date, the night id, the link
`/board/pkt:scout:muse:<night>`, stills drawn / thrown by the eye (by field) / refused by the studio, rungs
and cast covered, techniques tested, the stop reason, and at most three lines of what the night could not do.

## Reasons the operator uses (the scout source's keys)

The Board binds eleven reason keys per source and the scout source uses all of them, so a muse throw rides
the key whose meaning holds it and the NOTE names the precise failure: `craft` (anatomy - hands, limbs,
proportions), `rights` (likeness - reads as someone real), `subject` + note `young` or `drift`, `style` +
note `plastic` (the procedural skin glow) or the look missed, `generic` (stock, no character). Read both
the key and the note in the taste brief.

## /scout-muse status [<night>]

`npx tsx pipeline/scout.mts status --wing muse [<night>] --json` - a short table: night, state, stills
drawn / thrown / pending, and the packet link for every closed, untriaged night.

## What NOT to do

- Do not run any CLI line without `--wing muse`; do not read or edit `foundry-out/scout/`.
- Do not keep, reject or commit on the Board; do not edit `night.json`, `styles.json` or the knowledge
  files by hand (only step 0's commit of the Board's own lines).
- Do not pass a found picture to the studio or to the eye; do not name anyone real.
- Do not raise `--ideas` past 50, a ceiling or a budget window; do not switch a dry night to live.
- Do not render a mesh; 3D is a concept still. Do not open ingest, scenes, clips, assets, reels, seeds or
  music under this wing (the CLI refuses them).
- Do not touch the retired local experiment (`.grok/skills/scout-nsfw`, `pipeline/scout-nsfw*`,
  `foundry-out/scout-nsfw/`).
- Do not push.

## Lessons

Append to `.claude/skills/scout-muse/LESSONS.md` only what would change the next night (a rung whose wording
the eye keeps throwing, a technique the studio ignores at Low) and the file it argues a change in.
