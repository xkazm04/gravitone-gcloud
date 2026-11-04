# The agent door: `POST /api/mcp`

Gravitone runs an MCP server inside the Next server, at `POST /api/mcp`. An agent (Athena first) reads
the studio and launches work through it with its own CLI token. The tools call the same server ports
the studio's screens call (`serverProduce()`, `serverPart()`, `serverBoard()`, `serverLibrary()`, the
Ledger's `readPage`). Every write records the agent in the ledger as `{kind: "agent", id: <token name>}`.

- Route: `app/api/mcp/route.ts`, wrapped by `app/_server/route.ts` `route({guard: "access"})`.
- Envelope and dispatch: `app/_server/mcp/rpc.ts`. Who may call: `app/_server/mcp/principal.ts`.
- The one tool registry: `app/_server/mcp/registry.ts`. Its rows are in `app/_server/mcp/tools/{read,steer,launch,job,spend}.ts`,
  and the audio studio's in `app/_server/mcp/tools/{audioStudio,audio}.ts` (see "The audio studio" below).
- How the registry is published: `app/_server/mcp/projection.ts`.

## The rule it holds

An agent never spends. A run or a plan launches dry. It launches live only when the receipt, recomputed
at the call, is free: `isFreeReceipt` in `@gt/domain/mcp` (no dollar, no range above $0, every unpriced
line the Claude seat). Any other live launch is filed as a spend request (`@gt/kernel/spend-requests/store`
`fileSpendRequest`). The request has its own `spend-request.requested` ledger event, written in the same
transaction, and nothing launches. The operator confirms or refuses it on the Board packet
`/board/pkt:spend:<day>`. The agent reads the verdict with `gt_spend`.

Part acts run dry for every caller (`app/(studio)/projects/[id]/_part/real.ts` arms no live act). Retrying
or re-routing a job that carries a live arm belongs to the operator. The door refuses both by name:
`retry of a live job is the operator's (Runs)`.

## Token scope

An agent reaches `/api/mcp` with its own CLI token, scope `act`, minted by the operator:

```bash
node pipeline/token.mts mint --name athena --scope act [--ttl 30d]
```

The token prints once, on stdout, after its row and its `token.mint` event commit. Put it in the agent's
`GRAVITONE_CLI_TOKEN` and send it as `Authorization: Bearer $GRAVITONE_CLI_TOKEN`. It lives 30 days by
default and 90 at most. When it runs out, mint a new one.

| scope   | read doors | act doors (non-spending writes) | money doors |
|---------|------------|---------------------------------|-------------|
| `money` | admitted   | admitted                        | admitted    |
| `act`   | admitted   | admitted                        | 403 `token-scope` |
| `read`  | admitted   | refused                         | 403 `token-scope` |

`act` admits reads, dry runs, live runs whose recomputed receipt is free and spend requests. Every money
door refuses it. On `/api/mcp`, a `money` token gets the same `act` limits: the surface holds the rule,
not the scope. A `read` token can read here. Its write calls are refused in-band
(`gt_job cancel writes, and token <name> has scope read ...`, reason `token-scope`).

To see tokens, run `node pipeline/token.mts list`. To withdraw one, run
`node pipeline/token.mts revoke <id> --reason "<why>"`. A revocation is final and takes effect on the next
request. Tokens are never deleted, so the list stays an inventory.

## Who may call

| request | answer |
|---|---|
| no credential, or an expired or unknown token | 401 `unauthenticated` (route()'s guard) |
| an `Origin` header whose host is not `localhost`, `127.0.0.1` or `[::1]` | 403 `refused`, `mcp: origin <o> is not this machine` |
| a session cookie, the legacy shared secret, the dev fixture, the local owner | 403 `refused`, detail `mcp-needs-token` |
| a CLI token (`gt_...`) | admitted |

## Protocol

The server is stateless, Streamable HTTP, and hand-rolled (no SDK at runtime). Each POST carries one
JSON-RPC 2.0 message and gets an `application/json` answer. There are no sessions and no SSE. A `GET` gets
Next's 405, which an MCP client reads as "no stream offered".

| method | answer |
|---|---|
| `initialize` | `protocolVersion`: the client's if it is `2025-11-25`, `2025-06-18` or `2025-03-26`, else `2025-11-25`; `capabilities: {tools: {listChanged: false}}`; `serverInfo: {name: "gravitone", version}`; `instructions` |
| `notifications/*`, or any message with no `id` | 202, no body |
| `ping` | `{}` |
| `tools/list` | every tool of the projection, in one page |
| `tools/call` | the tool result |

Errors come back on two channels:

- **The message is wrong:** JSON-RPC errors. `-32700`: the body is not JSON. `-32600`: not a request, or a
  batch (`batch requests are not supported`). `-32601`: unknown method. `-32602`: params the envelope
  refuses, an unknown tool, or an unknown op (the error names the known ones).
- **The work is wrong:** a tool result with `isError: true` and
  `structuredContent: {code, detail, reason?, fresh?}`. This covers args an op's own zod door refuses
  (`invalid`), a stale receipt (`stale`, with `fresh`), a conflict, a refusal and a missing thing.

A successful result is `{content: [{type: "text", text: <JSON>}], structuredContent: <the value>}`. Where a
screen shows the thing, the value carries `view`, a deep-link path: `/projects/<id>`,
`/projects/<id>/<part>`, `/projects/runs?job=<id>`, `/board/<packet>`, `/library?sel=<id>` or
`/ledger?ev=<seq>`. A cut listing says `truncated: true` and gives `next` (an `offset`, a ledger
`cursor`, or an `after` seq).

## Projections

`GRAVITONE_MCP_PROJECTION` is read once when the server starts. It is server-only.

- `family` (default): five tools, `gt_read`, `gt_launch`, `gt_job`, `gt_spend` and `gt_songlab`. Each takes
  `{op, ...args}`. Its `inputSchema` is a JSON-Schema `oneOf` over its ops, discriminated by `op`. Its
  annotations are the most severe of its ops'.
- `operation`: one tool per op, `gt_<family>_<op>` (44 today).

A family tool's description is its lead plus its op names, and it must stay within 240 characters. The read
and launch leads were cut short for the audio ops: a new op in either family needs a shorter lead or a
shorter name.

Both projections resolve to the same registry row and run the same handler with the same args. The
results and the ledger events are identical.

## Ops

| family | op | args | writes |
|---|---|---|---|
| read | `projects` | - | |
| read | `plan` | `id` | |
| read | `jobs` | `project?`, `state?`, `offset?`, `limit<=100` | |
| read | `holds` | - | |
| read | `packets` | `state?` (open, committed, returned), `limit<=100` | |
| read | `packet` | `id` | |
| read | `library` | `kind?`, `q?`, `sort?`, `offset?`, `limit<=50` | |
| read | `library_item` | `id` | |
| read | `ledger` | `q?`, `actor?` (operator, agent, machine), `type?`, `project?`, `from?`, `to?` (YYYY-MM-DD), `cursor?`, `limit<=200` | |
| read | `events_after` | `after` (seq), `limit<=200` | |
| read | `composer_choices`, `compose_choices` | - | |
| read | `steer` | `sentence`, `shape?`, `length_s?` | |
| read | `audio_inbox` | `session?`, `after?` (seq), `waitS?` (0..25): a long-poll | |
| read | `audio_guide` | - | |
| read | `audio_palette` | `mood?`, `use?`, `energy?`, `limit?` | |
| read | `audio_compile` | `intent` | |
| read | `intent_steer` | `intent`, `complaints` (1..6) | |
| launch | `composer_receipt` | `input` (composer estimate), `mode?` | |
| launch | `composer_run` | `input`, `mode?`, `token?`, `ceilingUsd?` | yes |
| launch | `compose` | the Compose input (`recipe`, `title?`, `styleId?`, `takeId?`, `topic?`, `units?`) | yes |
| launch | `set_part` | `id`, `rev`, `partId`, `patch` | yes |
| launch | `rename` | `id`, `rev`, `title` | yes |
| launch | `plan_receipt` | `id`, `mode?` | |
| launch | `plan_launch` | `id`, `rev`, `mode?`, `token?`, `ceilingUsd?` | yes |
| launch | `discard` | `id`, `rev` | yes |
| launch | `part_receipt` | `projectId`, `key`, `act`, `target?` | |
| launch | `part_act` | `projectId`, `key`, `act`, `target?`, `token` | yes |
| launch | `audio_turn` | `session`, `turn`, `check?` | yes |
| launch | `audio_render` | `spec` (a ScoreSpec), `allowFallback?` | yes |
| launch | `audio_mix` | `takeId`, `tracks` (by track id: `gainDb?`, `pan?`, `muted?`, `solo?`, `enters?`) | yes |
| launch | `audio_rewrite` | `takeId`, `track`, `notes?` or `pattern?` | yes |
| launch | `audio_audition` | `instrumentId` | yes |
| job | `status`, `reroute_options` | `jobId` | |
| job | `pause`, `resume`, `retry`, `cancel` | `jobId` | yes |
| job | `move` | `jobId`, `dir` (earlier, later) | yes |
| job | `reroute` | `jobId`, `option`, `token?` | yes |
| job | `ack_lane` | `lane` | yes |
| spend | `list` | `state?`, `day?`, `limit<=100` (this token's own requests) | |
| spend | `get` | `id` (`sr_` + 12 hex; any state, with reasons, note, jobIds, failure) | |

How `composer_run` and `plan_launch` decide:

- The receipt is recomputed for the requested `mode`. A `token` is optional. If the agent sends one that
  no longer matches, the call answers `stale` with the fresh receipt.
- `plan_launch` also answers `stale` when the plan's revision has moved past `rev`.
- `mode: "dry"`: the run or plan launches dry, as the agent.
- `mode: "live"` with a free receipt: it launches live, as the agent, on that receipt's token.
- `mode: "live"` otherwise: `{kind: "spend-requested", requestId, day, receipt, view: "/board/pkt:spend:<day>"}`,
  and nothing launches.
- In a process started with `GRAVITONE_DRY_ONLY=1`, a live receipt cannot be read at all, so the call is
  refused in-band.

What the kernel refuses an agent, in the kernel's own words: a retry of a failed or interrupted job
(`only an operator retries ...`), a re-route that requeues a failed or interrupted job, and the
acknowledgement of a held lane.

## The audio studio

The studio at `/audio?s=studio` is a conversation between a person and an outside agent: Claude Code's
`/studio-agent` skill (`.claude/skills/studio-agent/SKILL.md`). The person's dock message is an `audio.say`
ledger event. The agent's answer is an `audio.turn` event. Both name the subject `{kind: "studio-session",
id: <session>}` on lane `audio`, and both are read through the one studio event door
(`@gt/domain/audio.studio.events` `parseStudioEvent`).

- `audio_inbox` is a long-poll. It holds the call up to `waitS` seconds (at most 25) and checks the ledger every
  500 ms until a message newer than `after` exists. With no `after`, it answers the messages no agent turn has
  followed yet. Its answer holds `messages` (`{session, seq, at, turn, pressed?}`, where `pressed` is the agent
  action the person pressed), `sessions` (`{id, title, lastSeq, waiting}`), one conversation's `state`
  (`latestAgentTurn`, `takeId`, `score`, `stems`, `nextSeq`, and the Suno advisor's `takes` and `taste`, below)
  and `next`, the `after` for the next call. It writes nothing.
- Presence is the token's `lastUsedAt`, which every call stamps (at most once a minute). The dock says
  "listening" while the act token named `studio-agent` (`GRAVITONE_STUDIO_AGENT_TOKEN_NAME`) was used within 90 s.
- `audio_guide` is the vocabulary a turn may use. It is derived from the registry that the turn door and the
  score engine read: every piece kind and action kind with its JSON Schema, the roles and caps, the door's
  cross-piece rules, the ScoreSpec schema and a worked example, and the instrument catalog with the roles each
  instrument fits (`audio.roles.json`). Nothing in it is written beside the registry.
- `audio_turn` holds an agent turn to the door and appends it once under its id. It fills `v`, `from`, `at`,
  `seq` and `id` when the agent leaves them out; a retry under the same id is filled from the held turn, so it
  appends nothing twice. Other content under a used id is a `conflict`. A user turn is refused. A conversation
  with no message yet is `not-found`. The answer is `{seq, turnId, dropped, shown, proposed, appended}`:
  `dropped` names each piece the door could not show and why. `check: true` judges the turn and appends nothing.
- `audio_render`, `audio_mix`, `audio_rewrite` and `audio_audition` run the local band on this machine for $0
  (`lib/sound/localScore.ts`, `lib/sound/localScoreVerbs.ts`). Each files a new take; a mix or a rewrite is the
  parent take's child. The first three answer `{takeId, title, mixHref, bpm, key, sections, stems, lufs,
  durationS, triageFlagged, reusedIds, renderedIds}`. Each stem is `{id, role, href, instrument, source,
  fallback, levelDb, pan, enters?, reused}`. `audio_audition` answers `{href, source, fallback}`.
- Stems are pre-fader. A stem file is the track before its level and pan, so a turn's stems row carries the
  `levelDb` and `pan` the verb answered, and the page then plays what the mix holds.
- A missing sample folder or plugin is refused by name unless `allowFallback: true`. A take made with stand-ins
  passes that consent to its remixes. A stand-in stem says `fallback: true`, and the answer says so in words.
- `audio_mix` clamps nothing. A level outside -24..12 dB or a pan outside -1..1 is refused in words, and
  nothing is remixed.
- `audio_palette`, `audio_compile` and `intent_steer` were ported from hackathon entry e4. `intent_steer` is e4's
  `audio_steer`, renamed because `read.steer` is the composer's sentence compile. A palette instrument's
  `previewFile` is a file under `GRAVITONE_SAMPLE_ROOTS` for the operator's own player. It is not an href.

A presented CLI token is judged before the dev fixture (`lib/apiAuth.ts` `resolvePrincipal`), so an agent can
drive the studio on a `NEXT_PUBLIC_DEV_AUTH=1` dev server too: the browser is the dev owner, the agent is its token.

### The Suno advisor (spark suno-advisor)

The agent can also write prompts the person generates on suno.com by hand. The studio never drives
suno.com and never fetches audio from Suno: the person pastes the prompt and, when they choose, uploads the
mp3 they downloaded. The skill's "Suno advisor mode" is the agent's side.

- Two piece kinds (schemas in `audio_guide`, `@gt/domain/audio.studio`). `suno_prompt` is a prompt card:
  `promptId`, `parent?`, `name?`, `style` (1..1000), `lyrics?` (..5000, line breaks kept), `exclude?` (..1000),
  `instrumental`, `model` (`v6`, `v6-wild` or `v6-mini`), `settings` (`weirdness`, `styleInfluence`, `variety`,
  integers 0..100), `changes?` (`{field, was?, now, why}`, at most 8) and `because?`. A field past its cap is
  refused, not cut. The door refuses a card whose `parent` is its own `promptId` and a card with `changes`
  but no `parent`. `taste` proposes 1..8 rows `{id, line (..120), lean: "like" | "dislike"}` with unique lines.
  A `track` may carry `answers: {promptId, as: "sketch" | "suno", clip?: "a" | "b"}`.
- Two user-turn fields, dropped (and named in `dropped`) from an agent turn. `verdict` is
  `{promptId, clip: "a" | "b" | "both", keep?, off?}`, where `off` lists any of `tempo`, `energy`, `vocals`,
  `instruments`, `structure`, `mix`, `mood` or `lyrics`. `takeId` is a take the person uploaded through
  `POST /audio/studio/take`.
- `audio_inbox` `state.takes` maps each `takeId` the conversation's user turns name to its facts:
  `{takeId, name, durationS, href, promptId?, clip?, measured: {bpm?, bpmAlt?, key?, keyStrength?, lufs?,
  truePeakDb?, lra?}, listened?, listenUsd?}`. `measured` comes from this server, for $0. `listened` is a
  Gemini audio model's read (`{model, at, standIn?, genre, mood, bpm?, key?, vocals, instruments, sections}`).
  It exists only when the person pressed Listen, and the page marks it unconfirmed. `standIn: true` marks a
  dry run that heard nothing. `listenUsd` is the quoted price of a listen; with no price row it is omitted and
  Listen refuses. `state.taste` holds the confirmed taste lines `{line, lean, since}`, folded from
  `audio.taste` events (subject `{kind: "studio-taste", id: "owner"}`, lane `audio`; the last keep or drop
  of a line wins). `takesNote` and `tasteNote` say what could not be read.
- The agent writes no taste and runs no listen. Keep, drop and Listen are the person's Server Actions
  (`app/(studio)/audio/studio/_live/sunoActs.ts`). A listen is a priced `suno-listen` text turn
  (`lib/sound/suno/listen.ts`) with a kernel receipt, and `GRAVITONE_DRY_ONLY=1` makes it a stand-in.

## Tests

- `tests/next-server/mcp-audio.test.ts`: every audio op through the JSON-RPC layer over an in-memory kernel, with
  the engine faked at its module seam. It covers the long-poll (a message filed during the wait, `waitS: 0` at
  once), `audio_turn` (a user turn refused, dropped pieces reported, a retry appended once) and a guide that
  lists every kind in the registry. `tests/next-server/audio-preview.test.ts` covers the palette's previews.
  `tests/next-server/suno-listen.test.ts` covers the listener (quote, unpriced refusal, dry stand-in, a valid and
  an invalid read from a fake provider, the receipt, the inline audio part, the CRLF prompt), and
  `tests/next-server/studio-taste.test.ts` covers the taste writes.
- `tests/next-server/mcp-registry.test.ts`: the registry's rules and both projections.
- `tests/next-server/mcp-door.test.ts`: the envelope, who may call, scope, the live rule (with seeded
  receipts at the handler seam), the job refusals, cancel's ledger actor, and byte-identical results
  across projections.
- `tests/golden-path/mcp-conformance.probe.spec.ts`: the official SDK client (`@modelcontextprotocol/sdk`
  1.32.2, a devDependency imported only there) completes initialize, lists the tools and calls
  `gt_read projects`. It reaches the route's own `POST` through a fetch shim that answers any other
  method 405.

## The song lab (spark yue2-song-lab)

The song lab runs YuE2-3B (open weights) on this machine's card in WSL, for $0. Its six ops are their own
family, `gt_songlab`, because the read and launch tools' descriptions are at the 240-character limit. In the
operation projection they are `gt_songlab_launch`, `gt_songlab_takes`, `gt_songlab_queue_pairs`,
`gt_songlab_post`, `gt_songlab_inbox` and `gt_songlab_turn`. The family projection therefore publishes five
tools. The `gt_songlab` description is 163 of 240 characters.

| family | op | args | writes |
|---|---|---|---|
| songlab | `launch` | `style`, `lyrics`, `seeds?` (1..16), `cot?`, `cfg?`, `adapter?`, `adapterStrength?` | yes |
| songlab | `takes` | `limit?` (1..200, default 50) | |
| songlab | `queue_pairs` | `source` (`post-variant`, `best-of-n`, `across-conditions`), `limit?` (1..20, default 4) | yes |
| songlab | `post` | `takeId`, `stages` (in order: `stems`, `debuzz`, `master`), `referenceTakeId?` | yes |
| songlab | `inbox` | `session?`, `after?` (the last answer's `next`), `waitS?` (0..25) | |
| songlab | `turn` | `session`, `turnId?`, `answers?`, `line`, `ran?`, `learned?`, `proposals?` (0..3), `check?` | yes |

- `launch` enqueues one `yue2-render` job on `gpu.local` and answers `{jobId, receipt, view}`. The receipt is
  $0. An absent `cot`, `cfg` or `seeds` is the measured recipe (`YUE2_RECIPE`: cot `off`, cfg 1.5, seeds 1..8).
  The worker renders one take per seed and then hands every take the batch filed to one `yue2-score` job.
  Each take is filed with `origin: "agent"`.
- `takes` lists the newest YuE2 takes, newest first. Each row is `{takeId, title, href, createdAt, parentId?,
  facts, scores?, gated?}`. `facts` holds the condition, style, lyrics digest, length, rights and lineage; the
  lyrics themselves are left out. `scores` is the newest scorer's row (`wer`, `werSd`, `per`, `songEval`,
  `aesthetics`, `buzzIdx`, `transcript`); a metric that was not computed is absent, and an unscored take has
  no `scores`. `gated` is `wer <= gate.max`. The answer also carries `rights`, the CC BY-NC 4.0 line that
  every YuE2 take carries. The rights policy is warn-only: it is shown, and nothing is blocked.
- `queue_pairs` queues blind pairs of one source for the owner (`lib/yue2/ab.ts`). It then enqueues one
  `yue2-post` ab-window job per arm, which cuts a 25 s loudness-matched window from the first vocal onset into
  `<sound store>/yue2-ab/<pairId>-<arm>.flac`. The answer is `{pairs: [{pairId, jobIds}]}`. It never says which
  take plays as A.
- `post` enqueues one `yue2-post` chain job. The chain files a new take whose parent is the source, with the
  source's facts and a lineage of `{sourceTakeId, postStages, referenceTakeId?}`, and then hands it to scoring.
  `master` with a `referenceTakeId` matches that reference (Matchering), then limits to -14 LUFS / -1 dBTP. A
  reference is uploaded by the person through `POST /audio/songlab/reference`.
- There is no vote op. A blind pair's verdict is the owner's, recorded through the song lab's Server Action
  (`app/(studio)/audio/_songlab/acts.ts` `voteAb`).
- A WSL that is down, a missing venv or a script's own refusal fails the job's step with the engine's
  sentence verbatim (`gt_job status`). No take is filed for a render that did not happen.
- Tests: `tests/next-server/yue2-mcp.test.ts` (the family, no vote, keep or drop tool, each op through the
  JSON-RPC layer), `tests/next-server/yue2-producers.test.ts` (the three producers over a faked WSL door),
  `tests/next-server/yue2-lab-relay.test.ts` (say, turn, inbox long-poll, the compose read isolated) and
  `tests/next-server/yue2-proposals.test.ts` (keep and drop over faked acts).

### The lab's agent relay (S2)

The song lab tab has its own conversation with the outside agent (`/studio-agent`, song-lab mode), built on
the compose studio's relay but on its OWN event types, so a lab message never appears in the compose
conversation list (the compose page reads `audio.say`/`audio.turn` by type with no subject filter). Code:
`lib/yue2/labRelay.ts` and `lib/yue2/proposals.ts`; doors: `@gt/domain/audio.yue2.lab.schema`.

- The owner's one-line direction is an `audio.lab.say` event (subject `songlab-session`, lane `audio`, key
  `audio-lab-say:<turnId>`), filed by the Server Action `labSay`. A turn id is `u-<time36>-<4>`; a direction
  without a session opens one (`lab-<4>-<yyyymmdd>`).
- `inbox` long-polls like `audio_inbox`: up to `waitS` seconds, every 500 ms, for directions newer than
  `after`; with no `after`, the unanswered ones. A turn whose `answers` names a direction answers it and
  every earlier direction of its session; a turn without `answers` (opened after background work) answers
  nothing. The answer is `{says, next, session?, proposals, draws | drawsNote, view}`: `proposals` are the
  session's newest three turns' proposals with `state` `kept` or `dropped` once the owner decided, and
  `draws` are the knockout draws' newest versions (`drawId`, `version`, `field`, `size`, `entrants`,
  `rules`), which a `rule` proposal names. Pass `next` back as `after`.
- `turn` files one `audio.lab.turn` (key `audio-lab-turn:<turnId>`): `line` (one line), `ran` and
  `learned` (up to 6 each), and up to 3 proposals from the closed set `rule` (`{drawId, rules}`), `launch`
  (`{style, lyrics, seeds, cot, cfg?, adapter?, adapterStrength?}`) or `post` (`{takeIds, stages,
  referenceTakeId?}`), each with `id`, `label` and `why`. The door fills `turnId` and `at` when they are left
  out. A bad envelope refuses the whole turn; a bad proposal (or one whose `id` another turn already holds)
  is dropped and named in `dropped`. A session with no direction refuses the turn. A retry under the same
  `turnId` appends nothing twice; other content under it is a conflict. `check: true` appends nothing.
- There is no keep, drop or vote op. The owner keeps or removes a proposal through the Server Actions
  `keepLabProposal` / `dropLabProposal`. A keep runs the act first (`launch` -> one `yue2-render` job,
  `post` -> one `yue2-post` chain per take, `rule` -> a new draw version) and then files `audio.lab.keep`
  (key `audio-lab-keep:<proposalId>`) with `started`: the job id, the post jobs as a range
  (`job:yue2-post:lab-<id>-1..<n>`) or `draw:<drawId>:v<version>`. A refused act files nothing and its
  refusal is returned verbatim. A second keep is a conflict; a kept proposal cannot be removed, and a removed
  one cannot be kept. A keep's jobs have ids derived from the proposal, so a keep retried after a failure
  part-way does not enqueue a job twice.
