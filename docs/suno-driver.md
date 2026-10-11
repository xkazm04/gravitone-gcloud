# The Suno driver

`lib/suno/` renders a Suno custom create from the server by driving the operator's own,
signed-in Suno tab over the Chrome DevTools Protocol. There is no Suno API key: the account,
the credits and the session are the operator's.

| File | Holds |
| --- | --- |
| `lib/suno/types.ts` | wire types, `SUNO_MODEL_LABEL`, `SUNO_CDP_PORT` (9334). Client-reachable: no `node:`, no env names. |
| `lib/suno/browser.ts` | `attach()`, the Chrome launch, the signed-in check. Server-only. |
| `lib/suno/selectors.ts` | `SELECTORS` — every DOM selector, API path and cookie name, each with its recon date. |
| `lib/suno/driver.ts` | `probeSuno()`, `probeSunoOn(port)` (test seam), `createSunoTracks()`, `listSunoLibrary()`. |
| `lib/sound/suno/library.ts` | `importSunoLibrary()` — the library into the store, deduped by song id. |
| `pipeline/suno-browser.mjs` | `npm run suno:browser` — opens the profile. |
| `pipeline/suno-import.mts` | `npm run suno:import` — the library import without the app. |

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
