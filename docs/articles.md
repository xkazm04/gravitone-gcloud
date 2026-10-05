# Articles: a technical post from a registry topic to a registry PR

`lib/articles/` turns a topic into one technical blog post: live-web research, an outline, a
draft and a deterministic check, then a stop at the human gate. On approval, deterministic code
writes the post into ai-registry as a structured publication with any approved registry patches,
runs the registry's gates, pushes a branch, opens a PR, and builds a paste-ready Medium package.
Nothing is ever sent to Medium.

The post standard is registry content, not this repo's: the `technical-blog-post-authoring`
recipe and the `technical-writing` knowledge bundle. The prompt references it by address and
inlines what it resolves on every run.

## The run

```
queued -> researching -> drafting -> checking -> awaiting-approval -> approved -> landing -> landed
            research     outline,draft  check     (human gate)     \-> rejected
any working state -> failed -> resume -> the state whose step did not finish
```

The statuses and their legal moves live in `lib/articles/store.ts` (`TRANSITIONS`), and
`updateRun` refuses an illegal move before it writes. `landing` is reachable only from
`approved`; `approved` only from `awaiting-approval` (the human) or from `failed` when the
failure was in landing (a resume re-lands; it never re-approves).

A run is a directory, `foundry-out/articles/<runId>/` (`ARTICLES_STORE_DIR` overrides the root).
The publish store's conventions apply: JSON written tmp + rename, a per-run exclusive lock file
for every read-modify-write, and a corrupt `run.json` is refused, never replaced.

| File | Written by | What |
|---|---|---|
| `run.json` | engine | `ArticleRun` (`lib/articles/types.ts`) |
| `sources.json`, `claims.json` | research turn, validated | numbered, dated sources; claims each carried by one source |
| `outline.md` | outline turn | sections, figures plan, closing |
| `post/index.html`, `post/post.md`, `post/meta.json`, `post/figures/NN-*.svg` | draft turn | the page, the Medium-ready Markdown, title/subtitle/tags, figures |
| `patches.json`, `patches/<id>.patch` | engine, from the draft turn's proposals | registry patches offered at the gate; the diff is computed by code |
| `patches.rejected.json` | engine | proposals refused (outside `knowledge/`/`recipes/`, no source, identical) |
| `check.json`, `check/*.png` | check step | the deterministic report and screenshots at 390 and 1440 px (and 1440 dark) |
| `agent/<step>.json`, `agent/<step>-prompt.md` | engine | each agent turn's outcome, turns, cost and the exact prompt sent |
| `agent/<step>-out/` | engine | a failed turn's `out/`, kept for inspection |
| `medium/` | landing | `story.html`, `tags.txt`, `README.md`, `figures/*.png` |
| `landing.log` | landing | the registry gates' output |
| `.lock`, `.driver` | store | the write lock and the one-driver lease |

## The agent seam

`lib/agent/cliSeam.ts` is a second spawn door beside `lib/claudeCli.ts`, and deliberately a
separate one: the reasoning door takes every tool away, this one grants a closed few. Each of the
three turns runs `claude -p` headless, with no shell, in an isolated workspace (a temp directory
that holds only `inputs/` and `out/`; the seam refuses one that holds anything else):

- tools: research gets `WebSearch WebFetch Read Write Edit`; outline and draft get
  `Read Write Edit` (no web). `--tools` limits what exists, `--allowed-tools` pre-approves the
  same list, `--permission-prompts none` denies anything else. No Bash.
- isolation: `--restricted` (file tools confined to the workspace, settings files ignored),
  `--safe-mode` (no CLAUDE.md, skills, plugins, hooks, MCP), `--strict-mcp-config`,
  `--disable-slash-commands`, `--no-session-persistence`.
- credentials: the child gets `seatOnlyEnv()` from `lib/claudeCli.ts`, so a metered API key in the
  environment cannot move the run off the operator's seat.
- outcomes: `completed | timed-out | errored | seat-limit`, classified as the contest runner does.

The flags were read off `claude --help` and parse together on the installed binary (checked with
an empty prompt, which spends nothing). Their combined behaviour in a real session is proven only
by a real run.

Call-site labels: `article-research` and `article-draft` (`AgentTurnClass` in the seam), declared
in `.ai/use-cases.json` as `text.article-research` and `text.article-draft`. They are not members
of `lib/text/types.ts` `TurnClass`, because that union keys the reasoning router's plan table and
these turns can never route there.

`ARTICLES_AGENT_BIN` replaces the binary (`|`-separated argv). The probes and every dry run use
`node|tests/fixtures/articles/stub-agent.mjs`, which writes canned, check-passing files and
spends nothing.

## The standard, by address

`lib/articles/registryRead.ts` finds the registry (`$AI_REGISTRY_DIR`, else `.ai/manifest.yaml`
`registry.local`, else `../ai-registry`; an explicit `$AI_REGISTRY_DIR` that is wrong is an error,
not a reason to look elsewhere) and reads:

- `recipes/index.json` -> `recipes["technical-blog-post-authoring"]` -> its `recipe.json` and version
- `knowledge/technical-writing/index.json` -> every `subjects[slug].file` (golden paths) and `laws`

The prompt (`pipeline/ARTICLE-POST-PROMPT.md`, sections `shared | research | outline | draft`)
carries tone, structure and the output contract; the standard arrives through its `{{STANDARD}}`
slot. The run records the prompt's sha256, the recipe version and a sha256 of the bundle index.
The standard is re-resolved before every agent turn. An unreachable registry fails the run with
`registry-unreachable: …`; there is no cached standard.

For a registry-subject topic (`<bundle>/<slug>`) the subject's golden path is the research brief's
background; it contains no external facts, and the post's facts come from research.

## The check

`lib/articles/checks.ts`, no model. Seven dimensions; each item states what it measured and the
bar (`THRESHOLDS`, which also fills the prompt's numbers, so the agent is asked for what it is
measured against):

| Dimension | Measured |
|---|---|
| structure | content preview before the first `<h2>` with a read time and the sections; declared read time against the word count; no placeholders |
| figures | at least 5 `<figure>`s, every one captioned, every caption citing a source that exists, images resolving inside the post, label-length text inside the SVGs |
| voice | first-person words in prose (outside code and quotes) |
| medium-fidelity | no network resources (static and rendered), highlighted code, a dark scheme, smallest body type at 1440 (>= 18 px) and 390 (>= 17 px), smallest caption/chrome type (>= 13 px), no sideways scroll at 390 |
| truth | >= 8 sources, >= 3 primary, >= 1 counter; every source dated with an http(s) URL; every `[n]` resolves; every claim's source exists |
| storytelling, depth | not measured: the human's judgement, reported as such and never as a pass |

The rendered items open `post/index.html` in Playwright's chromium with every http(s) request
aborted and counted. A failed item does not stop the run; the report goes to the gate, failures
first.

## The gate and landing

Approval is per post and per patch: `approve <runId> --patches p1,p2` (or the gate's Approve with
the patch selection) records `approval {at, patches}`, then the engine lands
(`lib/articles/registryWrite.ts`):

1. `git fetch origin` in the registry; a worktree on `article/<slug>` off the remote's default branch
2. `publications/<slug>/`: `publication.json` (`publication/1`), `post.html`, `post.md`,
   `SOURCES.md`, `figures/*.svg`, `medium/{story.html,tags.txt,README.md}`. The figure PNGs stay in
   the run: the registry is a text-only repository.
3. `git apply` each approved patch, after checking it touches only `knowledge/` or `recipes/`
4. for `publications` and each touched lane: `node scripts/gate.mjs --lane L --write` (generators),
   then `--lane L` (check)
5. commit with the registry checkout's configured identity (`ARTICLES_GIT_AUTHOR`, when set, must
   match `user.name`), push, `gh pr create`

Any failure leaves the branch local and unpushed (on a gate failure the worktree is kept and named
in `run.landing.worktree`), writes `landing.log`, and sets `failed`. No PR is opened from a red
tree. Credentials are the operator's existing git and gh logins; nothing is stored.
`ARTICLES_GH_BIN` replaces `gh` (the probes use `tests/fixtures/articles/stub-gh.mjs`).

## Headless

```bash
npx tsx pipeline/article.mts run (--subject <bundle/slug> | --topic "<text>") [--angle "<text>"] [--model <id>] [--effort <level>] [--json]
npx tsx pipeline/article.mts status [<runId>] [--json]
npx tsx pipeline/article.mts approve <runId> [--patches p1,p2] [--json]
npx tsx pipeline/article.mts reject <runId> --note "<text>" [--json]
npx tsx pipeline/article.mts resume <runId> [--json]
```

Exit 0 ok, 1 the run stopped somewhere else or the operation failed, 2 usage. `--json` prints one
document on stdout; the per-turn `[agent]` log lines go to stderr. The `article-run` skill wraps
`run` and `status` only and never approves.

A dry run against a throwaway registry, spending nothing:

```bash
node tests/fixtures/articles/registry-fixture.mjs <scratch>/reg
AI_REGISTRY_DIR=<scratch>/reg/registry ARTICLES_STORE_DIR=<scratch>/store \
  ARTICLES_AGENT_BIN="node|tests/fixtures/articles/stub-agent.mjs" \
  npx tsx pipeline/article.mts run --subject software-engineering/token-budgeting --json
```

## For the routes and the /articles surface

The engine exports what the routes call, so the CLI and the UI cannot disagree:
`createRun`, `driveRun` / `launchRun` (fire-and-forget for a route), `getRun`, `getRunDetail`
(run, sources, claims, outline, meta, check, patches with their diffs, post path),
`listArticleRuns`, `approveRun`, `rejectRun`, `resumeRun`; `listTopicSubjects` (registryRead) feeds
the topic picker. All of `lib/articles/` except `types.ts` is server-only; a client component may
import `lib/articles/types.ts` and nothing else.

Routes (contract): `POST /api/articles`, `GET /api/articles`, `GET /api/articles/[runId]`,
`POST /api/articles/[runId]/approve` `{patches:[id]}`, `POST /api/articles/[runId]/reject` `{note}`,
`POST /api/articles/[runId]/resume`. Errors are `ArticleError` with an HTTP-shaped `status` and a
closed `code`.

## Probes

`tests/golden-path/articles-{store,checks,registry,engine}.probe.spec.ts`, offline, against
`tests/fixtures/articles/registry-fixture.mjs` (a bare origin plus a clone), the stub agent through
the real seam, and a stub `gh`. They never name the real registry.
