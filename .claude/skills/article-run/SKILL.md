---
name: article-run
memory: none
category: Content
description: Start a technical blog post through the article pipeline (lib/articles) headlessly and report where it stands - research with live web, outline, draft and a deterministic check, stopping at the human gate in /articles. Wraps `run` and `status` of pipeline/article.mts only; it never approves, rejects or lands anything. Invoke with /article-run <bundle/slug | "free topic"> [--angle "..."] [--model id] [--effort level], or /article-run status [<runId>].
argument-hint: "<bundle/slug | \"topic text\"> [--angle \"...\"] | status [runId]"
allowed-tools: Read, Bash, PowerShell, Glob, Grep
---

# Article run: to the gate, never past it

A thin wrapper over the same CLI the /articles section's engine uses. It owns no logic: every verb is
`npx tsx pipeline/article.mts <verb> --json`, and the engine (`lib/articles/engine.ts`) is the only
thing that changes a run.

## The one rule

**This skill never runs `approve`, `reject` or `resume`, and never lands anything in the registry.**
Approval is the human's act at the gate (`/articles/<runId>`, or the operator typing `approve`
themselves). Landing pushes a branch and opens a PR in ai-registry; nothing an agent decides on its
own may cause that. If the user asks this skill to approve, say that approval happens at the gate and
give them the run id.

## Before starting a run: it spends

A run starts three real agent sessions on the operator's logged-in Claude seat (research uses web
search and fetch; it is the dearest). Say so before the first `run` of a session and wait for a yes,
unless the user's own message already asked for the run explicitly. A dry run with the stub agent
spends nothing:

```bash
ARTICLES_AGENT_BIN="node|tests/fixtures/articles/stub-agent.mjs" npx tsx pipeline/article.mts run --topic "..." --json
```

The registry must be reachable: `$AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`, else
`../ai-registry`. In a git worktree of this repo `../ai-registry` usually does not exist; set
`AI_REGISTRY_DIR` to the registry checkout. An unreachable registry fails the run with
`registry-unreachable`, by design.

## Run

Arguments: a registry subject as `<bundle>/<slug>` (e.g. `software-engineering/agent-cli-transport`)
or free text in quotes. Optional `--angle`, `--model` (default the repo's `lib/model.ts` MODEL),
`--effort` (`low|medium|high|xhigh|max`, default `high`).

```bash
npx tsx pipeline/article.mts run --subject software-engineering/agent-cli-transport --angle "..." --json
npx tsx pipeline/article.mts run --topic "The token tax" --json
```

The command blocks until the run reaches the gate (tens of minutes for a real run; use a background
shell and wait for it rather than polling). Its stdout is one JSON line: `{runId, dir, status}` and
`error` when it failed. Exit 0 means `awaiting-approval`; 1 means the run stopped elsewhere; 2 is a
usage error.

## Status

```bash
npx tsx pipeline/article.mts status <runId> --json   # the whole run.json
npx tsx pipeline/article.mts status --json           # every run, newest first
```

## Report

After a run, read `<dir>/check.json` and report, in this order:

1. The run id, its status, and the gate: `/articles/<runId>`.
2. The check's failures (they are listed first), each with its value and the bar. Say plainly that
   `storytelling` and `depth` are not measured by the check; they are the human's judgement.
3. Sources: count, primary, counter (`<dir>/sources.json`).
4. Proposed registry patches (`<dir>/patches.json`): id, kind, target, rationale. Anything in
   `<dir>/patches.rejected.json` was refused by the engine; say why.
5. Cost per step from `run.json` `steps[].costUsd`. A step without the field is unpriced, not free.

If the run failed, report `error` verbatim and which step failed. `<dir>/agent/<step>.json` holds the
agent's outcome (`completed | timed-out | errored | seat-limit`); a `seat-limit` is a run that did
not happen, not a verdict on the topic. Suggest `resume` to the operator; do not run it.
