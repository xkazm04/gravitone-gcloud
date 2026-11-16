# The Suno driver

`lib/suno/` renders a Suno custom create from the server, either by driving the operator's own,
signed-in Suno tab over the Chrome DevTools Protocol, or through Suno's official API on an OAuth
grant the operator made. The account, the credits and the session are the operator's.

| File | Holds |
| --- | --- |
| `lib/suno/types.ts` | wire types, `SUNO_MODEL_LABEL`, `SUNO_CDP_PORT` (9334). Client-reachable: no `node:`, no env names. |
| `lib/suno/browser.ts` | `attach()`, the Chrome launch, the signed-in check. Server-only. |
| `lib/suno/selectors.ts` | `SELECTORS` — every DOM selector, API path and cookie name, each with its recon date. |
| `lib/suno/driver.ts` | `probeSuno()`, `probeSunoOn(port)` (test seam), `createSunoTracks()`, `listSunoLibrary()`; re-exports `resolveSunoAudio`. |
| `lib/suno/resolve.ts` | `resolveSunoAudio()`, the raw clip shape, the media-URL rule, the in-tab clip fetch. |
| `lib/suno/api/driver.ts` | `API_SUNO`, `apiSunoDriver(deps)` (test seam). |
| `lib/sound/suno/drivers.ts` | the `SunoDriver` interface, `sunoDriver()`, `AUTO_SUNO`, `selectedSunoDriver()`. |
| `lib/sound/suno/library.ts` | `importSunoLibrary()` — the library into the store, deduped by song id. |
| `pipeline/suno-browser.mjs` | `npm run suno:browser` — opens the profile. |
| `pipeline/suno-import.mts` | `npm run suno:import` — the library import without the app. |

## Choosing a driver

`SUNO_DRIVER` (`lib/sound/suno/drivers.ts`), read per call:

| Value | Driver | Create, library, polling | Audio URL | Health (`probe`) |
| --- | --- | --- | --- | --- |
| `browser` | `REAL_SUNO` (`lib/suno/driver.ts`) | the profile's `/create` form and studio-api | `media_urls[0].url` from the profile | CDP answers and the Clerk cookie is signed in |
| `api` | `API_SUNO` (`lib/suno/api/driver.ts`) | `POST /v0/audio`, `GET /v0/audio/{id}`, `GET /v0/library` | none (`audioUrl: null`; below) | a grant is held and `/v0/account/usage` answers |
| `fake` | `FAKE_SUNO_DRIVER` (`lib/sound/suno/fakeDriver.ts`) | counted ids, no network | half the clips | `FAKE_SUNO.health` |
| unset (auto) | `AUTO_SUNO` | `api` while `sunoApiStatus().connected`, else `browser` - decided on every call | as the driver picked | as the driver picked |

Auto decides per call because the worker binds `sunoDriver()` once at module load
(`lib/producers/registry.ts`): a grant made or dropped later is honoured on the next call.
`selectedSunoDriver()` names the kind a call would reach now; the scout doctor
(`lib/foundry/scout/doctor.ts`) probes that one, and on `api` adds a `suno bytes` line (a note,
never a blocker) for the browser profile.

### Bytes (the `api` driver hands out none)

The API does not hand out a suno.com song's audio. Measured 2026-11-10 with the app's own token:

- `GET /v0/audio/{id}/stream` refuses: `refused (forbidden): This app can't stream suno.com songs. Play the song at its song_url.`
- `cdn1.suno.ai/<id>.mp3` answers 403; `POST /v0/audio/{id}/download` unconfirmed answers
  `{"status":"requires_credit","format":"mp3","credits_remaining":42,"message":...}` (free); confirmed
  it spends one of the person's download credits. Needs the `download` scope.
- The signed-in profile's `GET /api/clip/<id>` answers `media_urls[0]` =
  `d2lwuy8qc234o3.cloudfront.net/1/clip/<id>.m4a`, `content_type: "m4a-opus"`, `encoding: "1.0.0"`, and the
  bytes are not an MP4 (no `ftyp`; ffmpeg: "moov atom not found"). They are encoded; Gravitone does not
  decode them.
- A clip carries `{id, title, status, created_at, error, song_url, cover_image_url, cover_image_large_url,
  handle, liked, visibility, metadata:{duration, style, lyrics?, description?, type}}` - no audio URL, no model.

So the `api` driver's refs and library clips carry `audioUrl: null`: a song's bytes come through the
pull (below), on the person's confirmed press. `resolveSunoAudio` (`lib/suno/resolve.ts`) still exists
and the driver keeps a `resolve` seam, but nothing calls it by default.

### The `api` create

| Phase | What happens |
| --- | --- |
| `attaching` | the grant (`sunoApiStatus`), then `usage()`; `credits_remaining <= 0` is `suno: out of credits` |
| `composing` | the body: `title`, `style`, `lyrics` (empty or `[Instrumental]`: no `lyrics`, `instrumental: true`), `negative_style` from `exclude`, `model` (`v6`, `v6-wild` as-is), `idempotency_key` |
| `creating` | `POST /v0/audio`; a 402 or a credits sentence is `suno: out of credits`, any other refusal `suno refused the create: <Suno's sentence>` |
| `rendering` | `getClip` per id every 5 s until `complete`; `error` is `suno failed the clip: <reason>`; at 6 min, clips that are all at least `streaming` are returned, otherwise `suno did not finish rendering in 6 min (songs …)` |
| `collecting` | `SunoClipRef`s, `audioUrl: null` |

`SunoClipRef`: `url` = `song_url` (else `https://suno.com/song/<id>`), `imageUrl` = `cover_image_large_url`
then `cover_image_url`, `durationS` = `metadata.duration`.

`idempotency_key` = `gt-` + sha256 of (the caller's key, the model, the trimmed fields), 48 hex. The bound
producer passes the kernel step's `ctx.key` (`<job id>/create:<model>`, stable across retries and
attempts), so a retried step is one create on Suno. A caller with no key falls back to the minute.

The create answer's shape is not yet seen live: `wire.ts` `CreateResponse` accepts a clip, `{clip_ids}`,
`{clips}` or a bare array, and the polling needs only the ids.

### The `api` library

`GET /v0/library?limit=50` by `next_cursor` until there is none; `status: complete` only, deduped by id,
newest first by `created_at`, `audioUrl: null`. `model` is `metadata.model` or
`major_model_version` when the clip carries one, else `"unknown"`. `prompt` = `{title, style:
metadata.style ?? "", lyrics: metadata.lyrics}`, absent keys omitted.

### Credits on the receipt

A driver with `credits()` (the `api` driver: `usage().suno_account.credits_remaining`; the fake: `null`;
the browser driver: none) is read before and after each create in `lib/producers/suno.ts`. The
difference is written into the create's `credits` entry REASON:
`<SUNO_CREDITS>; this create spent N credits (A -> B left)`. The entry's `amount` stays undefined -
it settles on `JOB_USD`, whose unit is dollars, and a credit is not a dollar. A failed read, or a
negative difference, leaves the reason as `SUNO_CREDITS`.

## Launching the profile and signing in

```bash
npm run suno:browser
```

opens Chrome with `--user-data-dir=%USERPROFILE%\.suno-chrome --remote-debugging-port=9334
--no-first-run` on `https://suno.com/create`, detached. If 9334 already answers it does nothing.
Sign in to Suno once in that window (Google sign-in works); the profile keeps the session.
`SUNO_CHROME_PATH` overrides where `chrome.exe` is looked for.

Why a separate profile: Chrome 136+ refuses `--remote-debugging-port` on the default profile.
Never point the driver at the default profile.

When nothing answers on 9334 and `canSpawnLocalBinaries()` (`lib/deployment.ts`) is true, the
driver launches the same profile itself before a create. A probe never launches anything.

## What the driver will and will not do

- It opens **its own tab** for each create and closes only that tab. It never calls
  `browser.close()` — on a CDP-attached browser that closes the operator's Chrome.
- One `Browser` connection per server process (`globalThis.__gtSunoBrowser`), re-made when it drops.
- It does not touch the cookie banner, does not press "Clear all form inputs", and leaves More
  Options (vocal gender, duration, Max Mode, weirdness, style influence, variety, personalize) as
  the operator set them. It never deletes anything from the library.
- Suno persists the create form and the chosen model across tabs: after a create, the operator's
  own `/create` tab shows the last prompt and the last model the driver used.

## probeSuno()

Cached ~15 s per port. Returns:

| Result | When |
| --- | --- |
| `{ok:true}` | CDP answers and Clerk's `__client_uat*` cookie on suno.com holds a positive epoch |
| `{ok:false, reason:"suno browser not running"}` | nothing answers on the port |
| `{ok:false, reason:"not signed in to suno"}` | the profile is up but signed out (`__client_uat` is `0` or absent) |

`probeSunoOn(9399)` shows the first without closing anything; a throwaway headless Chrome with an
empty `--user-data-dir` on another port shows the second.

## createSunoTracks(fields, model, onPhase)

| Phase | What happens |
| --- | --- |
| `attaching` | attach (launching if allowed), check the sign-in cookie, open a tab on `/create` |
| `composing` | switch to **Advanced**, pick the model, fill lyrics / style / exclude / title |
| `creating` | press **Create**, wait for the page's own `POST /api/generate/v2-web/` answer |
| `rendering` | poll `GET /api/clip/<id>` for each new id (from inside the tab, with the page's Clerk token) until every clip is `complete` |
| `collecting` | map to `SunoClipRef` and close the tab |

The new clips are identified from the **network answer** to the create request, never from the
library list, so older clips cannot be mistaken for new ones.

- Instrumental: lyrics empty or `[Instrumental]` leave the lyrics editor empty — Suno has no
  separate switch and sends `make_instrumental: true` for an empty editor (confirmed in the live
  smoke).
- `audioUrl` is `media_urls[0].url` (a CloudFront `.m4a`). A complete clip's `audio_url` is the
  sentinel `…/api/forbidden`, so it is used only when it is anything else.
- `durationS` is `metadata.duration`; `imageUrl` prefers `image_large_url`.
- Timeout: 6 minutes of rendering. If every clip already has audio by then, the refs are returned
  anyway (the credits are spent); otherwise it throws with the song ids.

Errors, shown to the operator verbatim: `not signed in to suno`, `suno browser not running`,
`suno: out of credits` (billing shows nothing left, or Suno answers 402 / a credits message),
`suno refused the create: <Suno's detail>`, `model picker has no '<label>' (it lists …)`,
`suno <field> field not found`, `suno did not answer the create`, `suno failed the clip: <reason>`,
`suno did not finish rendering in 6 min (songs …)`.

## Library import

`listSunoLibrary(onPage?)` reads every clip in the operator's library; `importSunoLibrary()`
(`lib/sound/suno/library.ts`, route `POST /api/sound/suno/library {all:true}`, CLI
`npm run suno:import`) stores the new ones as `SunoClip`s with `origin: "library"`,
`jobId: null`, no verdict, no lane. It spends nothing and is read-only on Suno:

- It opens its own tab on **`https://suno.com/me`** (the library, every workspace) and waits for
  the page's own `POST /api/feed/v3`. That request supplies the bearer token and the **filters**,
  which are reused verbatim: `disliked "False"`, `trashed "False"`, stems and studio-project
  clips excluded, `user {presence "True", userId}`. So the import lists what the library page
  lists. Nothing is clicked.
- Pages of 50 (`SELECTORS.api.feedPageSize`) by `next_cursor` until `has_more` is false,
  600 ms apart. Suno answers **429** to a burst (seen in recon after about eight back-to-back pages):
  a 429 backs off 2 s, 4 s, 8 s… (6 tries); a 401/403 reloads the tab for a fresh token.
- Kept: `status === "complete"` and not `is_trashed`; deduped by id. Mapped: `title`, `url`
  `https://suno.com/song/<id>`, `audioUrl` (as for a create), `imageUrl`, `durationS`,
  `createdAt` (Suno's `created_at`), `prompt.style` = `metadata.tags` (else
  `gpt_description_prompt`, else `""`), `prompt.lyrics` = `metadata.prompt` (`[Instrumental]`
  when empty and `make_instrumental`), `prompt.exclude` = `metadata.negative_tags`,
  `prompt.title` = the title when there is one.
- **Model label**: the library's own chip, `metadata.model_badges.songrow.display_name`,
  normalised (`"V6-WILD"` → `"v6-wild"`). `major_model_version` and `model_name` cannot tell
  v6 from v6-wild (both `"v6"` / `"chirp-hawk"`); they are only the fallback.
- Dedupe is by `songId` against **every** stored clip, so a song the queue rendered is not
  imported again and a re-run adds 0.

First live run, 2026-10-11, operator's account: 149 clips (73 `v6`, 61 `v6-wild`, 15
`v6-mini`), 3 pages; a second run added 0. Seven songs made earlier that day (the four
`Gravitone probe` smoke clips among them) were trashed by then and are, correctly, not imported.

## Models

The live picker (2026-10-11) lists, under ALL MODELS: **`v6`**, **`v6-wild`**, `v6-mini`.
The request sends `mv: "chirp-hawk"` for v6 and `mv: "chirp-hawk-wild"` for v6-wild. Labels are
matched after folding case, whitespace and hyphens (`normalizeModelLabel`), so `"v6 wild"` in
`SUNO_MODEL_LABEL` and `"v6-wild"` on the page are the same label.

## The official API

`https://api.suno.com` (`SUNO_API_BASE` moves it), OAuth 2.1 authorization code + PKCE S256 with dynamic client
registration; the authorization server and its endpoints are discovered from
`/.well-known/oauth-protected-resource`.

- `lib/suno/api/wire.ts` - the zod shapes; a body that does not parse is refused quoting its first 300 characters.
- `lib/suno/api/tokens.ts` - `<sound store>/suno-api/auth.json` (client + tokens, plain text),
  `pending.json` (state -> PKCE verifier, ten minutes), `auth.lock` (every write, stale at 30 s).
- `lib/suno/api/oauth.ts` - `discover`, `ensureClient`, `beginAuthorization`, `completeAuthorization`, `refresh`,
  `disconnect`. Scopes `api:v0 credits:spend library:read library:search profile:read offline_access`.
- `lib/suno/api/client.ts` - `sunoApi()`: `usage, me, getClip, listLibrary, searchLibrary, create, analysis, listen,
  listenRead, alignment, stream`; `sunoApiStatus()` reads the file only. `create` is the one call that spends credits.
- Connect: `GET /api/suno/connect` (access guard) -> Suno -> `GET /api/suno/callback` -> `/audio?suno=connected`
  or `/audio?suno=error&reason=...`. Disconnect: `DELETE /api/suno/connect`.
- CLI: `npm run suno:api -- status | usage | clip <id> | stream <id> [--out <file>]`. Read-only.

### Upload and covers (spark suno-covers WP1)

Four more calls in `lib/suno/api/client.ts`, all free but `cover`:

- `uploadSession(title)` - `POST /v0/audio/upload-sessions` `{title}` answers `{id, upload_url, upload_page_url?}`. Needs the
  `audio.upload` feature. Free: uploads spend no credits.
- `putUpload(uploadUrl, bytes, mime)` - `PUT` of the raw bytes to the signed URL with `content-type: <mime>` and **no
  bearer** (the URL is the credential; Suno's token never goes to the storage host). A 180 s deadline. A refusal is the
  status and the first 300 characters of the body text.
- `completeUpload(sessionId)` - `POST /v0/audio/upload-sessions/{id}/complete` answers the clip; poll `getClip` to
  `complete` (3 min is the job's cap).
- `cover(clipId, body)` - **spends song credits.** `POST /v0/audio/{clipId}/covers` with a `CoverBody` (parsed first: a
  duration of 5 is refused in the process, as Suno's 400 "duration must be between 15 and 360 seconds" would; never
  `max_mode`, never `voice_id`), `idempotency_key` required so a retried step is one cover. The answer is one clip or
  `clip_ids`, read as `create`'s is. Camel-case plan controls are `audio_influence`, `style_influence`, `weirdness`,
  `variety` on the wire.

The cover's send is a kernel job (`docs/audio-cover.md`, "To Suno and back"). The request and response shapes of these four
are from Suno's tool description and the measured 400, not from a call with a real token.

## When Suno changes its UI

Everything Suno-shaped is in `lib/suno/selectors.ts`. Symptom → entry:

| Error | Fix in `SELECTORS` |
| --- | --- |
| `suno model picker not found` / `did not open` | `model.trigger`, `model.triggerText`, `model.row` |
| `model picker has no 'v6 wild' (it lists …)` | the model was renamed: update `SUNO_MODEL_LABEL` in `types.ts` (the list in the message is the new truth) |
| `suno lyrics/style/title/exclude field not found` | `form.*` |
| `suno create button not found` / `stayed disabled` | `form.create`; or a required field is now empty |
| `suno did not answer the create` | `api.generate` (find the new create endpoint in the page's JS: search the loaded scripts for `"/api/generate`) |
| `suno did not finish rendering` while Suno shows the songs done | `api.clip` or the clip JSON shape (`status`, `media_urls`) |
| probe says `not signed in` while the tab is signed in | `auth.clientUatPrefix` (Clerk cookie name) |

Re-running the recon: attach with `chromium.connectOverCDP("http://127.0.0.1:9334")`, open a NEW
tab on `/create`, dump visible `input, textarea, [contenteditable], button[aria-label]`, open the
model picker and read `[role=dialog] [role=row]`, and log `studio-api-prod.suno.com` responses.
Never press Create during recon — every create spends the operator's credits. For the library,
open `/me` and read the page's own `POST /api/feed/v3` body and answer. Date every
selector you change.

## Pulling a take from Suno, and reading it twice (spark suno-api WP3)

A take can be **pulled** from the person's Suno library instead of uploaded. The dock's verdict row
carries `from suno` beside `attach take`: it lists the library (`GET /v0/library`, or
`/v0/library/search` when a title is typed, 20 a page). Pressing a song asks Suno's download quote;
a song that costs a download credit shows `1 download credit · N left` and a `spend 1 credit · mp3`
press, and only that second press spends. Upload
stays for files made elsewhere; such a take has no Suno id and no Suno read.

**Not connected.** With no grant in `<sound store>/suno-api/auth.json` the picker is one chip linking
`/api/suno/connect`. Suno's sign-in comes back to `/audio?suno=connected` (nothing shown) or
`/audio?suno=error&reason=...`, whose reason is shown verbatim in the studio's banner.

### The pull (`lib/sound/suno/pull.ts`)

1. A song this server already pulled answers the take it holds (no second download, no second take).
2. `getClip(id)` through the API: the song must be `complete`, else the pull refuses with its status.
3. Unconfirmed: `POST /v0/audio/{id}/download` (free). `requires_credit` is answered as a
   `SunoDownloadQuote` (`{clipId, credits: 1, left, format}`) and nothing is filed; an answer that
   already carries a `url` is filed at once. Measured 2026-11-10: a song paid once answers
   `{"status":"ok","url":...}` to every later call, confirmed or not, so it never costs twice. The
   file is a signed S3 URL to `<id>_paid_wm.mp3` (an MP3: 48 kHz stereo with cover art).
4. Confirmed: refused under `GRAVITONE_DRY_ONLY=1` before Suno is asked. Otherwise a receipt (scope
   `suno-download`, key `<id>:<format>`, live) is claimed, the confirmed download is asked again every
   1.1 s while `processing` (cap 50 s), and the receipt settles with the URL (an unpriced quote whose
   note names the credit; download credits are not USD). A refusal releases it, verbatim. A press
   within the receipt's 15 min replays the paid URL, so a file that failed to measure is not bought
   twice. Then the bytes (`fetchClipBytes`, lib/sound/mv/fetchAudio.ts); the extension is the URL's,
   else the format's.
5. `measureAndFile` (`lib/sound/suno/measure.ts`), the step the upload route now shares: a temp file,
   the sidecar's `analyze`, then `fileSunoTake` with `sunoClipId` on the facts record.
6. Suno's read (below). A refused read leaves the take filed and says why (`readRefused`).

Every refusal is its source's own sentence, and a refused pull files nothing. Only the confirmed
press spends: one download credit.

### The dual read (`lib/sound/suno/sunoRead.ts`)

The listener doctrine: Suno's free reads are the precise reference, the priced Gemini listen stays
(it adds instruments, roles and vocal character, and it still reads uploads), and a linked take
holds the local measurement, the Suno read and the Gemini read at once.

- `analysis` (bpm, key, time signature, A/B/C sections, terms, labels) and `listen` are polled every
  3 s up to 45 s, side by side; `lyrics-alignment` is read once (its word count only).
- The listen asks one question (`SUNO_LISTEN_QUESTION`) that ends in a json block of genre, mood,
  bpm, key, vocals and sections. The answer is kept verbatim (clipped at 2000 characters); the block
  is parsed tolerantly (`sunoAnswerFields`, @gt/domain/audio.suno.schema): a missing or garbled
  block is no fields, a bad field is that field absent.
- A part still out at the cap is saved as `status: "processing"` with the listen's id, so the next
  `read` press polls the same question instead of asking a new one (listen: 5 in flight, 200 a day).
- No receipt (free). A refusal (429, 403, no grant) is the press's answer and saves nothing.

The facts record (`suno-facts.json`) gains `sunoClipId?` and `suno?` (a `SunoRead`); records written
before them still parse.

### The take surface (`@gt/ui suno/TakeFacts`, `SunoColumn`, `reads.ts`)

Three columns named by their source: `measured`, `suno` (pulled takes only, with a free `read`
press), `gemini` (with the priced `Listen` and its quote). Where two reads disagree the row names the
other read's value: tempo beyond 2 % between the two measurements (sidecar, Suno) and 4 % against
Gemini's heard tempo; key by pitch class and mode; a section start with no boundary of the other read
within 3 s.

### Actions (`app/(studio)/audio/studio/_live/sunoActs.ts`)

`pullSunoTakeAct({session, clipId, promptId?, clip?})`, `readSunoTakeAct({takeId})`,
`sunoLibraryAct({query?, cursor?})` and `sunoConnectionAct()` (the token file, no network), each
through the one action core: the principal first, then the door.
