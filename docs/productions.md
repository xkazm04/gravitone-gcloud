# Productions

A kept concept started as a Production moves through hero shots, a rough cut, casting, audio and a final cut. S0 of
spark concept-casting-stages fixes the contract and shows three layouts on scripted data. The design note is
`.vault/Spark/ideas/concept-casting-stages.md`.

## Stages

`accepted` -> `hero` -> `rough` -> `proven` -> `casting` -> `audio` -> `cutting` -> `done`, or `dropped` from any live
stage. The legal moves are data: `productionMachine` in `packages/domain/src/production.machine.ts`.

| From | May move to |
| --- | --- |
| `accepted` | `hero`, `dropped` |
| `hero` | `rough`, `proven`, `dropped` |
| `rough` | `hero`, `proven`, `dropped` |
| `proven` | `casting`, `dropped` |
| `casting` | `audio`, `dropped` |
| `audio` | `cutting`, `casting`, `dropped` |
| `cutting` | `done`, `audio`, `casting`, `dropped` |
| `done`, `dropped` | terminal |

Rules the table carries: a take can be proven from hero shots or from a rough cut; casting comes only after proven; a
re-cast goes back to `casting` and marks later takes stale. Only the operator may enter `proven`
(`OPERATOR_ONLY_STAGES`), and `refusalOfMove` is the sentence a refused move answers with.

## Contract

`packages/domain/src/production.ts` is the zod door; `production.machine.ts` holds the zod-free table, id shapes, closed
sets and event names, so a screen can import them. Records: `Production`, `ProductionSource`, `ProductionTake`,
`ProductionRole`, `CastRound`, `CharacterRecord`, `ProductionLesson`. Absent values: omit the key.

- Production id `prdn:<slug>`. The design said `prod:`; that token is already the router's imaging posture.
- Character id `chr:<ulid>`. Name is no longer identity.
- One `CastRound` is one role: 5 character candidates (`reused` with where it was used, or `new`), 5 voice candidates, one
  pick each, `creditsUsed` and where it was read. A voice's pick stays locked until its preview was heard
  (`voicePickRefusal`). A two-role concept is two rounds.
- Lessons carry `dimension` (`beats`, `art-style`, `technique`) and `state` (`proposed`, `accepted`).
- Event types are the `PRODUCTION_EVENTS` constants. Lessons are `production.lesson-proposed` and
  `production.lesson-accepted`, because `lesson.confirmed` belongs to `lib/sound/lessons.ts`.

Seams for later sessions (stubs with final signatures, every body refuses): `lib/producers/production.ts` (S1),
`lib/library/characters.ts` (S2), `lib/music/voiceDesign.ts` (S3).

## What is scripted so far

`/scout/productions` (a tab of the Scout head) shows three layouts behind one switch: stage board, concept page, and
graph first. All three read the same slate from `_port/fixture.ts`, which goes through the real door. The fixture control
reaches loading, empty, failed and refused. Acts on the page live in memory (`_productions/script.ts`) and reset on reload.

- No backend, no vendor call, no GPU. Pictures are real renders downscaled into `public/deck-art/productions/`.
- No fixture audio exists in the repo: each voice preview is a marked silent stub that only records "heard".
- The Board gate is not wired: "open on Board" is disabled and says so. `serverProductions` has only the fixture side.
