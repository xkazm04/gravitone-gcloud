# app/playground/shared — the Sound lab's shared atoms

Owned by the triage work package (WP2). Arrange (WP3) and Hunt (WP4) import from
here; ask WP2 for a change rather than editing in place. Everything below speaks
`lib/sound/types.ts` (`SoundTake`, `SoundKind`, …) — none of it reads the
Library's old `Take`.

Import by file: `@/app/playground/shared/<file>`.

| file | exports | what for |
| --- | --- | --- |
| `ui.ts` | `CAPS`, `CARD`, `FIELD`, `BTN`, `BTN_CYAN`, `BTN_KEEP`, `BTN_REJECT`, `pill(on, tone)`, `VERDICT_TONE` | class lists in the Projects/Library idiom (glass, white/8 hairlines, cyan = selected, emerald/amber/rose = verdict). No colour literals. |
| `format.ts` (pure) | `dur(s)`, `lengthWord(kind, s)` (sfx `2.5s`, music `m:ss`), `ago(iso, now)`, `dimsFor(take)`, `meanScore(take)`, `readVerdict(take)` (adds `proven` = kept with mean ≥ 7), `DIM_LABEL` / `dimLabel(d)`, `defectWord(code)`, `DEFECT_ORDER[kind]`, `ORIGIN_WORD`, `PROVIDER_NAME`, `askedFigures(take)`, `tempoOff(asked, measured)` | readings of a take at rest. `dimsFor` drops `loop_seam` for an sfx take that is not a loop. |
| `transport.ts` | `transport` (singleton: `toggle(id, hint)`, `play`, `pause`, `seek(id, s)`, `nudge(id, ±s)`, `stop()`, `lengthOf(id)`, `probe(id)` — reads the file's length from metadata without playing), `usePlayState()`, `usePlayback(id)`, `useFileLength(id)` | ONE `<audio>` for the whole lab, playing `takeFileUrl(id)`. One take plays at a time across modules. A take with no file does not play. |
| `Wave.tsx` | `TakeWave({ take, height, bars, measuring, tone })`, `PlayButton({ take, size })`, `Wave` (raw), `GhostWave`, `resample(peaks, n)` | waveform from REAL `take.peaks` only; an unmeasured take draws the ghost silhouette (pulsing while `measuring`). Seek by press/drag/arrows. |
| `Rubric.tsx` | `RubricControl({ take, active, onActive, onRate, size })`, `ScoreMeter({ take })` | 1–10 per dimension of `RUBRIC[kind]`; `ScoreMeter` is the at-rest bars + mean (hollow stub for unscored, never 0). |
| `Chips.tsx` | `ProviderChip({ provider, engine? })` (dot from `../engines.ts#statusWord` when given a registry row), `OriginChip`, `VerdictChip`, `TechniqueChips`, `TermChips({ terms, kind })`, `DefectChips({ reasons })`, `DefectPicker({ kind, value, onChange, keyed })`, `DEFECT_KEYS` | what a take IS, one spelling. Techniques are violet mono chips (the axis lessons are learned along). |
| `measure.ts` | `useMeasureOnOpen(take, onStored)` → `{ measuring, error }`, `measureAndStore(take)`, `measureBytes(take)`, `needsMeasure(take)`, `measuredLength(id)` | first open of a take with a file and no peaks: fetch bytes, analyse with `app/library/audio/analysis.ts`, PATCH `peaks` + `measured` back. Deduplicated per id across modules. Tempo/key written for music only. |
| `price.tsx` | `useMusicPrice()` → `cost(seconds)`, `SpendButton({ cost, onClick, busy, disabled, wide })` | the coin + "Ns of audio · unpriced" line, from `lib/musicClient.ts#costLabel`. Use on every button that bills. |
| `shell.tsx` | `useSoundLab()` → `{ kind, refresh(), version, say(text, tone) }`, `FlashLine`, `ErrorLine`, `useFlash` | the shell's handle. **Call `refresh()` after anything that changes a tally** (a verdict, a stage move to/from finalized, a new hunt) so the tab tallies re-read. `say()` writes the flash line at the foot of the page. |

The shell (`app/playground/PlaygroundView.tsx`) mounts `app/playground/<module>/index.tsx`'s
default export as `<Module kind={kind} />` under a `SoundLabContext` provider, below a
`TabRail` (`?m=triage|arrange|hunt`) with a `music | sfx` switch (`?kind=`). A module
owns everything below the rail; it must not render its own page title or kind switch.

Round-3 files at `app/playground/` top level: `engines.ts` (the provider registry —
`ProviderChip` and hunt read it) and `labModel.ts` (the `sound-lab` probe imports it) stay.
`Workbench`, `Arrangement`, `Hunt`, `parts` and `useLab` spoke the Library's old `Take`
and were deleted at the end of round 4 once nothing imported them.
