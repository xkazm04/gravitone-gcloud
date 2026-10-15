---
name: article-run
memory: none
category: Content
description: Start a technical blog post through the article pipeline (lib/articles) headlessly and report where it stands - research with live web, outline, draft, a multi-model critique and a deterministic check, stopping at the human gate in /articles. Wraps `run` and `status` of pipeline/article.mts only; it never approves, rejects or lands anything. Invoke with /article-run <bundle/slug | "free topic"> [--angle "..."] [--model id] [--effort level], or /article-run status [<runId>].
argument-hint: "<bundle/slug | \"topic text\"> [--angle \"...\"] | status [runId]"
allowed-tools: Read, Bash, PowerShell, Glob, Grep
---

# Article run: to the gate, never past it

A thin wrapper over the same CLI the /articles section's engine uses. It owns no logic: every verb is
`npx tsx pipeline/article.mts <verb> --json`, and the engine (`lib/articles/engine.ts`) is the only
thing that changes a run.

## The one rule

**This skill never runs `approve`, `reject` or `resume`, and never lands anything in the registry.**
Approval is the human's act at the gate (the Board, `/board/pkt:article:<runId>`, or the operator typing `approve`
themselves). Landing pushes a branch and opens a PR in ai-registry; nothing an agent decides on its
own may cause that. If the user asks this skill to approve, say that approval happens at the gate and
give them the run id.

## Before starting a run: it spends

A run starts real agent sessions on the operator's logins. There are three writer sessions on the
Claude seat (research uses web search and fetch). Then the critique runs four reviewers with web
access through the local claude, codex and agy CLIs (agy serves two seats, Gemini 3.8 Flash and Gemini 4 Argon), plus one to four more writer sessions:
8 agent turns at the least, 26 at the most (docs/articles.md, "The critique"). Say so before the
first `run` of a session and wait for a yes, unless the user's own message already asked for the
run explicitly. A dry run with every engine stubbed spends nothing:

```bash
STUB=tests/fixtures/articles/stub-agent.mjs
ARTICLES_AGENT_BIN="node|$STUB" ARTICLES_CODEX_BIN="node|$STUB|--as=codex" \
  ARTICLES_AGY_BIN="node|$STUB|--as=agy" \
  npx tsx pipeline/article.mts run --topic "..." --json
```

Leaving out one of the three variables runs that real CLI.

The registry must be reachable: `$AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`, else
`../ai-registry`. In a git worktree of this repo `../ai-registry` usually does not exist; set
`AI_REGISTRY_DIR` to the registry checkout. An unreachable registry fails the run with
`registry-unreachable`, by design.

## Run

Arguments: a registry subject as `<bundle>/<slug>` (e.g. `software-engineering/agent-cli-transport`)
or free text in quotes. Optional `--angle`, `--model` (default the repo's `lib/model.ts` MODEL),
`--effort` (`low|medium|high|xhigh|max`, default `high`), `--reviewers <file>` (a reviewer panel
in place of `pipeline/article-reviewers.json`).

```bash
npx tsx pipeline/article.mts run --subject software-engineering/agent-cli-transport --angle "..." --json
npx tsx pipeline/article.mts run --topic "The token tax" --json
```

The command blocks until the run reaches the gate (tens of minutes for a real run; use a background
shell and wait for it rather than polling). Its stdout is one JSON line: `{runId, dir, status}` and
`error` when it failed. Exit 0 means `awaiting-approval`; 1 means the run stopped elsewhere; 2 is a
usage error.

## Several runs at once

Four parallel `run` subprocesses are fine (separate run dirs, nothing shared but the seats); measured
2026-10-14: four runs, three reached the gate in about two hours of wall time, the fourth about an
hour later, about $55 to $67 each, critique being 75 to 80% of it. Pick subjects from different
bundles so the runs differ. Launch each with `nohup ... > out 2> err &` in ONE background shell, and
name the subjects and the cost to the user first.

**Wait with one poller, not a chain of monitors.** A Monitor expires after 30 minutes and a run takes
hours. Use one background Bash with an `until` loop that exits when every run is terminal, so you
get a single completion notice:

```bash
until [ "$(for r in <runId> <runId>; do python -c "import json;print(json.load(open('foundry-out/articles/$r/run.json'))['status'])"; done | grep -cvE 'awaiting-approval|failed|rejected|landed')" = 0 ]; do sleep 60; done
```

**A quiet `run.json` is not a dead run.** `run.json` is rewritten at step boundaries, and a critique
fix round can leave it untouched for 30 minutes. Before calling a run stuck, list `<dir>/agent/` and
`<dir>/critique/round-<n>/` by mtime: a file written in the last few minutes means it is working.

## Status

```bash
npx tsx pipeline/article.mts status <runId> --json   # the whole run.json
npx tsx pipeline/article.mts status --json           # every run, newest first
```

## Report

After a run, read `<dir>/check.json` and report, in this order:

1. The run id, its status, and the gate: `/board/pkt:article:<runId>` (the run's page: `/articles/<runId>`).
2. The critique, from `run.json` `critique`: rounds, each reviewer with its engine, model and
   outcome, and the error of any that did not complete (an `unavailable` or `seat-limit` reviewer
   is a review that did not happen, not a verdict). Then the findings by disposition and the
   writer's decision. The per-round detail is in `<dir>/critique/round-<n>/`.
3. The check's failures (they are listed first), each with its value and the bar. Say plainly that
   `storytelling` and `depth` are not measured by the check; they are the human's judgement.
4. Sources: count, and the primary and counter split (`primary` / `counter` flags on each row of
   `<dir>/sources.json`; `run.json` does not carry them, so count them). If `source-dates` fails, name
   the source that breaks it.
5. Proposed registry patches (`<dir>/patches.json`): id, kind, target, rationale. Say when a patch
   targets a different bundle than the subject (a `retry-backoff` run proposed two against
   `technical-writing`). Anything in
   `<dir>/patches.rejected.json` was refused by the engine; say why.
6. Cost per step from `run.json` `steps[].costUsd`. A step without the field is unpriced, not free.
   codex and agy reviewers never report a cost.

If the run failed, report `error` verbatim and which step failed. `<dir>/agent/<step>.json` holds the
agent's outcome (`completed | unavailable | timed-out | errored | seat-limit`); a `seat-limit` is a
run that did not happen, not a verdict on the topic. `critique: critique-quorum: …` means fewer than
two reviewers completed a round, and the error names each one's reason. Suggest `resume` to the
operator; do not run it.

## Reading a batch

When several runs finish together, end with a table (check, findings accepted/rejected/deferred,
sources primary/counter, cost) and then what the batch says about the skill: which reviewer seat
errored in every run (that is configuration, not bad luck: grok's `cancelled` in 4 of 4 runs on
2026-10-14 is why it was descoped), whether every run ended in `rewrite`, and the wall-time spread.
`gemini4` (Gemini 4 Argon) ran at `high` / 14 min and timed out in 3 of 4 first rounds, so it now runs at `medium` / 35 min; check that it completes. Per-reviewer yield is in `run.json` `critique.reviewers` and `<dir>/critique/round-<n>/reviews/<id>.json`.

## Registry yield (optional, after the gate)

The research a run collects (`claims.json`, `sources.json`) is worth more to ai-registry than the
article is, and the run's own `patches.json` does not show it: patches target the writing standard,
never the subject's golden path (0 of 5 across eight runs, 2026-10-14). To measure the yield, run
[subject-delta.md](subject-delta.md) as a read-only subagent per gated run, parallel and cheap
beside the run itself. It compares every claim to the subject's golden path, techniques and
applications, and opens the sources of its top five candidates.

Land only what comes back **VERIFIED**, as lines in `.ai/registry-leads.jsonl` (the schema is the
file's own: `ts, bundle, nearest, kind, claim, because, confidence, from`; a claim is "When X, do Y,
because Z"; `from` is `article-run@<date>`). That file is the consumer-side channel: the registry's
`leads-collect.mjs` folds it into `librarian/inbox.md`, and `/librarian` dispatches a scoped
`/deepen` at the subject. Never edit the registry from here, and never write a lead from a claim
the agent did not open the page for. The registry's `check-currency.mjs --volatile --subject <slug>`
is how that `/deepen` run finds the dated facts to re-check.

Spend where facts are set by a vendor or a platform (pricing, ad rules, API limits, standards
status). Stable subjects returned small additions and no corrections.
