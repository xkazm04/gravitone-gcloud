# The fixture universe

A second, complete dataset for developing and testing the studio while the
default universe stays the one real work lives in.

```bash
npm run fixtures        # generate fixtures-out/ (deterministic, wipes first)
npm run dev:fixtures    # the app on port 3100, reading it
```

Open http://localhost:3100. The session is the dev-auth account (amber banner),
so nothing here can be mistaken for real work.

## What is separated, and how

One variable decides: `NEXT_PUBLIC_GRAVITONE_DATA=fixtures` (`lib/fixtures/mode.ts`).
It is `NEXT_PUBLIC_` on purpose, so the browser and the server cannot disagree.

| Half | Real | Fixture |
| --- | --- | --- |
| Server stores (publish, sound, forge runs, extract, dojo, exports) | `foundry-out/` | `fixtures-out/` |
| Foundry's versioned indices (`styles.json`, `ledger.json`, `training-ledger.json`) | `pipeline/foundry/` (git-tracked) | `fixtures-out/catalogue/` |
| Sound ledger | `pipeline/sound/ledger.json` (git-tracked) | `fixtures-out/sound-ledger.json` |
| Browser (projects, themes, assets, step records) | IndexedDB `gravitone-studio` | IndexedDB `gravitone-studio-fixtures` |
| Next build output | `.next` | `.next-fixtures` |

A fixture session therefore cannot write into `foundry-out/`, cannot dirty
tracked evidence by committing a cull, and cannot touch your real browser data.

**Articles is the exception.** `foundry-out/articles` is real in both universes;
it is the one surface whose data is never generated.

## What feeds what

| Generator | Surfaces |
| --- | --- |
| `sound.ts` | Sound lab (Triage, Arrangement, Hunt), Library › Audio, Board › Triage |
| `publish.ts` | Calendar (Schedule, Channels, Metrics), Board › Publish |
| `foundry.ts` | Foundry (forge, Extract, Dojo, styles shelf), Board › Cull / Extract / Dojo |
| `browser.ts` | Library › Styles / Assets, Board › Proofs / Adoption / Alternatives |

The browser half is a bundle (`fixtures-out/browser.json`) served by
`/api/fixtures/browser` (404 outside fixture mode) and written into IndexedDB by
`lib/fixtures/seedBrowser.ts` before any gated page mounts. It re-seeds when the
bundle's content hash changes and otherwise leaves what you did by hand alone.

## Rules for adding to it

- Derive rows from the types in `lib/`; import types, never copy shapes.
- Draw from `rng("<generator>:<thing>")` so adding rows to one generator never
  moves another's numbers. Timestamps are offsets from `NOW`.
- Cover the states, not the count: every status, verdict and failure the type
  allows should appear at least once, including the `null` ("not measured") ones.
- Audio is sine tones and images are gradients; neither is passed off as real
  output. Exports are placeholder `.mp4` files that list but do not play.
- Run `npm run fixtures` and load the page. A reader that warns about a
  generated manifest is a generator bug.
