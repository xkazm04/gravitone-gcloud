# Articles: a technical post from a registry topic to a registry PR

`lib/articles/` turns a topic into one technical blog post: live-web research, an outline, a
draft, a multi-model critique, and a deterministic check, then a stop at the human gate. On approval, deterministic code
writes the post into ai-registry as a structured publication with any approved registry patches,
runs the registry's gates, pushes a branch, opens a PR, and builds a paste-ready Medium package.
At the gate the post is also pasted into a private Medium draft (`lib/medium`, below), so the human
reads it as Medium renders it. Nothing is ever published to Medium.

A post about a registry subject is written around a **trial** (below): one rule of the subject's
golden path measured on this machine against the strongest alternative in current use, before the
run exists. The trial is the post's spine and source 1, research is its supplement, and approval
lands the measurement in the registry as an application record beside the post.

The post standard is registry content, not this repo's: the `technical-blog-post-authoring`
recipe and the `technical-writing` knowledge bundle. The prompt references it by address and
inlines what it resolves on every run.

## The run

```
queued -> researching -> drafting -> critiquing -> checking -> awaiting-approval -> approved -> landing -> landed
            research     outline,draft  critique      check     (human gate)  |  \-> rejected
                             ^                                                |
                             \------------- rework (a note) -----------------/
any working state -> failed -> resume -> the state whose step did not finish
```

The statuses and their legal moves live in `lib/articles/store.ts` (`TRANSITIONS`), and
`updateRun` refuses an illegal move before it writes. `landing` is reachable only from
`approved`; `approved` only from `awaiting-approval` (the human) or from `failed` when the
failure was in landing (a resume re-lands; it never re-approves). `checking` is reachable only
from `critiquing`: no draft reaches the check unreviewed. `awaiting-approval -> drafting` is the
rework edge (below) and the only way back from the gate; `rejected` and `landed` stay terminal.

A run is a directory, `foundry-out/articles/<runId>/` (`ARTICLES_STORE_DIR` overrides the root).
The publish store's conventions apply: JSON written tmp + rename, a per-run exclusive lock file
for every read-modify-write, and a corrupt `run.json` is refused, never replaced.

| File | Written by | What |
|---|---|---|
| `run.json` | engine | `ArticleRun` (`lib/articles/types.ts`) |
| `sources.json`, `claims.json` | research turn, validated | numbered, dated sources; claims each carried by one source |
| `outline.md` | outline turn | sections, figures plan, closing |
| `post/index.html`, `post/post.md`, `post/meta.json`, `post/figures/NN-*.svg` | draft turn | the page, the Medium-ready Markdown, title/subtitle/tags, figures |
| `patches.json`, `patches/<id>.patch` | engine, from the draft turn's proposals | registry patches offered at the gate; the diff is computed by code. A trial run's required `t1` is made by code (Trials) |
| `patches.rejected.json` | engine | proposals refused (outside `knowledge/`/`recipes/`, no source, identical; on a trial run anything but an amendment of the subject's techniques) |
| `experiment/`, `experiment-source.json` | `createRun`, trial runs only | the trial's files, and source 1 (Trials) |
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
| `rework/<n>/before/` | rework | what the n-th rework made stale: the old `steps.json` (costs included), `critique-summary.json`, `critique/round-*`, `checks/`, `check.json`, `check/`, `agent/critique-*` and `agent/fix-*`, and copies of `post/` and the draft's receipt and prompt |
| `medium/` | gate, landing | `story.html`, `tags.txt`, `README.md`, `figures/*.png`; rebuilt at the gate for the draft and again at landing |
| `medium/draft.png` | gate | the private Medium draft as the editor rendered it |
| `landing.log` | landing | the registry gates' output |
| `.lock`, `.driver` | store | the write lock and the one-driver lease |

## Trials

Added 2026-10-18. A post about a registry subject used to be a survey: 17 of 17 posts disclaimed
any measurement of their own in the preview, 88 to 94 percent of their prose sat in cited
paragraphs, and 6 angles that promised a first-hand measurement delivered none. Their 17 registry
patches went 14 to the technical-writing bundle and 0 to the run's own subject, and none was
adopted. The one measured post, `the-token-tax` (made by hand, its experiments in its own
`SOURCES.md#experiments`), is the model a trial reaches for.

A **trial** measures one rule of a subject's golden path against the strongest alternative in
current use, on this machine, and the run is written around its result. It is made BEFORE its run
exists, by an agent with a shell (the `article-run` skill's Sonnet subagent,
`.claude/skills/article-run/trial-agent.md`). The engine's writer turns stay shell-less: the agent
seam and its fence are unchanged.

### The trial store

`<store parent>/article-trials/<id>/` (`foundry-out/article-trials/` by default;
`ARTICLES_TRIALS_DIR` overrides the root). The id is `<YYYY-MM-DD>-<slug>`, with `-2`, `-3` on a
collision. The types are in `lib/articles/types.ts` ("the trial"), the store in
`lib/articles/trial/store.ts`.

| File | Written by | What |
|---|---|---|
| `trial.json` | the verbs | `TrialRecord`: status `open -> framed -> sealed -> closed`, the subject (file, digest, revision, changedAt), the seal, the verdict, and `runId` once a run is written around it |
| `brief/` | `trial open` | `golden-path.md`, `techniques/*.md`, `applications.json` (each application's stack, technique, `ab_verdict`, `verified_on`), `currency.json` (the registry's `check-currency.mjs --volatile` for the subject; absent when it fails), `governs.json` |
| `frame.md` | agent | the prior (written before the first search), the claim, the alternative, the steel-man, the design's reasoning |
| `validity.json` | agent | `TrialValidity`: `current`, `stale` or `untestable`, with reasons and dated sources |
| `prereg.json` | agent | `TrialPrereg`: the claim, the alternative and its dated source, the arms (`golden` is the rule as written, then `alternative`), ONE metric and its direction, `minEffect`, guard thresholds, `n` per arm, controls, stack, environment, and a budget of wall minutes and model calls |
| `seal.json` | `trial seal` | the sha256 of prereg.json's bytes, and when |
| `harness/` | agent | the code that measures both arms; every `trial exec` runs in it |
| `exec.jsonl`, `exec-logs/<k>.log` | `trial exec` | one `TrialExecRecord` per command (pilot or measured, exit code, duration, timed out) and its output |
| `results.json` | the agent's harness | `TrialResults`: per arm the observations and one value per guard; each control held or not, with its evidence; the model calls made |
| `verdict.json` | `trial close` | `TrialVerdict`, computed by code, never by a model |
| `REPORT.md` | agent | what ran, the versions, the anomalies, the result read against the prior |
| `drop.json` | `trial drop` | `{reason, at}` of a trial closed without a verdict |

### The verbs

```bash
npx tsx pipeline/article.mts trial candidates [--limit N] [--json]
npx tsx pipeline/article.mts trial open <bundle/slug> [--json]
npx tsx pipeline/article.mts trial check <id> [--json]
npx tsx pipeline/article.mts trial seal <id> [--json]
npx tsx pipeline/article.mts trial exec <id> [--pilot] -- <cmd...>
npx tsx pipeline/article.mts trial close <id> [--json]
npx tsx pipeline/article.mts trial drop <id> --reason "<text>" [--json]
npx tsx pipeline/article.mts trial status [<id>] [--json]
```

- `candidates` ranks the subjects of the audience bundles and of the manifest's
  `knowledge.domains` (technical-writing excluded) for a trial, validity first: applications whose
  `ab_verdict` is already not-better (the strongest signal), the contexts here the subject governs
  (`.ai/registry-map.json`), the registry's own at-risk and volatile facts, and the subject's age.
  The formula and its reasoning are the header of `lib/articles/trial/candidates.ts`. A subject an
  unclosed trial or a trial run holds is listed in `claimed` and left out. Classic topics keep
  `topics`.
- `open` resolves the subject through the registry index (404 `no-subject`) and refuses one that
  an unclosed trial holds (409 `trial-claimed`).
- `check` validates prereg.json and validity.json, checks that the prereg names the trial's subject
  and one of its techniques (the registry index's, else `brief/techniques/`) and a `stack` the
  subject's bundle accepts for an application (react, rust, sql, node, process, plus the bundle
  `index.md`'s `stacks:`: the registry's bundle gate would otherwise fail it only at landing), and
  marks the trial `framed`. Every problem in a file is named at once (400 `bad-prereg`, 400 `bad-validity`). It is
  the design the orchestrator vets before any money is spent.
- `seal` validates again and writes `seal.json`. Re-sealing the same bytes is a no-op; different
  bytes are 409 `already-sealed`.
- `exec` runs one command in `harness/`, without a shell and one at a time (409 `exec-busy`), under
  the seat-only environment with every credential-looking variable name stripped, so the seat CLIs
  work from their own logins and no metered key is visible. At its cap the whole process tree is
  killed and the record says `timedOut` with no exit code. A `--pilot` runs while the trial is
  open, framed or sealed, for at most 10 minutes, and never counts. A measured exec needs the seal
  and an unchanged prereg (409 `not-sealed`, 409 `prereg-changed`); its cap is `budget.wallMin` less
  the measured time already used (409 `budget-spent`). The exit code is the child's, and the record
  goes to stderr as one `[trial] {json}` line so the child's stdout stays clean.
- `close` needs the seal, an unchanged prereg and at least one measured exec after the seal (409
  `no-measurement`). It validates results.json against the prereg (400 `bad-results`, every
  problem named), computes the verdict and closes the trial.
- `drop` closes an open, framed or sealed trial with no verdict (a strawman, a stale or untestable
  subject, the operator's no) and keeps the reason in `drop.json`.
- `status <id>` reads a trial back: the record, its directory, which files exist, the exec log,
  the measured time against the budget, and the verdict or the drop.

Every verb that moves a trial refuses a closed one (409 `trial-closed`). `--json` prints one
document on stdout. Exit codes are the other verbs' (0 ok, 1 the operation failed, 2 usage or a 400
refusal), except `exec`, which exits with the child's code.

### The verdict

`lib/articles/trial/verdict.ts` is pure, and its header is the rule:

```
  void        a control did not hold, or an arm has fewer than `n` observations
              (measurement-honesty/control-failure-is-not-a-datum-state; minimum-sample-floors),
              or the harness made more model calls than the prereg budgeted (a protocol breach:
              the budget was part of what was sealed)
  band        minEffect.value, or minEffect.value x |golden mean| when relative
  eligible    an arm clears every threshold
  challenged  the alternative is eligible AND delta > band
  upheld      the golden arm is eligible AND (delta < -band OR the alternative is not eligible)
  null        anything else

delta = alternative mean - golden mean, sign-flipped when the metric's direction is
"lower", so a positive delta always favours the alternative. `deltaCi95` is a seeded
bootstrap (fixed seed, 2000 resamples): reported, never decisive.
```

A `null` is written up (no difference beyond the declared band, every control held, every arm at
its floor); a `void` is not, because nothing was measured.

### From a trial to a run

```bash
npx tsx pipeline/article.mts run --trial <id> [--json]
```

`createRun({topic, trial})` (`lib/articles/runCreate.ts`) validates before it creates anything:
404 `no-trial`, 409 `trial-not-closed`, 400 `trial-void` (a void verdict, or a dropped trial that
has none), 409 `trial-taken` (another run holds the trial), 400 `trial-mismatch` (a topic that is
not the trial's subject). The topic is the trial's subject and the angle its prereg's `question`.
The run then gets:

- `experiment/`: a copy of the trial dir without `node_modules`, `.venv`, `venv`, `__pycache__`,
  `.git` or any file over 1 MB; what was left out is listed in `experiment/SKIPPED.txt`;
- `experiment-source.json`: source 1 (`experimentSource` in `lib/articles/trial/record.ts`), the
  trial's application record at its address on the registry's default branch
  (`https://github.com/<owner/repo>/blob/main/<applicationPath>`, from `.ai/manifest.yaml`
  `registry.remote`; `ARTICLES_REGISTRY_REMOTE` overrides it). Like `the-token-tax`'s
  `SOURCES.md#experiments`, the link resolves once the landing PR merges;
- `run.trial` (`ArticleTrialRef`), and the trial records the run's id.

The prompts gain `trial-research`, `trial-outline`, `trial-draft` and `trial-writer` in
`ARTICLE-POST-PROMPT.md` and `trial-review` in `ARTICLE-REVIEW-PROMPT.md`, appended only for a
trial run, with the trial's summary in their `{{TRIAL}}` slot. What a classic run is sent does not
change.

- **Research is the supplement**: earlier measurements of the same comparison, both practices'
  current documentation, counter-evidence to the result. Row 1 of `sources.json` must equal
  `experiment-source.json` field for field, or the step fails with `source 1 must be the trial's
  record (experiment-source.json)`. Numbering continues from 2, and every bar on sources holds.
- **The post is built around the result.** It opens on the trial's own measured number; the
  preview states the verdict, the per-arm n and that the measurement is first-hand, citing [1];
  then a setup section, at least one figure drawn from `results.json` whose caption cites [1], the
  mechanism, what the result changes for the golden path, and what the trial cannot say. A `null`
  is "no difference beyond <band> at n=<n>", never a tie or a win. No number about the arms that
  `results.json` or `verdict.json` does not hold.
- **Patches.** The draft is staged the subject's golden path, the technique under test and its
  application file (when one exists) in place of the writing standard's files. A `challenged` or
  `null` trial may propose at most one amendment to the technique under test, stating the
  condition under which the rule did not hold; never golden-path text, never the writing standard.
- **The METHOD lens.** A trial run's reviewers find `experiment/` in their workspace (text files,
  at most 2 MB) and review it as a fifth lens: confounds, arm fairness (the alternative at its
  best, not a strawman), whether the controls held, n against the floor, the choice of band,
  whether the verdict follows from the numbers, and overclaiming. The registry's critique gate
  accepts a closed set of kinds, so a METHOD finding is `kind: "factual"` with a `location` that
  starts `METHOD:`. The writer cannot re-measure: it answers a method finding by stating the limit
  in the post, or rejects it with the reason, and never changes a number about the arms.
- **The check** adds two truth items for a trial run: `trial-preview` (the text before the first
  `<h2>` cites [1] and states the per-arm n) and `trial-figure` (a figure caption cites [1]).

### The gate and the registry outcome

The run page shows the trial just before the critique (`app/articles/TrialPanel.tsx`): the verdict,
the claim, the technique, the alternative and its source, the metric with its band and guards, per
arm n, mean, sd and guards cleared, the controls, the measured commands, and the contexts here the
subject governs. A classic run shows a `no trial` chip in its place.

The measurement lands as the registry's own kind of evidence, an **application** of the technique
under test (`lib/articles/trial/registryRecord.ts`), at `run.trial.applicationPath`
(`<subject dir>/applications/<stack>--<technique>.md`): frontmatter `applied: experiment`,
`ab_verdict` (`upheld` is `better`, `challenged` and `null` are `not-better`), `proof: ab-paired`,
`verified_on` (the verdict's date) and `verified_against` (the prereg's environment); a body with
the claim, the alternative, the setup and its measured commands, the per-arm table, the verdict and
the bootstrap interval. When the file already exists, a dated `## Trial <id> (<date>): <verdict>`
section is appended and the rest is left as it was: an earlier measurement is evidence too.

- The engine adds it as patch `t1` (`kind: application`, `required: true`, sources [1]) after the
  draft's own proposals. A required patch is in every approval whatever the caller selected (the
  CLI, the route and the Board all go through `approveRun`), so a post never lands citing a record
  that did not land with it.
- A trial run's own proposals must amend one of the subject's techniques (kind `technique`, a file
  in the subject's `techniques/`); anything else goes to `patches.rejected.json` with its reason.
- Landing writes `## Experiments` into the publication's `SOURCES.md` (the question, arms, metric,
  n, the per-arm table, the measured commands, the environment, the date and the application
  path), and the PR body carries a Trial block: verdict, metric, n, the application path, the
  contexts it governs here, and the step after merge, `node scripts/converge.mjs --pending --write`
  in the registry, which queues the changed subject in every consuming project.
- No trial rewrites golden-path text. One experiment does not move a stance; two not-better
  verdicts from different projects are what demote a technique, and the registry decides that
  through its leads.

**Leads** (`lib/articles/trial/leads.ts`) go to the main checkout's `.ai/registry-leads.jsonl`
(`ARTICLES_LEADS_FILE` overrides it, and every probe sets it), the consumer-side channel the
registry's `leads-collect.mjs` folds into its librarian inbox. A lead proposes; it never changes the
registry. Each is `from: "article-trial@<date>"`.

| When | Kind | Written by |
|---|---|---|
| a trial closes `void` | `technique` | `trial close` |
| a trial whose validity is `stale` is dropped | `subject` | `trial drop` |
| a trial run is rejected at the gate, so the measurement is not lost | `application` | `rejectRun` |
| a `challenged` or `null` trial run lands, so `/deepen` weighs the golden path | `technique` | landing |

### The orchestrator, and what classic runs keep

`/article-run` (`.claude/skills/article-run/SKILL.md`) runs trials end to end. It ranks the
candidates and judges which can be measured on this machine, frames up to three trials in parallel
with Sonnet subagents, vets each design (no strawman alternative, a metric that measures the claim,
a band outside the noise, a current subject), asks the operator once with every trial's design and
cost, then measures, closes, and starts `run --trial` for every trial that is not void. N is the
smallest of 3, the budget at 100 USD an article, the testable candidates and the slots beside runs
already driving; it is 1 after a `seat-limit` in the last 24 hours. An article costs about $80 to
$90 reported: writing about $65 to $67, the trial $5 to $15. The skill never approves, rejects,
reworks, resumes or lands.

Classic runs are unchanged. `/articles/new`, `run --subject`, `run --topic`, `loop` and
`/techwriter` write third-party posts with no `run.trial`, with the research brief, prompts, checks
and patches described in the rest of this document, and the gate labels them `no trial`.

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
reviewers), and `ARTICLES_CODEX_BIN`, `ARTICLES_AGY_BIN` replace the other
two. The probes and every dry run use `node|tests/fixtures/articles/stub-agent.mjs`, with
`|--as=<engine>` for the reviewers so the stub answers in that engine's envelope. It writes canned,
check-passing files and spends nothing.

### Reviewers: three engines, read-only

The critique's reviewers run through `runReviewer` in the same seam, on the operator's own CLI
logins. A reviewer's workspace holds only a copy of `post/`, `sources.json` and `REVIEW.md` (the
full prompt), and `experiment/` on a trial run; the seam refuses one that holds anything else. The
review comes back as one JSON object in the final message. Nothing a reviewer leaves on disk is
read back; the engine records any file it wrote in its receipt (`wrote`). The environment is the
writer's metered-key strip plus every variable whose name looks like a credential (`KEY`,
`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, `AUTH`).

| Engine | argv after the binary | Prompt | Proven on 2026-10-05 |
|---|---|---|---|
| claude | the writer's fence above with `--tools WebSearch,WebFetch,Read` (no Write, no Edit) | stdin | flags parse together (empty-prompt check, nothing spent) |
| codex | `exec --json --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules -C <ws> --sandbox read-only -m <model> -c model_reasoning_effort="<e>" -c web_search="live" -` | stdin | one-line probe: the page opened through `web_search` and a file write was "blocked by policy" in the same session. `max` is sent as `xhigh` |
| agy | `-p <pointer> --model <model>-<tier> --output-format json --dangerously-skip-permissions --sandbox --disable-slash-commands --print-timeout <n>m`, stdin closed empty, cwd = the workspace | pointer to REVIEW.md | without `--dangerously-skip-permissions` headless mode auto-denies `read_url` (empty answer). With it, `--sandbox` combines, but neither `--sandbox` nor `--mode plan` stopped a write INSIDE the workspace. agy is read-only by isolation, not by flag. The full argv parses (empty-prompt check) |

Outcomes: `completed | unavailable | timed-out | errored | seat-limit`. A 402, a model the account
does not offer, or a CLI that is not installed is `unavailable`; a 429, usage limit or quota is
`seat-limit`; the error is recorded either way, never a crash. `costUsd` is recorded only when
the CLI reports one (claude does; codex and agy do not).

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
background; it contains no external facts, and the post's facts come from research. A trial run's
post stands on its own measurement instead, with research as the supplement (Trials).

## The critique

Scope amendment 1 (operator, 2026-10-05). After the first draft, reviewer models from every
provider the operator has a login for review it, and the writer answers them. The engine is
`critiqueStep` in `lib/articles/engine.ts`; the panel, the schemas and the record are in
`lib/articles/critique.ts`.

The panel is `pipeline/article-reviewers.json` (`ARTICLES_REVIEWERS_FILE`, or `--reviewers <file>`
on the CLI, overrides it): `opus` (claude, `claude-opus-5-5`, effort `xhigh`; it replaced `claude-fable-5-1` on 2026-10-15 until Fable 5.5 arrives),
`gemini` (agy, `gemini-3.8-flash`), `gemini4` (agy, `gemini-4-argon`, added 2026-10-14 in the seat grok left), `gpt` (codex, `gpt-6-astra`; `gpt-6.1-astra` is not offered
on this account), each at effort `high` with `timeoutMin` 25. The run snapshots the panel into
`critique/reviewers.json` when its critique begins, and every round and resume reads the snapshot.

1. **Round n.** Every reviewer runs in parallel, blind to the others, with
   `pipeline/ARTICLE-REVIEW-PROMPT.md`. The prompt covers four lenses: accuracy (open the cited
   pages and check numbers, dates and claims), engagement, insight and format; a trial run's
   review adds a fifth, METHOD, over the experiment in its workspace (Trials). It inlines the
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
| structure | content preview before the first `<h2>` listing the sections and stating no read time; no stated reading time anywhere (`read-time`); a summary table in the closing section (`closing-table`); at most 450 words before the first section, preview included (`pre-section-words`); closing list items of at most 50 words (`closing-list-items`); the skim spine (`skim-spine`): from the first section on, one `**bold**` span per prose paragraph over 45 words, 4 to 25 words with no citation inside, bold at most 15 percent of the section prose (the approved 429 post: 12.3), every span also a `<strong>` in index.html; no placeholders |
| figures | at least 5 `<figure>`s, every one captioned, every caption citing a source that exists, images resolving inside the post, label-length text inside the SVGs; visual cadence (`visual-cadence`): no run of 3 or more prose paragraphs in `post.md` without an image, table, code block or callout, and in words (`prose-run-words`, at most 300 words of prose between visuals; `padding-paragraphs`, at most 30 percent of the prose in one-sentence paragraphs of 40 words or fewer) |
| voice | first-person words in prose (outside code and quotes); no em or en dash in `post.md`, `index.html` or a figure (`no-em-dash`) |
| medium-fidelity | no network resources (static and rendered), highlighted code, a dark scheme, smallest body type at 1440 (>= 18 px) and 390 (>= 17 px), smallest caption/chrome type (>= 13 px), no sideways scroll at 390 |
| truth | >= 8 sources, >= 3 primary, >= 1 counter; every source dated with an http(s) URL; every `[n]` resolves; every claim's source exists; the Sources list and `sources.json` numbered 1 to N with no gap or repeat (`source-numbering`); item `critique`: at least 2 reviewers completed every round, and every `blocker` `factual` finding has a disposition with a reason; on a trial run also `trial-preview` and `trial-figure` (Trials) |
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
is the operator's front door for classic posts; the CLI verbs below are what it calls).

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
- **Grok descoped (2026-10-14).** Four parallel runs the same day each lost grok to `cancelled: I'll read REVIEW.md…` before its first turn (cost $0.19 to $0.46 a run), so the engine, its envelope reader and its probes are gone and `gemini4` (agy, `gemini-4-argon`) holds its seat beside `gemini-3.8-flash`. Second wave (2026-10-14): at effort `high` and a 14 minute limit it timed out in 3 of the 4 first rounds (it completed round 1 in `blind-screening-and-redaction`, 13 findings and 2 blockers, and round 2 in `claim-verification-and-provenance`, 10 findings). It now runs at effort `medium` with a 35 minute limit.
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

## Rework: send the draft back

At the gate the operator has three acts. Approve lands the post, reject ends the piece, and
**rework** sends the draft back with an instruction when the thinking was fine and the writing is
not. It is `reworkRun(id, note)` in `lib/articles/engine.ts`, and `awaiting-approval -> drafting` is
the only edge it adds to the table in `lib/articles/store.ts` (`TRANSITIONS`). `rejected` is still
terminal: a reject throws the piece away, a rework is one piece of work with one card.

- **The record.** `ArticleRun.rework: {at, note, count}`. `count` is 1 for the first rework and
  rises by one each time, so a run reworked three times says 3; `note` and `at` are the latest.
  The key is absent on a run never reworked.
- **The note.** 1 to 2000 characters after trimming (`NOTE_MAX_CHARS`). An empty note and one over
  2000 are refused with 400 `bad-note`. A reject cuts a longer note at 2000; a rework refuses it,
  because a cut instruction silently changes what was asked.
- **What is kept.** Research, `sources.json`, `claims.json` and the outline are not touched, and no
  research turn runs. What re-runs is the draft, the critique and the check.
- **What is moved, not deleted.** Every later step resumes at file level and would find its own old
  answers and skip itself, so the draft, critique and check step records leave `steps`, and the
  critique's `round-*` directories, `checks/`, `check.json` and `check/` move to
  `rework/<count>/before/` with the old step records (their costs are there, not in `steps`).
  The reviewer panel snapshot (`critique/reviewers.json`) stays: a run keeps the panel it started
  with. The old post stays in `post/` until the new draft replaces it, so a rework that fails
  halfway still has a post. `ArticleRun.critique` is cleared and is rebuilt by the new critique.
- **How the note reaches the writer.** The draft turn's prompt gets a section of its own after the
  whole standing brief, headed `REWORK <n> OF THIS DRAFT: THE OPERATOR'S INSTRUCTION`
  (`reworkSection` in the engine). It says the instruction decides what changes, that research and
  sources are kept and not to be redone, and that the output contract and the check's bars still
  bind. The old post is staged in the workspace as `inputs/previous-post/`. No other turn is given
  the note. `agent/draft-prompt.md` holds the exact prompt.
- **Cost.** No research turn, so no live web and none of the research phase. The draft turn is paid
  again, and the whole critique (four reviewers, the writer's answer, and any revision) and the
  check run again. On the runs of 2026-10 the critique was about three quarters of a run's cost
  (see "Lessons from the first full run"), so a rework costs most of what a first run did, less
  research and outline: plan on the order of three quarters of `RUN_COST_HINT`, not a draft's worth.
  This is an inference from the step costs of those runs, not a measured rework.
- **The drive.** Like approve and resume, the engine verb only moves the run; the caller drives it
  (`driveRun`, or `launchRun` in the route). A rework is refused with 409 `busy` while a driver
  still holds the run's lease, and with 409 `bad-transition` when the status is not
  `awaiting-approval`. A rework that fails goes `failed` like any run and `resume` goes back to
  `drafting`; the note stays on the run until the draft is done.

`rework <runId> --note "<text>"` is the CLI form: it calls the verb and then drives the run to the
gate again. Spending the operator's seat, it is the operator's act, as `resume` is.

## `landedAt`

`ArticleRun.landedAt` is an ISO time written once, by the `landed` transition at the end of
`land()` in the engine, and by nothing else. The key is absent (not null, not empty) on every run
that has not landed, and on every run that landed before the field existed. It is the event time a
retention policy needs: the canvas hides a landed article once it is more than 7 days old, and
`updatedAt` cannot say that, because every write of any kind restamps it. A reader meeting a
landed run with no `landedAt` must say it does not know when it landed rather than use
`updatedAt`.

## The gate and landing

Approval is per post and per patch: `approve <runId> --patches p1,p2` (or the gate's Approve with
the patch selection) records `approval {at, patches}`, then the engine lands
(`lib/articles/registryWrite.ts`). A trial run's required `t1` is in every approval, and its
landing adds `## Experiments` to `SOURCES.md` and a Trial block to the PR body (Trials):

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

## The Medium draft at the gate

Decided 2026-10-16, reversing the earlier non-goal "no browser automation of Medium". The
preview the app drew from `post/index.html` could not show how Medium reads the post (headings
remap, quotes become italic, code is re-highlighted, figures are re-uploaded), so the gate now
reviews the real thing.

- When a run reaches `awaiting-approval`, `draftAtGate` (`lib/articles/mediumDraft.ts`) rebuilds
  `medium/`, then `lib/medium` pastes `story.html`'s body into a private draft at
  `medium.com/new-story` in the operator's signed-in Chrome profile (`~/.medium-chrome`, CDP port
  9335, opened once with `npm run medium:browser`). Figures are pasted as PNG files and
  captioned; each Markdown table travels as a PNG figure (`table-NN.png`), because Medium has
  no table element. The driver reloads the saved draft and records how many figures it holds
  (`figures` of `figuresOf`). The run records `mediumDraft {state: creating|ready|unavailable, url?, shot?,
  figures?, reason?, at}`; absent fields are omitted.
- A rework that returns to the gate replaces the body of the same draft (`url` is kept, also
  through a failure). `post.md` stays the single source: nothing is read back from the draft, so a
  change asked for at the gate goes through Rework.
- The draft is a convenience, not a precondition. A browser that is not running, a signed-out
  profile or a refused paste becomes `unavailable` with its reason verbatim, and the in-app
  preview opens as the fallback.
- `MEDIUM_DRIVER`: `live` drives the profile, `fake` drives nothing (probes), unset is off. It is
  off by default so a probe or a CI run never reaches an account.
- It cannot publish: no selector for it exists (`lib/medium/selectors.ts`), the page aborts any
  request matching `/publish|/schedule|/submit`, and a probe fails on a publish or schedule button
  name in `lib/medium`. Tags are set at publish time in Medium, so `tags.txt` stays by hand.
- Recon and the driver's limits: `docs/medium-driver.md`.

## Headless

```bash
npx tsx pipeline/article.mts run (--subject <bundle/slug> | --topic "<text>") [--angle "<text>"] [--model <id>] [--effort <level>] [--reviewers <file>] [--json]
npx tsx pipeline/article.mts run --trial <id> [--json]
npx tsx pipeline/article.mts status [<runId>] [--json]
npx tsx pipeline/article.mts approve <runId> [--patches p1,p2] [--json]
npx tsx pipeline/article.mts reject <runId> --note "<text>" [--json]
npx tsx pipeline/article.mts rework <runId> --note "<text>" [--json]
npx tsx pipeline/article.mts resume <runId> [--reviewers <file>] [--json]
```

Exit 0 ok, 1 the run stopped somewhere else or the operation failed, 2 usage. `--json` prints one
document on stdout; the per-turn `[agent]` log lines go to stderr. `run` and `status` print the
critique: each reviewer with its outcome and error, the findings by disposition, and the decision.
`run --json` carries `critique` beside `{runId, dir, status}`. The `trial` verbs are in Trials. The
`article-run` skill orchestrates trials (the `trial` verbs, `run --trial` and `status`); the
`techwriter` skill is the dialogue and the loop for free topics and third-party posts. Neither
approves, rejects, reworks, resumes or lands.

A dry run against a throwaway registry, spending nothing, with every engine stubbed:

```bash
node tests/fixtures/articles/registry-fixture.mjs <scratch>/reg
STUB=tests/fixtures/articles/stub-agent.mjs
AI_REGISTRY_DIR=<scratch>/reg/registry ARTICLES_STORE_DIR=<scratch>/store \
  ARTICLES_AGENT_BIN="node|$STUB" ARTICLES_CODEX_BIN="node|$STUB|--as=codex" \
  ARTICLES_AGY_BIN="node|$STUB|--as=agy" \
  STUB_REVIEWERS="gemini4=unavailable" STUB_CRITIQUE_DECISIONS="rewrite,keep" \
  npx tsx pipeline/article.mts run --subject software-engineering/token-budgeting
```

Leaving out one of the four `*_BIN` variables runs that real CLI.

## For the routes and the /articles surface

The engine exports what the routes call, so the CLI and the UI cannot disagree:
`createRun`, `driveRun` / `launchRun` (fire-and-forget for a route), `getRun`, `getRunDetail`
(run, sources, claims, outline, meta, check, patches with their diffs, post path, and `trial` on a
trial run, read back from `experiment/`),
`listArticleRuns`, `approveRun`, `rejectRun`, `reworkRun`, `resumeRun`; `listTopicSubjects`
(registryRead) feeds the topic picker, and `listUncoveredTopics` (loop.ts) the ranked, titled list. All of `lib/articles/` except `types.ts` is server-only; a client component may
import `lib/articles/types.ts` and nothing else.

Routes (contract): `POST /api/articles`, `GET /api/articles`, `GET /api/articles/[runId]`,
`POST /api/articles/[runId]/approve` `{patches:[id]}`, `POST /api/articles/[runId]/reject` `{note}`,
`POST /api/articles/[runId]/rework` `{note}`, `POST /api/articles/[runId]/resume`,
`GET /api/articles/topics?limit=&bundle=`. Errors are `ArticleError` with an HTTP-shaped `status`
and a closed `code`, answered as `{error, code}`.

| Route | Door | Answers |
|---|---|---|
| `POST /api/articles/[runId]/rework` `{note}` | `guardRequest` (the drive restarts and spends the seat) | `{run}` with `status: "drafting"` and `rework`, and the drive started in the background. 409 `bad-transition` when the run is not at the gate, 409 `busy` while a driver holds it, 400 `bad-note` for an empty note or one over 2000 characters, 404 for no such run |
| `GET /api/articles/topics` | `guardAccessOnly` (it reads the registry from disk and spends nothing) | exactly what `listUncoveredTopics` returns: `{topics, covered, claimed, remaining}` with `topics` the `TopicChoice` list (`bundle`, `slug`, `category`, `file`, `title`, `angle`), `covered` the `CoveredItem` list (`key`, `source`, `ref`, `status`), `claimed` the sorted list of in-flight topic keys and `remaining` the number of uncovered subjects. `?limit=` is clamped by the function (1 to 50, default 10); a non-numeric one is 400 `bad-limit`. Each `?bundle=` adds a bundle the ranking leaves out (`includeBundles`). `remaining` equals `topics --json`'s on the same tree |

The route handlers, not the engine, start the drive: a route that calls `approveRun`, `reworkRun` or
`resumeRun` follows it with `launchRun`.

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
| `POST …/medium` | `guardRequest` | `ensureMediumDraft`: make the gate's private Medium draft again (the same draft's body is replaced). 409 `bad-transition` off the gate, 409 `draft-in-flight` while one is being made |
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
  a state banner, and the gate in its fixed order: the draft in a `sandbox=""` iframe, the trial
  (a `no trial` chip on a classic run), the critique, the check report, sources, patches with
  diffs, then Approve and Reject.
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
  - Patches: each gets a checkbox at the gate; a required `t1` is checked and locked. After
    approval each shows approved or declined.
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

`tests/golden-path/articles-{store,checks,registry,engine,critique,checkloop,ui,trial,trial-gate}.probe.spec.ts`, offline,
against `tests/fixtures/articles/registry-fixture.mjs` (a bare origin plus a clone; its stub gate
also knows the `critique` block and directory in outline), the stub agent through the real seam for
the writer and all four reviewer engines, and a stub `gh`. They never name the real registry.
`articles-critique` pins each engine's argv and fence, the envelopes (a 402 and a usage limit
included), the schemas, every critique flow, resume inside the step, the check item and the
write-back. `articles-checkloop` seeds one defect with `STUB_POST_DEFECT` (an em dash, in the draft,
a revision or the fix itself) and pins the between-turn check: the failure reaches the fix prompt
and file, the fix replaces the post, the bound of two holds, a failed fix is recorded, a revised
post is checked before the next review round, resume is idempotent, plus agy's early 503 and the
shorter agy timeout. The v1 `/articles` pages, their routes and `articles-ui` retired in Phase 6: an article is
launched from the Floor's article lane and approved on the Board (`/board/pkt:article:<runId>`);
`article-file.test.ts` holds the one kept route, the draft's file door.
`articles-trial` pins the trial verbs: the verdict table, the seal, the exec environment and wall
cap, close and its lead, `open` on the fixture registry, and the CLI. `articles-trial-gate` pins a
trial run's registry outcome: `t1` lands without being selected, `## Experiments`, the Trial block,
and the leads.
