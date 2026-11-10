# Audio cover

`/audio?s=cover`: a song's section transcribed by SheetSage2 and rendered as five YuE2 takes on this box's card, judged by ear, the winner downloaded for Suno, the remix brought back by hand. Spark `track-mirror-studio`, 2026-11-07. Stage 1 and its measurements: [track-mirror-2026-11-07.md](concepts/track-mirror-2026-11-07.md).

## Rights

Every upload declares `own`, `licensed` or `third-party-uncleared`, with no default. A cover carries the source's melody whatever its style (registry `reference-track-anchoring`), and YuE2's weights are CC BY-NC 4.0. So `lib/sound/cover/rights.ts` `coverRights` never answers `publishable`: an uncleared song is `reference-only`, a declared one `unknown` with a note naming the weights. The owner chose warn-only on 2026-11-07: download is never blocked, an uncleared winner's download states the consequence once, and the Library entries carry the record. Nothing here aims at a vendor's upload screening, and a vendor saying nothing about an upload is not a clearance.

## Flow and where it lives

| Step | Code |
|---|---|
| Upload, declare, measure with ffprobe | `app/(studio)/audio/cover/source/route.ts`, `_cover/upload.ts` |
| Section on the waveform, peaks decoded in the browser | `_cover/desk/Source.tsx`, `@gt/ui` `RangePick` |
| Receipt ($0), then confirm with its token | `_cover/acts.ts` -> `lib/producers/cover.ts` `launchCover` |
| One job `job:cover:<id>`, gpu.local, engine comfy | `packages/producers/src/cover/define.ts`, `lib/producers/coverActs.ts` |
| Steps `transcribe`, `render-1`..`render-5` | `lib/sound/cover/{cut,yue2}.ts` |
| Takes A/B against the section, pick | `_cover/desk/sleeve/TakeGrid.tsx`, `_cover/desk/useAB.ts`, `pickCoverAct` -> `winner.mp3` 320 kbps |
| Remix and the back-filled styles | `cover/remix/route.ts`, `saveCoverStylesAct` |
| Library: section, winner, remix as `reference`, origin `cover` | `lib/library/feeds/cover.ts` |

Store: `<SOUND_STORE_DIR or foundry-out/sound>/covers/<id>/` with `cover.json`, `source.<ext>`, `section.wav`, `score.abc`, `takes/s<seed>.flac`, `winner.mp3`, `remix.<ext>`. A take reproduces from the score, its seed and `max_duration` (360).

Knobs are fixed: SheetSage2 mode full; YuE2 mode full, temperature 0.8, top_p 0.95, top_k 100, repetition_penalty 1.2, cfg_scale 1, 32 steps, dpm_2, sgm_uniform. Seeds from `sha256(<id>/<n>)`. Empty lyrics become the score's own section labels as tags.

## The brief (2026-11-08)

A draft cover offers **Brief**: one job, `job:cover-brief:<id>` on `seat.text`, that writes the cover and launches it.

1. `measure` - pipeline/track-mirror/analyze.py in `TRACK_MIRROR_PYTHON` (default `<home>/ai/tools/track-mirror-venv`): tempo, key, sections, low end, top end. Free.
2. `listen-1..3` - three Gemini reads through the `suno-listen` turn with `pipeline/cover-listen-PROMPT.md`, an open question that names no genre. Each priced on the receipt; a stand-in under `GRAVITONE_DRY_ONLY=1`.
3. `write` - one Claude Code turn on the seat with `pipeline/cover-brief-PROMPT.md`: the cover style in comma tags, the source style, the section (the whole song when it fits 360 s), empty lyrics, a reason, and how many reads agreed on the genre. Genre words only where two of three reads agree.
4. Settle applies the brief to a cover still in draft and launches its five takes. A DRY job applies nothing and says so.

The record's `brief` carries the state; the desk re-reads its view every 60 s (`COVER_POLL_MS`) only while the brief or the cover job is queued or running, and on returning to the tab.

**Agreement is not truth.** The first real write turn (2026-11-08, Tears, fed round 1's three stored reads) wrote post-rock: all three reads agreed on the genre the owner rejected, and the two-of-three rule passed it. Only the neutral listen prompt can change that, and it has not met a live song yet. Read the reason beside the style before trusting the genre; the takes cost only GPU time to redo. That turn took 51 s and $0.27 of seat time.

## From a link (2026-11-08)

The song can be a YouTube link instead of a file: `POST /audio/cover/link` (`COVER_LINK_ROUTE`), JSON `{ url, rights, title?, holder?, note? }`.

- **What it checks.** `lib/sound/cover/link/parse.ts` takes https only, on youtube.com, www/m/music.youtube.com (`/watch?v=`, `/shorts/`, `/live/`) or youtu.be, one 11-character video id; a playlist-only link, another host or scheme are refused in words. The desk's link field runs the same judge. Rights are declared with no default, as for a file.
- **The 20 minute cap.** yt-dlp reads the length and title first (`--skip-download`); a video past 20 min (`MAX_VIDEO_S`, the scout's) is refused before a byte is downloaded. Then `-f bestaudio -x --audio-format mp3 --audio-quality 0 --max-filesize 60M --no-playlist --js-runtimes node` into a temp folder removed on every path. The download is held to 270 s, under the route's 300 s budget. The duration on the record is ffprobe's on the downloaded bytes, as for an upload.
- **Binaries.** `YTDLP` (default `yt-dlp` on PATH) and `FFMPEG` (handed to yt-dlp as `--ffmpeg-location` when set). A missing yt-dlp is refused with the scout doctor's install line; a failed download answers yt-dlp's last stderr line verbatim.
- **Provenance.** The record keeps the canonical `https://www.youtube.com/watch?v=<id>` as `source.url`; the source's name on the desk links out to it. A declaration is still the owner's: a video being on YouTube is not a clearance.

A new cover from a link opens on its brief's receipt: the listens are priced on the downloaded length, so the receipt is never skipped, and one Confirm starts the brief, which launches the cover.

Measured 2026-11-08: *Caminandes 3: Llamigos* (Blender, YouTube `SkVqJ1SGeL0`, licence on YouTube "Creative Commons Attribution"), 150 s, fetched in 8.2 s as a 4.76 MB mp3, ffprobe 150.09 s.
## Measured

The first real job (2026-11-07, a 20 s section of the Tears reference, temp stores, after an hour queued behind another tenant): transcribe 2.4 s, renders 10-12 s each, 55 s in all; five takes of 20-27 s. Stage 1 measured about a minute per two-minute take.

## Known limits

- **A failed cover or brief is retried as the same job, not relaunched.** The brief shows the existing job's id. The job id is fixed per cover, so a second launch answers `existing`; Runs' retry resumes at the first missing step. A ComfyUI failure is a vendor failure the kernel retries three times before the job fails; the take keeps ComfyUI's sentence.
- **ComfyUI's output folder keeps every rendered flac.** Its HTTP API cannot delete them; the cover's own copies are the ones the app reads.
- **Queued behind any GPU tenant.** H3 batches and benches hold the same lease, sometimes for hours.
- **Unmeasured:** a song with a sung line (both test songs transcribed with an empty Vocal voice), a section cut from inside a longer source in a real job, and the desk on real covers. `?fixture=<state>` drives the desk on stand-in data in development only.
- **The worker runs the code it started with:** after landing, restart the Gravitone worker task before the first cover.

## To Suno and back (2026-11-10)

A picked cover's winner can go to Suno through its official API (`docs/suno-driver.md`, "The official API") and one of
the answers can come back as the cover's remix. Two confirms, each priced before it spends.

**The send** (`lib/producers/coverSuno.ts`, `launchCoverSuno`). The cover must be `picked` with its `winner.mp3`; the
receipt is five lines on `cloud.suno` - `upload` ($0, "free: uploads spend no credits"), `cover-1` and `cover-2` (Suno song
credits, unpriced with the catalog's Suno sentence and the note "about 5 credits a song (a create, measured 2026-11-10)"),
`read-1` and `read-2` ($0). The lines are keyed `cover-suno:<cover>@<digest of the plan>/<step>`, so a plan changed after the
receipt answers `stale` with the fresh one. A `third-party-uncleared` source is not refused here; the desk shows the
warning and the owner decides. The token enqueues one job, `job:cover-suno:<cover>:<n>` (n is the send's place on the cover),
on `cloud.suno`, with its request as the event `audio.cover-suno-requested`, and `cover.json` gets
`suno.sends[n-1] = {state: "queued", takes: [pending, pending]}`. A send still queued or running answers `existing` with its
job: a second press is the same send. Under `GRAVITONE_DRY_ONLY=1` the confirm is `armLive`'s refusal.

**The job** (`packages/producers/src/cover-suno/define.ts`, acts in `lib/producers/coverSunoActs.ts`), five steps in order,
each booked once, a resumed job planning only the steps not booked:

- `upload` - skipped when `suno.uploadClipId` exists (one upload per cover, every later send covers it); else a session,
  one PUT of `winner.mp3`, a complete, the clip polled to `complete` (5 s, 3 min cap), `uploadClipId` written.
- `cover-1`, `cover-2` - the account's credits read, one `POST /v0/audio/{upload}/covers` with the plan's style, lyrics
  (omitted when empty: an instrumental cover), model, duration, negative style and sliders, and the idempotency key
  `gt-cover-<cover>-<n>-<take>`; the clip polled to `complete` (5 s, 6 min cap); the credits read again. The delta goes on
  the booked entry's reason (credits are not dollars) and into the send's `creditsSpent`, absent when a read failed.
  A refusal that is not `unavailable` (screening, plan, 402) is Suno's sentence kept verbatim on the take AND the send and
  fails the job at once, never retried around; a 5xx, a 429 or a timeout is a vendor failure the kernel may try again, and a
  retry asks Suno for the clip it already made (the clip id is written the moment the POST answers).
- `read-1`, `read-2` - Suno's analysis, alignment and listen of the take, folded with `foldRead` and kept on the take; a
  refused read is kept verbatim as `readRefused` and never fails the send.

The send ends `done` when both takes are complete, else `failed` with the first sentence. The desk re-reads its view while
`sunoSendInFlight(record.suno)`.

**Keeping a take** (`lib/sound/cover/suno.ts`, `fileSunoTake`; the action is `app/(studio)/audio/_cover/sunoActs.ts`).
Unconfirmed: Suno's download quote (`{quote: {clipId, credits: 1, format, left}}`), nothing filed; an answer that already
carries a url is filed free. Confirmed: refused before Suno is asked under DRY_ONLY; otherwise one download credit spent
under a `suno-download` receipt (`lib/sound/suno/pull.ts`: a refusal is Suno's words and releases the receipt, a press within
the window replays the paid url). The bytes are measured with ffprobe, filed as `remix.<ext>` and the record gets
`remix {file, mime, name, style: the send's style, sunoClipId}` and `suno.filed {send, take, clipId}`. The same take pressed
again is the remix already.

**The station** (`app/(studio)/audio/_cover/desk/suno/`).

A picked cover's groove has seven stations: brief, section, score, takes, winner, **suno**, remix. `suno` opens for a
`picked` cover only (`sleeve/stations.ts` `reachedOf`). The desk opens a cover there once it has a send, until a remix
uploaded by hand stands (`remix` without `sunoClipId`); `Upload remix` on the remix station is unchanged. The station's
badge on the groove is `sending` while a send is queued or running, `send N · take M` once a take is filed, else a tally of
sends. The desk re-reads every 60 s while `sunoSendInFlight(record.suno)` (`brief/brief.ts` `inFlight`).

What it draws, in every composition (pieces in `desk/suno/form.tsx`, `results.tsx`; state in `useSunoSend.ts`; the pure
parts in `suno.ts`, tested in `tests/next-server/cover-suno-desk.test.ts`):

- The form: style (TextArea, 1000), lyrics (TextArea, 5000; empty reads as an `instrumental` chip), model Select (v6 /
  v6-wild / v6-mini), three 0-100 % faders (audio influence, style influence, weirdness), a variety Seg (Off..Max),
  negative style, a target length (15-360 s). Prefilled with the remix's style, else the cover's; the cover's lyrics; v6.
  A control left alone reads `default` and is an omitted key in the plan; a touched one is a chip that puts it back.
  `2 covers` is a Tally by the send press, not a control.
- The receipt: the press with no token answers it (`acts.sendSuno(plan)`), Confirm sends its token, a `stale` answer
  replaces it with the fresh one and marks the cells that moved, as the cover launch does. For `third-party-uncleared`,
  `exportWarning(rights)` stands above the receipt, which holds Confirm.
- A send in flight: its five steps (upload, cover 1, cover 2, read 1, read 2) with where each stands, read off the
  record's take states; nothing polls but the desk.
- Two takes: title, length, state, a link to `songUrl` (new tab, named `Open <title> on suno.com`), Suno's read as chips
  (bpm, key, genre, mood) and its listen answer verbatim, `readRefused` / `error` as an ErrorLine verbatim.
- Keep: `fileSuno({id, send, take})` answers Suno's quote, drawn `1 download credit · N left` with a spend press;
  `fileSuno({..., confirm: true})` files the take, which then wears a `remix` chip. A refusal sits under its take.
- Earlier sends, newest first; the form waits only while the latest send is in flight.

The composition (picked 2026-11-10 from three prototypes): the form leads - form left, Suno's answer right (the latest
send's steps and takes stacked, earlier sends below), the receipt across the full width under both.

Fixtures (`/audio?s=cover&fixture=<state>`, development builds only): `sending` (send 1 running, upload done,
cover 1 complete, cover 2 pending), `covered` (send 1 done, both takes with reads, take 2's read refused; third-party
uncleared, so the receipt carries the warning), `filed` (two sends, take 2 of send 2 filed as the remix, send 1's take 2
refused verbatim). The fixture `sendSuno` answers a receipt, a stale one once, then queues and walks one state per re-read;
`fileSuno` answers a quote (12 credits left, one fewer each spend) then files. Re-read in the browser with
`document.dispatchEvent(new Event("visibilitychange"))` instead of waiting 60 s.

Constraints found against the WP0 contract (none blocking): `Receipt` has no slot above its Confirm, so the
consequence sentence is drawn above the whole receipt; a disabled form (a send in flight) uses @gt/ui's aria-disabled
look, which fades the typed text.

**Side effect on suno.com.** Every upload and every cover is a song in the owner's suno.com library (an upload as an
uploaded clip, each cover as a song); nothing here deletes them. A cover of a `third-party-uncleared` source is sent only
on the owner's confirm, beside the warning; Suno's own upload screening decides, and its refusal is shown verbatim.

**Not measured live:** every call above was exercised against a fake Suno; the upload session, `complete` and `covers`
answers are parsed loosely and the first real send will say what they look like (a body that does not parse is refused
quoting the first 300 characters). The credit cost per cover is the create's measure, not a cover's.
