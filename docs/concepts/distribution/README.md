# Release studio (spark audio-distribution)

A DistroKid-shaped release desk inside /audio: kept takes become a single, an EP or an album with the
metadata a distributor's upload asks for, a provenance record per track, a sleeve, a one-click master
and the channels it goes to. Research behind it: [distrokid-research.md](distrokid-research.md).

## Where it is (S1, 2026-11-16)

- **The tab:** `/audio?s=release` (`app/(studio)/audio/_release/`) is a wizard: a release picker, then
  tracks -> details -> AI & rights -> sleeve -> master -> channels -> extras -> review, over one draft reducer
  (`draft.ts`). The owner picked it on 2026-11-16 over a one-page desk (8ca8443b) and a sleeve catalog
  (147d8965), both retired. `?source=real` reads the kept takes and the publish readiness; the fixture (the
  default until releases persist) is the owner's MiSu record as three releases.
- **Contract:** `@gt/domain/release` (types), `release.problems` (`releaseProblems`: the one validator
  every review draws), `release.schema` (the door).
- **Master:** the sidecar verb `master`, recipe `uni-1` (`pipeline/audio/master.py`, `docs/audio-sidecar.md`).
  Trial: `npx tsx pipeline/master-trial.mts --dir <folder> --out <dir>` writes masters, `trial.json`
  and a matched-loudness `listen.html`.

## Owner rulings

| Question | Ruling |
|---|---|
| v1 scope | release + metadata, mastering, direct channels, free extras - all four |
| home | a tenth /audio tab, lazy |
| DSPs (Spotify, Apple, Amazon, TIDAL, Deezer) | research a licensed partner API in a later spark; rows read `not-reachable` |
| rights | a provenance record per track; CC BY-NC and an unknown Suno plan tier **warn, never block** |
| sleeve | generate (imaging router), upload, or a frame of the track's music video |
| direct channels | YouTube (art track via the MV path), SoundCloud, Audius, Mixcloud, Internet Archive |
| mastering | **one click, one universal recipe, no parameters** |
| publish | one Calendar slot per channel at the release date (slot item kind `release:<id>`, S2) |
| smart-link hosting | undecided; designed in the wizard only |
| layout | the wizard (2026-11-16), over a one-page desk and a sleeve catalog |

## The first master trial

20 MiSu WAVs, `uni-1`, 2026-11-16: every master -14.0 LUFS, <= -1.3 dBTP, 0 clipped (re-measured on
the written files). The sources were -14.9..-16.3 LUFS (median -15.6) with 2.6..5.5 dB of peak
headroom, so the recipe raised every track by +0.9..+2.3 dB and cost a median 2.0 LU of loudness range,
mostly in the glue compressor. Whether that trade is right is the owner's ear's call; a gentler
`uni-2` is a new row in `RECIPES`, never an edit of `uni-1`.

## S2 (after the layout pick)

- Persist releases (kernel store) and the `release:<id>` slot item kind; Publish creates the slots.
- Adapters: SoundCloud (app registration may be closed: dry-only then), Audius, Mixcloud, Internet
  Archive, beside YouTube's art-track path (`music-video --still` + `sendMvToCalendarAct`).
- Sleeve generation through the still producer; `MvLook` gains `widthPx`/`heightPx` (an MV frame is at
  most the video's height - 1080 px - so it warns under the 3000 px recommendation).
- Masters as child takes: `--adopt` refuses 18/20 trial masters at `MAX_UPLOAD_BYTES` (60 MB, 24-bit
  WAV) - store FLAC or raise the cap for remasters; keep a remaster of an import out of the ledger.
- Extras renders: Canvas loop (MV compositor at 9:16), promo cards, splits sheet export.
- Release-channel marks in `@gt/ui` (`ChannelBadge` covers youtube/tiktok/instagram/blog only).
