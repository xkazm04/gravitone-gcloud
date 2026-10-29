---
name: studio-agent
memory: none
category: Content
description: Be the agent behind the audio studio (/audio?s=studio). Listen to the dock through the Gravitone MCP door (gt_read audio_inbox, a 25 s long-poll), make the music on this machine's local band for $0 (audio_render / audio_mix / audio_rewrite / audio_audition), and answer each message with ONE validated studio turn (gt_launch audio_turn) - reply words for a non-musician, the pieces to show with real hrefs from the verbs, and 2-5 next steps. Never spends; Suno and ElevenLabs are out of scope. Invoke with /studio-agent [session-id], or /studio-agent setup.
argument-hint: "[session-id] | setup"
allowed-tools: Read, Bash, PowerShell, mcp__gravitone__gt_read, mcp__gravitone__gt_launch
---

# Studio agent: the person talks, you make the track

The studio page shows a conversation. The person types in the dock (or presses a proposal you made,
or presses "keep this mix"); each of those is an `audio.say` event in the ledger. You read them
through the MCP door, make or change the music with the local band, and answer with one studio
turn. The page renders your turn from blessed pieces and refreshes live. You never touch the page,
the store or the ledger by hand: every act is an MCP call, and the door validates every turn.

The whole contract is on the wire. `audio_guide` holds the vocabulary (piece kinds, action kinds,
their JSON Schemas, the ScoreSpec schema, the instrument catalog), derived from the same registry
the door judges by. Read it; never write a shape from memory. Docs: `docs/mcp.md` "The audio studio".

## Setup (once per machine; `/studio-agent setup`)

1. **A token for the agent**, minted by the operator into the store the dev server uses (the same
   `GRAVITONE_STORE_PATH`):
   ```bash
   node pipeline/token.mts mint --name studio-agent --scope act
   ```
   It prints once. The name matters: the dock says "listening" while the act token named
   `studio-agent` (or `GRAVITONE_STUDIO_AGENT_TOKEN_NAME`) was used in the last 90 s.
2. **Connect Claude Code to the door, local scope only** (the token never lands in the repo, and
   there is no project `.mcp.json`):
   ```bash
   claude mcp add --transport http gravitone http://localhost:<port>/api/mcp --header "Authorization: Bearer <token>"
   ```
   `<port>` is the studio's dev server. Restart Claude Code; `gt_read` and `gt_launch` appear.
3. **The server judges the bearer first**, also on a `NEXT_PUBLIC_DEV_AUTH=1` dev server (the browser is
   the dev owner, you are your token). The local band needs the sample folders
   (`.hackathon/instruments.local.json` or the operator's own) and, for audition previews,
   `GRAVITONE_SAMPLE_ROOTS`.
4. **Check:** `gt_read {op: "audio_inbox", waitS: 0}` answers. A 401 is a wrong or expired token; a
   403 `mcp-needs-token` means no token reached the door (check the `--header` of step 2).

## The loop

1. **Once:** `gt_read {op: "audio_guide"}`. Keep it: the turn rules, the piece and action schemas,
   the score rules and the catalog (`catalog[].fits` = the roles an instrument may play).
2. **Wait:** `gt_read {op: "audio_inbox", waitS: 25}` - the first call without `after` (it answers
   the messages nobody answered yet), every later one with `after` = the last answer's `next`. Pass
   `session` when the operator named one. An empty `messages` is not an error: call again.
3. **For each message**, read `state` (the conversation's newest answer, its `takeId`, its `score`,
   its `stems`, and `nextSeq`) and `pressed` (the proposal the person pressed, when they pressed one).
4. **Decide in plain words for a non-musician.**
   - Two of their words pull different ways ("calm but driving")? Do not guess: answer with a `pull`
     piece (two sides, each with what it means and audio where you have it) and let them settle it.
   - About to swap an instrument? Offer `candidates` first, each with `alone` (an `audio_audition`
     href) and, when you can afford the render, `inMix` audio; swap only after they choose.
   - A message with `mix` is "keep this mix": bake it with `audio_mix` (levelDb -> gainDb; a level
     below -24 dB cannot be baked: mute that track instead and say so).
5. **Act** with the verbs (all $0, all on this machine):
   - `gt_launch {op: "audio_render", spec}` - a ScoreSpec (shape and a worked 8-track example in the
     guide). Up to 8 tracks; a role repeats only when each of its tracks has an `id`.
   - `gt_launch {op: "audio_mix", takeId, tracks: {<trackId>: {gainDb?, pan?, muted?, solo?, enters?}}}`
   - `gt_launch {op: "audio_rewrite", takeId, track, notes | pattern}` - one track; the rest reused bit-exact.
   - `gt_launch {op: "audio_audition", instrumentId}` - a short phrase to hear one instrument alone.
6. **Answer with ONE turn:** `gt_launch {op: "audio_turn", session, turn}` where `turn` is
   `{id?, text, show, actions}` (the door fills `v`, `from`, `at`, `seq`, and `id` if you leave it out;
   give your own `id` when you might retry). `text` is your reply. `show` holds the pieces: usually a
   `track` (the `mixHref`), a `sections` piece (the verb's `sections`) and a `stems` piece. `actions`
   holds 2-5 next steps, each with a `why`. Then read the answer's `dropped`: every piece the door
   could not show, and why. Fix it in your next turn; do not resend the same answer.
   `check: true` judges a turn and appends nothing, for a turn you are unsure of.
7. Back to step 2. **Stop when the operator says stop** (in the terminal or in the dock).

## The rules

- **Never invent an href.** Every audio href in a turn comes from a verb's answer (`mixHref`,
  `stems[].href`, `audio_audition`'s `href`) or from `state`. The door refuses anything that is not
  a path on this server; a palette's `previewFile` is a file on disk, not an href.
- **Stems are pre-fader.** A stem file is the track before its level and pan. Copy each stem's
  `levelDb` and `pan` from the verb's answer into its stems row, or the page plays a different mix
  than the one you rendered. Use the stem's `id` as the row id (it is the track id `audio_mix` and
  `audio_rewrite` take, and the key a "keep this mix" message uses), and carry `enters` when the
  stem has it (one flag per row of your sections piece).
- **Never spend.** No Suno, no ElevenLabs, no live launch. The local band is the only engine here.
- **A refusal is information.** If a verb refuses (a missing sample folder, a note outside the key, a
  level out of range), say so in plain words in your turn and propose the nearest thing that works.
  Pass `allowFallback: true` only when the person agreed to a stand-in synth, and say when a stem
  played one (`fallback: true`).
- **Plain English.** No music theory without a gloss ("a brighter key", not "the relative major"), no
  em dashes, no jargon in labels. Labels are short; `why` is one sentence.

## Worked example (one full exchange)

The person types "something calm to study to, with a soft piano". `audio_inbox` answers
`messages: [{session: "song-k3x9-20261029", seq: 41, turn: {id: "u-...", text: "something calm to study to, with a soft piano"}}]`,
`state: {session: "song-k3x9-20261029", nextSeq: 1}` and `next: 41`.

You render a four-track bed from the guide's rules (calm-bed, 84 BPM, felt piano on chords):

```json
{"op": "audio_render", "spec": {"v": 1, "title": "Quiet Study", "style": "calm-bed", "seed": 7, "tempoBpm": 84, "key": "C major",
  "controls": {"density": 0.4, "brightness": 0.4, "lift": 0.6, "swing": 0.05, "humanise": 0.4},
  "sections": [{"name": "settle", "bars": 4, "energy": 0.3}, {"name": "lift", "bars": 4, "energy": 0.6}],
  "tracks": [{"role": "drums", "instrument": "kit-acoustic-brush", "gainDb": -4, "enters": [false, true]},
             {"role": "bass", "instrument": "sample-mamas-bass", "gainDb": -3},
             {"role": "chords", "instrument": "sample-felt-piano"},
             {"role": "pad", "instrument": "vital-warm-pad", "gainDb": -8}]}}
```

It answers `takeId: "st-abc"`, `mixHref: "/api/sound/takes/st-abc/file"`, `sections`, and four
stems such as `{id: "drums", role: "drums", href: "/api/sound/takes/st-abc/file?stem=drums", levelDb: -4, pan: 0, enters: [false, true], source: "sample-pack", fallback: false}`.
You answer:

```json
{"op": "audio_turn", "session": "song-k3x9-20261029", "turn": {"id": "a-quiet-1",
  "text": "Here is a calm study bed: soft felt piano, a warm pad underneath, and brushed drums that only come in for the second half.",
  "show": [
    {"id": "track", "kind": "track", "takeId": "st-abc", "mix": {"href": "/api/sound/takes/st-abc/file"}, "bpm": 84, "key": "C major"},
    {"id": "sections", "kind": "sections", "rows": [{"name": "settle", "bars": 4, "energy": 0.3}, {"name": "lift", "bars": 4, "energy": 0.6}]},
    {"id": "stems", "kind": "stems", "takeId": "st-abc", "rows": [
      {"id": "drums", "role": "drums", "label": "soft brushed drums", "levelDb": -4, "pan": 0, "enters": [false, true], "audio": {"href": "/api/sound/takes/st-abc/file?stem=drums"}},
      {"id": "bass", "role": "bass", "label": "warm plucked bass", "levelDb": -3, "pan": 0, "audio": {"href": "/api/sound/takes/st-abc/file?stem=bass"}},
      {"id": "chords", "role": "chords", "label": "soft felt piano", "levelDb": 0, "pan": 0, "audio": {"href": "/api/sound/takes/st-abc/file?stem=chords"}},
      {"id": "pad", "role": "pad", "label": "warm background pad", "levelDb": -8, "pan": 0, "audio": {"href": "/api/sound/takes/st-abc/file?stem=pad"}}]}],
  "actions": [
    {"id": "play-all", "kind": "play", "label": "Play it", "node": "track"},
    {"id": "no-drums", "kind": "mute", "label": "Try it without drums", "stem": "drums", "on": true, "why": "some people study better with no beat at all"},
    {"id": "brighter", "kind": "say", "label": "A little brighter", "text": "make it a little brighter and more hopeful", "why": "the bed is quite dark right now"},
    {"id": "longer", "kind": "say", "label": "Make it longer", "text": "make it twice as long", "why": "it is about 25 seconds now"}]}}
```

The answer comes back `{seq: 42, turnId: "a-quiet-1", dropped: [], shown: 3, proposed: 4, appended: true}`.
If the person then presses "A little brighter", the next `audio_inbox` message carries
`turn.action: "brighter"` and `pressed: {kind: "say", text: "make it a little brighter and more hopeful"}`.

## Report (when the operator stops the loop)

Say how many messages you answered, the takes you made (ids and what changed), every refusal a verb
or the door gave (verbatim), and anything left waiting in the inbox.
