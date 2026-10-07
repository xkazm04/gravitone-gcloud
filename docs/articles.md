# Articles: a technical post from a registry topic to a registry PR

`lib/articles/` turns a topic into one technical blog post: live-web research, an outline, a
draft, a multi-model critique, and a deterministic check, then a stop at the human gate. On approval, deterministic code
writes the post into ai-registry as a structured publication with any approved registry patches,
runs the registry's gates, pushes a branch, opens a PR, and builds a paste-ready Medium package.
Nothing is ever sent to Medium.

The post standard is registry content, not this repo's: the `technical-blog-post-authoring`
recipe and the `technical-writing` knowledge bundle. The prompt references it by address and
inlines what it resolves on every run.

## The run

```
queued -> researching -> drafting -> critiquing -> checking -> awaiting-approval -> approved -> landing -> landed
            research     outline,draft  critique      check     (human gate)     \-> rejected
any working state -> failed -> resume -> the state whose step did not finish
```

The statuses and their legal moves live in `lib/articles/store.ts` (`TRANSITIONS`), and
`updateRun` refuses an illegal move before it writes. `landing` is reachable only from
`approved`; `approved` only from `awaiting-approval` (the human) or from `failed` when the
failure was in landing (a resume re-lands; it never re-approves). `checking` is reachable only
from `critiquing`: no draft reaches the check unreviewed.

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
| `critique/reviewers.json` | engine | the reviewer panel, snapshotted when the critique began |
| `critique/round-<n>/reviews/<id>.json` | reviewer, validated | one review per completed reviewer |
| `critique/round-<n>/receipts/<id>.json` | engine | each reviewer's outcome, attempts, turns, cost when reported, errors, files it wrote |
| `critique/round-<n>/prompts/<id>.md` | engine | the exact review prompt sent |
| `critique/round-<n>/closed.json` | engine | the round reached quorum |
| `critique/round-<n>/{dispositions,decision}.json` | writer, validated | one disposition per finding; `{round, decision, rationale}` |
| `critique/round-<n>/{researched,revised}.json` | engine | the writer researched again / revised the post after this round |
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

Call-site labels: `article-research`, `article-draft`, `article-review` and
`article-critique-writer` (`AgentTurnClass` in the seam), declared in `.ai/use-cases.json` as
`text.<label>`. They are not members of `lib/text/types.ts` `TurnClass`, because that union keys
the reasoning router's plan table and these turns can never route there.

`ARTICLES_AGENT_BIN` replaces the claude binary (`|`-separated argv; the writer and claude
reviewers), and `ARTICLES_CODEX_BIN`, `ARTICLES_GROK_BIN`, `ARTICLES_AGY_BIN` replace the other
three. The probes and every dry run use `node|tests/fixtures/articles/stub-agent.mjs`, with
`|--as=<engine>` for the reviewers so the stub answers in that engine's envelope. It writes canned,
check-passing files and spends nothing.

### Reviewers: four engines, read-only

The critique's reviewers run through `runReviewer` in the same seam, on the operator's own CLI
logins. A reviewer's workspace holds only a copy of `post/`, `sources.json` and `REVIEW.md` (the
full prompt); the seam refuses one that holds anything else. The review comes back as one JSON
object in the final message. Nothing a reviewer leaves on disk is read back; the engine records
any file it wrote in its receipt (`wrote`). The environment is the writer's metered-key strip plus
every variable whose name looks like a credential (`KEY`, `SECRET`, `TOKEN`, `PASSWORD`,
`CREDENTIAL`, `AUTH`).

| Engine | argv after the binary | Prompt | Proven on 2026-10-05 |
|---|---|---|---|
| claude | the writer's fence above with `--tools WebSearch,WebFetch,Read` (no Write, no Edit) | stdin | flags parse together (empty-prompt check, nothing spent) |
| codex | `exec --json --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules -C <ws> --sandbox read-only -m <model> -c model_reasoning_effort="<e>" -c web_search="live" -` | stdin | one-line probe: the page opened through `web_search` and a file write was "blocked by policy" in the same session. `max` is sent as `xhigh` |
| agy | `-p <pointer> --model <model>-<tier> --output-format json --dangerously-skip-permissions --sandbox --disable-slash-commands --print-timeout <n>m`, stdin closed empty, cwd = the workspace | pointer to REVIEW.md | without `--dangerously-skip-permissions` headless mode auto-denies `read_url` (empty answer). With it, `--sandbox` combines, but neither `--sandbox` nor `--mode plan` stopped a write INSIDE the workspace. agy is read-only by isolation, not by flag. The full argv parses (empty-prompt check) |
| grok | `-p <pointer> -m <model> --effort <e> --output-format json --cwd <ws> --permission-mode plan --no-subagents`, env `GROK_MEMORY=0 GROK_AGENT_DASHBOARD=0` | pointer to REVIEW.md | **argv unproven against a live session**: the account answers `402 Payment Required` (envelope `{"type":"error","message":"…402…","http_status":402}`). Whether plan mode permits web search is unknown. grok 1.0.40 imports claude/cursor skills, MCP servers and hooks and offers no headless switch to refuse them |

Outcomes: `completed | unavailable | timed-out | errored | seat-limit`. A 402, a model the account
does not offer, or a CLI that is not installed is `unavailable`; a 429, usage limit or quota is
`seat-limit`; the error is recorded either way, never a crash. `costUsd` is recorded only when
the CLI reports one (claude and grok do; codex and agy do not).

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

## The critique

Scope amendment 1 (operator, 2026-10-05). After the first draft, reviewer models from every
provider the operator has a login for review it, and the writer answers them. The engine is
`critiqueStep` in `lib/articles/engine.ts`; the panel, the schemas and the record are in
`lib/articles/critique.ts`.

The panel is `pipeline/article-reviewers.json` (`ARTICLES_REVIEWERS_FILE`, or `--reviewers <file>`
on the CLI, overrides it): `fable` (claude, `claude-fable-5-1`), `grok` (grok, `grok-4.7`),
`gemini` (agy, `gemini-3.8-flash`), `gpt` (codex, `gpt-6-astra`; `gpt-6.1-astra` is not offered
on this account), each at effort `high` with `timeoutMin` 25. The run snapshots the panel into
`critique/reviewers.json` when its critique begins, and every round and resume reads the snapshot.

1. **Round n.** Every reviewer runs in parallel, blind to the others, with
   `pipeline/ARTICLE-REVIEW-PROMPT.md`. The prompt covers four lenses: accuracy (open the cited
   pages and check numbers, dates and claims), engagement, insight and format. It inlines the
   registry standard the way the writer prompt does, along with the post and its sources. It asks
   for one JSON object and forbids rewriting the post. The engine holds the answer to the review
   schema (`{verdict, summary, findings:[{id, kind, severity, location, claim, evidence, suggestion}]}`);
   the reviewer id, model and effort come from the panel. Evidence entries that are not http(s)
   URLs are dropped and counted. A home path is replaced with `~/`. A malformed answer gets one
   retry; a second one is `errored`.
2. **Quorum.** If fewer than 2 reviewers complete, the run fails with `critique: critique-quorum:
   round n: k of N reviewers completed, 2 needed (<each reviewer's outcome and error>)`, before
   any writer turn and before the check.
3. **The writer** answers with the draft's model, no web (`article-critique-writer`). It gets the
   post, the research and the round's reviews, and writes one disposition per finding
   (`accepted | rejected | deferred`, each with a reason, and an `action` when accepted) plus one
   decision (`keep | rewrite | research`). The engine checks that every finding has exactly one
   disposition with a non-empty reason. An invalid answer gets one retry, then the step fails.
4. **Revision.** `rewrite` runs a rewrite turn whose post replaces `post/`; the draft's patches are
   kept. `research` first runs a web research turn (`article-research`) that must keep every
   existing source's number and URL, then the rewrite. Round n+1 reviews the revised post.
5. **The last round** (`maxCritiqueRounds` 2) allows only `keep` or `rewrite`, and a last rewrite
   is not reviewed again.

Resume works at file level. A reviewer whose review file exists never runs again. A round with
`closed.json` runs no reviewer. A round with a decision runs no writer turn. A round with
`revised.json` is not revised again.

Cost bound, in agent turns: 8 at the least (research, outline, draft, four reviewers, one writer
answer) and 26 at the most (two rounds, each with four reviewers plus four retries, a writer answer
plus one retry, research and rewrite after round 1, and a last rewrite after round 2). Without
retries: 8 for keep after round 1, 14 for rewrite then keep, 16 for research then a final rewrite.

`ArticleRun.critique` summarises the record: `{rounds, reviewers:[{id, engine, model, effort,
outcome, costUsd?, error?}], findings:{total, accepted, rejected, deferred}, decision?}`. A
reviewer's outcome is its outcome in the last round it ran. The counts are over every round's
dispositions, the writer's answered findings.

No technique about multi-model critique is added to the registry's technical-writing bundle until
a real pipeline run produces evidence. As of this writing, no real review has run.

## The check

`lib/articles/checks.ts`, no model. Seven dimensions; each item states what it measured and the
bar (`THRESHOLDS`, which also fills the prompt's numbers, so the agent is asked for what it is
measured against):

| Dimension | Measured |
|---|---|
| structure | content preview before the first `<h2>` listing the sections and stating no read time; no stated reading time anywhere (`read-time`); a summary table in the closing section (`closing-table`); at most 450 words before the first section, preview included (`pre-section-words`); closing list items of at most 50 words (`closing-list-items`); no placeholders |
| figures | at least 5 `<figure>`s, every one captioned, every caption citing a source that exists, images resolving inside the post, label-length text inside the SVGs; visual cadence (`visual-cadence`): no run of 3 or more prose paragraphs in `post.md` without an image, table, code block or callout, and in words (`prose-run-words`, at most 300 words of prose between visuals; `padding-paragraphs`, at most 30 percent of the prose in one-sentence paragraphs of 40 words or fewer) |
| voice | first-person words in prose (outside code and quotes); no em or en dash in `post.md`, `index.html` or a figure (`no-em-dash`) |
| medium-fidelity | no network resources (static and rendered), highlighted code, a dark scheme, smallest body type at 1440 (>= 18 px) and 390 (>= 17 px), smallest caption/chrome type (>= 13 px), no sideways scroll at 390 |
| truth | >= 8 sources, >= 3 primary, >= 1 counter; every source dated with an http(s) URL; every `[n]` resolves; every claim's source exists; the Sources list and `sources.json` numbered 1 to N with no gap or repeat (`source-numbering`); item `critique`: at least 2 reviewers completed every round, and every `blocker` `factual` finding has a disposition with a reason |
| storytelling, depth | not measured: the human's judgement, reported as such and never as a pass |

The rendered items open `post/index.html` in Playwright's chromium with every http(s) request
aborted and counted. A failed item does not stop the run; the report goes to the gate, failures
first. The structure dimension also holds `length-ceiling`: the post's words (`postWords`: prose,
table cells and captions, not code or Sources) stay at or under `THRESHOLDS.maxWords` (7,000, set
above the longest accepted post and below runaway growth); the prompt states it and the fix turn
below enforces it.

### The check between writer turns

The check no longer waits for the end. `checkLoop` (`lib/articles/engine.ts`) runs it after the
draft and after every critique revision, before anyone reviews the text again or the human sees
it:

1. `runCheck` on the post as the writer left it. The failed items, except the `critique` item
   (it cannot pass until the critique is over), are the pass's failures.
2. If any failed and fewer than `MAX_FIX_PASSES` (2) fix turns have run for this label, a **fix
   turn** (writer phase `fix`, `article-critique-writer` class, no web) gets the post, sources and
   claims plus the failures twice: in the prompt (item id, dimension, measured value, bar, the
   offending text) and in `inputs/check-failures.json`. `out/post/` is seeded with a copy of the
   post, so the fix edits in place and carries every unflagged byte over (2026-10-07: a fix that
   rewrote the whole post cost $4 a pass and changed text nobody had flagged); the engine ingests
   the result like any rewrite (`ingestPost`) and the loop checks again.
3. When the bound is reached with failures left, the run goes on to the next step and the gate;
   nothing is hidden: the last pass keeps its failures and the final `check` step reports them.
   A fix turn that fails (timeout, invalid output) is recorded as `fixError`, leaves the post as
   it was and ends the loop; it never fails the run.

Every pass is `checks/<label>-<pass>.json` (`CheckPassRecord`: label `draft` or `round-<n>`, the
failures, `fixed`, `fixError`), also returned as `checkPasses` by `getRunDetail`. The files are the
loop's whole state, so a resume repeats no pass and no turn. The fix turns' receipts are
`agent/fix-<label>-<pass>.json` and `-prompt.md`; their cost is added to the draft step or to the
critique step. A check that cannot run at all (an exception) is logged and skipped between turns;
the final check step surfaces it.

## Topics, the loop and `/techwriter`

Added 2026-10-07 from the first six runs (the `techwriter` skill, `.claude/skills/techwriter/`,
is the operator's front door; the CLI verbs below are what it calls).

```bash
npx tsx pipeline/article.mts topics [--limit N] [--include-bundle <bundle>] [--json]
npx tsx pipeline/article.mts loop (--target N | --add N) --budget-usd X [--concurrency 3] [--max-failures 3]
    [--max-resumes 2] [--run-usd 120] [--turn-usd 30] [--run-turns 45] [--est-run-usd 70] [--topics auto|<file>] [--json]
```

**Covered topics** (`lib/articles/loop.ts`, `coverage`). A topic is covered when a run on it is at
`awaiting-approval`, `approved`, `landing` or `landed`, or when the registry's `publications/` lane
holds a post on it (`publication.json` `topic`; a landed run and its publication count once). A
failed or rejected run does not cover its topic. A run still in flight is *claimed*: the loop will
not start a second article on the subject, and a claimed run with no live driver is listed as
`orphaned` in the loop report (resume it with `resume <runId>`).

**`topics`** ranks the uncovered subjects of every bundle except `technical-writing` (the standard
itself, circular as evidence; `--include-bundle technical-writing` opts in). The order is
deterministic and spreads over bundles: bundles with the fewest covered topics first, then
round-robin by category and slug. Each topic carries its title (the golden path's first heading) and
a suggested angle that states the two rules every run needed said up front: say in the preview
whether the evidence is first-party or third-party, and label our own conclusions Derived, Inference
or assumption. `--json` gives `{topics, covered, claimed, remaining}`.

**`loop`** drives runs to the human gate in this process (no child process of its own: the agent
seam spawns the CLIs with its own argv fence and environment strip) until the target is met.
`--target N` is the total number of covered topics, `--add N` is N more than are covered now.

- **The budget is required.** `--budget-usd X`: there is no default. It counts reported cost, the
  Claude seat's turns; Codex and agy report none, so real spend is higher (the report says so). The
  loop stops launching when reported spend plus `--est-run-usd` (default 70, about the median of the
  first six runs) would pass X, and once reported spend passes X the runs in flight are stopped at
  their next agent turn (`budget-stopped`). A stopped run is `failed` and can be resumed by hand.
- **Run ceilings**, checked before every agent turn, writer or reviewer: `--run-usd` (default 120,
  above the dearest run so far at $92) and `--run-turns` (default 45; the runs used 26 to 32). A run
  over either is refused its next turn, ends `failed` with `run-ceiling: ...` in its error, is
  reported `ceiling-stopped` and is never resumed by the loop: it is marked for a human. `--turn-usd`
  (default 30; the dearest turn so far was $17.61) is passed to the writer's CLI as
  `--max-budget-usd`, so one runaway turn is stopped inside the turn.
- **Resume bound.** A failed run is resumed up to `--max-resumes` (2) times, then it counts as a
  failure; after `--max-failures` (3) failed topics the loop stops (`failure-stopped`).
- **Stops**, in `loop.json` `stop`: `target-reached`, `budget-stopped`, `failure-stopped`,
  `topics-exhausted`. Exit 0 only for `target-reached`.
- **Report.** `<store parent>/article-loops/<loop id>/loop.json` (`article-loop/1`: options, covered
  at start and now, reported spend, every run with its end, resumes, cost and turns, orphans, the
  stop and why) and `events.log`, beside the article store so that `/articles` does not list it.
  `--topics <file>` replaces the ranking with a JSON array of `"bundle/slug"` or `{subject, angle}`.

The prompts and checks of 2026-10-07 carry the first six runs' lessons (`lib/articles/checks.ts`,
`pipeline/ARTICLE-*-PROMPT.md`): the opening as one concrete incident, a cap on the words before the
first section, the cadence rule counted in words, evidence scope stated in the preview, labelled
constructs, stable source numbers (also as a check), the population of every number in research,
the keep-existing-sources rule at the head of the re-research phase, a worked triage answer, a fix
turn that edits in place, and one retry of a rejected re-research that starts from its own files.
The thresholds were calibrated on the eight posts in the store; they fail the five posts that the
reflections called a wall before the first section, and the two longest stretches between visuals.

## Lessons from the first full run

The first real run (2026-10-05, topic `software-engineering/agent-cli-transport`, 155 minutes,
about $51 of the cost the Claude seat reports; Codex and Gemini report none) is the evidence
behind the prompt and check changes of 2026-10-06. For the next author of a run:

- **Where the time and money go.** Research 12 min / $5, outline 4 / $1, draft 21 / $6, critique
  (two rounds) 117 min / $39, check under a minute. The critique step is about three quarters
  of both. It earns it on accuracy: about 70 percent of 68 findings were factual, 17 were
  blockers, and two independent reviewers flagged the same real errors (a parser that reported a
  half-streamed turn as success). It moved engagement, insight and voice very little.
- **The research phase was the weak link, not the critique.** The thesis said no clock inside
  the child could end a stalled request; the vendor's own errors page documents one. Research had
  met its counter-source floor and still missed the page. The research prompt now makes every
  claim of absence carry a search of the vendor's errors, configuration and changelog pages.
- **The writer accepted 65 of 68 findings** and the post ended at 33 minutes of reading. The
  critique prompt now holds the post to a length ceiling (replacement, not addition) and the
  review prompt asks reviewers to say what a requested addition should displace. A reviewer's
  claim resting on a page it could not open is unverified and capped below `blocker`.
- **A panel of four gave two.** Grok returned 402 (balance), Gemini hung 25 minutes and then
  503ed (agy eligibility check). Both are recorded, not hidden, and the quorum of two held.
  Done (2026-10-06): agy's start-up line "Eligibility check failed: failed to get load code
  assist response: UNAVAILABLE (code 503)" is recognised on stdout or stderr while the process
  idles (`earlyUnavailable` in `lib/agent/cliSeam.ts`), the reviewer is stopped at once and
  recorded `unavailable` with that line, and the panel gives gemini a 14 minute timeout (its
  completed rounds took 11) in place of 25.
- **The check ran too late.** It ran once, after the last rewrite, and failed three dimensions
  nobody could still fix. The second run (judge calibration and drift, 2026-10-06) reached the
  gate with four failures for the same reason: a 6-paragraph run without a visual, an 18-word
  figure label, body type at 17px and chrome type at 10.92px. Done: the check now runs after the
  draft and after each revision, its failures go back to the writer as mandatory fixes (at most
  two passes per label) and the rest is recorded; see "The check between writer turns".
- **The writer accepted 94 of 98 findings** on the second run and the post stayed long (about
  6,500 words). Length was stated but not measured; `length-ceiling` now measures it and the fix
  turn cuts to it.
- **The owner's review of the finished post** is encoded as house rules in the writer prompt and
  as checks: no em or en dash; no chronicle opening (tell the situation briefly, show a sequence
  as a timeline figure); no stated reading time (the platform shows one); a visual element at
  least after every second paragraph; a summary or comparison table in the close for readers who
  read only the opening and the ending. The same rules live in the registry standard
  (`visual-cadence` and the preview, opening and closing techniques, recipe 0.2.0).

## The gate and landing

Approval is per post and per patch: `approve <runId> --patches p1,p2` (or the gate's Approve with
the patch selection) records `approval {at, patches}`, then the engine lands
(`lib/articles/registryWrite.ts`):

1. `git fetch origin` in the registry; a worktree on `article/<slug>` off the remote's default branch
2. `publications/<slug>/`: `publication.json` (`publication/1`), `post.html`, `post.md`,
   `SOURCES.md`, `figures/*.svg`, `medium/{story.html,tags.txt,README.md}`. The figure PNGs stay in
   the run: the registry is a text-only repository. With a decided critique, which every run has
   since the critique step, `publication.json` also carries `critique: {rounds, reviewers:[{id,
   engine, model, effort, outcome, costUsd?}], findings, decision}`. The record goes in
   `critique/reviews.json` (`[{reviewer, round, model, effort, verdict, summary, findings}]`) and
   `critique/dispositions.json` (`[{reviewer, round, findingId, disposition, reason, action?}]`).
   Both files flatten every round, and the block's counts are computed from that dispositions file,
   so the registry gate's cross-check holds by construction (ai-registry
   `docs/publications-lane.md`, "The critique record"). The PR body says who reviewed.
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
npx tsx pipeline/article.mts run (--subject <bundle/slug> | --topic "<text>") [--angle "<text>"] [--model <id>] [--effort <level>] [--reviewers <file>] [--json]
npx tsx pipeline/article.mts status [<runId>] [--json]
npx tsx pipeline/article.mts approve <runId> [--patches p1,p2] [--json]
npx tsx pipeline/article.mts reject <runId> --note "<text>" [--json]
npx tsx pipeline/article.mts resume <runId> [--reviewers <file>] [--json]
```

Exit 0 ok, 1 the run stopped somewhere else or the operation failed, 2 usage. `--json` prints one
document on stdout; the per-turn `[agent]` log lines go to stderr. `run` and `status` print the
critique: each reviewer with its outcome and error, the findings by disposition, and the decision.
`run --json` carries `critique` beside `{runId, dir, status}`. The `techwriter` skill is the dialogue and
the loop; the `article-run` skill wraps `run`
and `status` only and never approves.

A dry run against a throwaway registry, spending nothing, with every engine stubbed:

```bash
node tests/fixtures/articles/registry-fixture.mjs <scratch>/reg
STUB=tests/fixtures/articles/stub-agent.mjs
AI_REGISTRY_DIR=<scratch>/reg/registry ARTICLES_STORE_DIR=<scratch>/store \
  ARTICLES_AGENT_BIN="node|$STUB" ARTICLES_CODEX_BIN="node|$STUB|--as=codex" \
  ARTICLES_GROK_BIN="node|$STUB|--as=grok" ARTICLES_AGY_BIN="node|$STUB|--as=agy" \
  STUB_REVIEWERS="grok=unavailable" STUB_CRITIQUE_DECISIONS="rewrite,keep" \
  npx tsx pipeline/article.mts run --subject software-engineering/token-budgeting
```

Leaving out one of the four `*_BIN` variables runs that real CLI.

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

## The /articles surface and the routes

`app/articles/` draws runs; `app/api/articles/` is the only way it reaches the engine. Every
route calls its `lib/apiAuth.ts` door in its own file. `app/api/articles/_lib/respond.ts` shapes
errors and bodies after the door. It is not an auth wrapper.

| Route | Door | Does |
|---|---|---|
| `GET /api/articles` | `guardAccessOnly` | `{runs, damaged, driving}`. `driving` lists the ids a live process holds the lease on |
| `POST /api/articles` | `guardRequest` | validates `{topic, model?, effort?}`, then `createRun` and `launchRun`. Returns 201 `{run}`. If the registry cannot be reached, it returns a `failed` run |
| `GET /api/articles/[runId]` | `guardAccessOnly` | `getRunDetail` (including `critique`, the critique's files read back) plus `driving`, `agent` (from `agent/<step>.json`), `refused` (from `patches.rejected.json`) and `landingLog` (tail of `landing.log`). Each extra is absent when its file is absent |
| `POST …/approve` `{patches}` | `guardRequest` | `approveRun`, then `launchRun` (landing) |
| `POST …/reject` `{note}` | `guardAccessOnly` | `rejectRun`. A note is required |
| `POST …/resume` | `guardRequest` | `resumeRun`, then `launchRun` |
| `GET …/file/<path>[?k=]` | `guardAccessOnly` | serves files under `post/`, `check/` and `medium/` only. HTML and SVG are sent under `default-src 'none'; … sandbox` |

Errors come back as `{error, code}` from `ArticleError`, word for word. The verbs read the run
before they act. The store's write lock creates the run directory, so a typo'd id gets a 404 and
leaves nothing on disk. The file route is a path segment, not a query string, because the post
links its figures relatively. With `?k=`, the relative `src`/`href` in the post are rewritten to
carry the secret, because an `<img>` inside an iframe sends no header.

Pages:

- `/articles` lists runs: status chip, topic, cost, start time. The empty state is a `Ghost` whose
  only action is New article.
- `/articles/new` is a server page. It calls `listTopicSubjects()` per request (`connection()`) and
  passes `{bundle, slug, category}` to a client form. The form has a bundle `Select`, then a
  subject `Select` grouped by category, or the operator's own words, plus angle, model and effort.
  If the registry cannot be read, its error is shown word for word and free text still works. No
  client module imports `lib/articles/` beyond `types.ts`.
- `/articles/<runId>` shows a six-node stepper (research, outline, draft, critique, check, gate),
  a state banner, and the gate in its fixed order: the draft in a `sandbox=""` iframe, the
  critique, the check report, sources, patches with diffs, then Approve and Reject.
  - Critique (`app/articles/CritiquePanel.tsx`): the round timeline (completed of the panel,
    findings, the writer's decision and rationale, whether the post was revised and after
    research; a round button switches the view), then the reviewers of that round, each with an
    outcome chip and a glyph. Unavailable, seat-limited, timed-out and errored reviewers stay
    listed with their error; a reviewer with no outcome yet is `reviewing` only while a live driver
    is on the round. Each completed reviewer shows its verdict, findings by severity, and cost when
    reported. The findings are grouped by kind in lens order, blockers first, each with the
    writer's disposition, reason and action beside it. A finding the writer has not answered says
    `unanswered` in amber. A round that stopped short of quorum says so.
  - Check report: failures first, then the unmeasured dimensions in amber, then passes.
  - Patches: each gets a checkbox at the gate. After approval it shows approved or declined.
  - Approve: a confirm that states its consequence.
  - Reject: requires a note.

How the page reads a run (`app/articles/runModel.ts`, pure):

- A working status with no live driver is `stalled`, not running, and gets the same Resume a
  failure gets. `critiquing` is a working status.
- A write in the last 15 s counts as a drive that is starting, not a dead one. A route answers
  before `launchRun` takes the lease.
- `failed` with an `approval` is a landing failure. Its button is Re-land.
- Polling: every 2.5 s while driven, every 8 s while stalled, never at or past the gate.
- The critique: `reviewerRows`, `findingGroups`, `roundTimeline`, `latestRound`.

The Board's `articles` source (`lib/board/sources/articles.ts`, verdicts in
`lib/board/verdicts.ts` `fromArticle`) uses the same routes.

- Items: runs at the gate, plus runs a human has already decided. A run that carries an approval
  reads as approve, whatever its status. A run stopped at `critique-quorum` is not an item.
- Approve is refused by name when the run proposes patches, because approval is per patch.
- Reject needs a reason or a note. Reasons are the seven check dimensions, written into the note.
- Clear is always refused.

## Probes

`tests/golden-path/articles-{store,checks,registry,engine,critique,checkloop,ui}.probe.spec.ts`, offline,
against `tests/fixtures/articles/registry-fixture.mjs` (a bare origin plus a clone; its stub gate
also knows the `critique` block and directory in outline), the stub agent through the real seam for
the writer and all four reviewer engines, and a stub `gh`. They never name the real registry.
`articles-critique` pins each engine's argv and fence, the envelopes (a 402 and a usage limit
included), the schemas, every critique flow, resume inside the step, the check item and the
write-back. `articles-checkloop` seeds one defect with `STUB_POST_DEFECT` (an em dash, in the draft,
a revision or the fix itself) and pins the between-turn check: the failure reaches the fix prompt
and file, the fix replaces the post, the bound of two holds, a failed fix is recorded, a revised
post is checked before the next review round, resume is idempotent, plus agy's early 503 and the
shorter agy timeout. `articles-ui` calls the routes as functions and covers every state seeded by
`tests/fixtures/articles/runStates.ts`: running, partial, quorum, keep and rewrite critiques
among them. The three `guardRequest` routes are driven in `imaging-auth.probe.spec.ts`.
