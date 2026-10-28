# Steer by ear - /audio compose

For a person with taste and no music words: three ways into one seed, every instrument heard
before it is chosen, the piece's shape painted and heard, and the brief read before anything
spends. Built 2026-10-28 (hackathon pack "Steer by ear", fusing B5, A1, B2, B4, B3, D4).

## The journey and where each part lives

| Step | What happens | Pure (`packages/ui/src/components/audio/`) | Server / engine |
| --- | --- | --- | --- |
| Say it | A sentence compiles to a seed; each term keeps the words that produced it; words nothing matched are shown struck through | `lexicon.ts`, `lexicon.rows.ts` (176 written rows, plus one per atlas instrument), `SayIt.tsx` | - |
| By ear | Seven pairs, each differing in one dimension of the sound; answers compile to a seed with reasons | `duel.ts`, `DuelCard.tsx`; keys in `keymap/bindings.ts` (`audio.duel`) | `/audio/sketch` |
| From a track | A track's tempo, key and energy every four bars become the seed's tempo, key and shape | `shape.ts` `levelsOfContour`, `TrackDrop.tsx` | `POST /audio/reference`, `lib/audio/reference.ts` |
| Hear it | Every instrument the libraries file plays one fixed four-bar phrase at the seed's tempo and key, -20 LUFS | `atlas.ts` (25 instruments), `EarButton.tsx`, `useEar.ts` | `/audio/audition`, `lib/audio/atlas.ts`, `pipeline/audio/audition.py`, `drums.py` |
| Swap it | Same-register candidates first, then neighbours, plain words first; blind, or in the mix with the rest of the seed; a word with no samples here is offered the sounds near it | `atlas.ts` `swapsFor`, `nearFor`, `EarStrip.tsx` | `/audio/audition`, `/audio/sketch` |
| Learn it | Every pick by ear joins a "learned" row with its plain words; a press adds the word to the sentence (the lexicon hears every atlas term) | `SayIt.tsx`, `lexicon.ts` | - |
| Shape it | Painted four-bar columns become named sections; Suno section tags (unverified) and an ElevenLabs plan (quoted, dry) | `shape.ts`, `ShapeStrip.tsx` | `lib/music/pricing.ts` `priceCall` |
| Hear the shape | The seed's instruments together across the shape, voices thickening with the level; a playhead; every door (Compose, the duel's Use, a track's Use) answers with this sound; each variation plays its own | `atlas.ts` `sketchHref`, `playableIds` | `/audio/sketch`, `pipeline/audio/sketch.py` |
| Send | The existing Suno receipt, DRY by default; section tags ride in the lyrics field | `recipe.ts` `sunoFieldsOf` | `app/(studio)/audio/_audio/actions.ts` |

Renders go through two warm `sidecar.py serve` workers (`lib/audio/renderWorker.ts`, about 0.6 s
for an uncached audition or sketch; one process per render when no worker can start).

The lane's shared state is in `app/(studio)/audio/_audio/`: `steer.tsx` (sentence, provenance,
strips, warming), `shapeState.tsx`, `duelState.tsx`, `trackState.tsx`; `AudioLane.tsx` owns the
one ear, so no two sounds overlap.

## Headless

- `@gt/ui` `steer.ts` `steerBrief()` is the compile as one value.
- MCP: `gt_read` op `steer` (`app/_server/mcp/tools/steer.ts`) - read-only, spends nothing.
- CLI: `npx tsx pipeline/steer.mts "<sentence>" [--shape arc|rise|bed|sting|two-peaks] [--length s] [--json] [--hear]`.

## Configuration

- `GRAVITONE_SAMPLE_ROOTS` - the sample library roots to scan (path-delimiter separated). The
  libraries are licensed to the machine: read in place, never copied, never committed. Unset, no
  instrument has a play mark.
- `GRAVITONE_AUDITION_DIR` - where renders and measured pitch maps are cached (default: OS temp).
- Python with `pipeline/requirements.txt` and ffmpeg (see `docs/audio-sidecar.md`, "audition and sketch").

## What is measured, and what is not

- Measured: all 25 instruments render at -20.0 LUFS (one kit -20.6), the same length, byte-identical
  on a second render; the composer's own sketch read back as a reference returns the shape it was
  painted with (tempo within 2.2 %).
- Not verified: whether Suno honours section tags on an instrumental (it would need a spend).
- Invented and labelled: the level thresholds of a reference's contour (`levelsOfContour`) and the
  arrangement rule that thickens voices with the level (`voicesAt`).

## Tests

`packages/ui/test/components/{lexicon,shape,duel}.test.ts` (with mutants in
`tests/mutants-unit/registry.ts`), `tests/next-server/audio-audition.test.ts` (the engine on
generated, numbered sine multisamples), `tests/next-server/mcp-steer.test.ts`.
