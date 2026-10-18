---
name: article-run
memory: none
category: Content
description: Orchestrate measured technical posts from ai-registry subjects. Ranks subjects for a trial, frames up to three trials in parallel with Sonnet subagents (one rule of the subject's golden path against the strongest alternative in current use), vets the designs, asks the operator once, then measures, closes and writes each post through the article pipeline (lib/articles) to the human gate on the Board. Wraps the `trial` verbs, `run --trial` and `status` of pipeline/article.mts; it never approves, rejects, reworks, resumes or lands anything. Invoke with /article-run [--budget USD] [--max N] [<bundle/slug> ...], or /article-run status [<runId>].
argument-hint: "[--budget USD] [--max N] [<bundle/slug> ...] | status [<runId>]"
allowed-tools: Read, Bash, PowerShell, Glob, Grep, Agent, SendMessage, AskUserQuestion, Write
---

# Article run: a measured claim, to the gate and never past it

A registry subject's golden path claims a best practice. A **trial** measures one rule of it
against the strongest alternative in current use, on this machine, and the article is written
around that result: upheld, challenged or null, it teaches either way, and a challenged rule goes
back to the registry as evidence. The evidence that made this the job: 17 of 17 posts before trials
disclaimed any measurement of their own in the preview, 88 to 94 percent of their prose sat in cited
paragraphs, and 6 angles promised a first-hand measurement that 0 delivered. Their 17 registry
patches went 14 to the writing standard and 0 to the run's own subject; none was adopted.

This skill orchestrates. A Sonnet subagent per trial frames and measures with its own shell
([trial-agent.md](trial-agent.md)); code computes the verdict; the engine (`lib/articles/engine.ts`)
writes, critiques and checks the post exactly as for any run. Every command is
`npx tsx pipeline/article.mts <verb> --json`. Free topics and third-party posts stay with
`/techwriter`.

**A run is a kernel job** (Phase 4; `lib/producers/article.ts`). `run` launches the run's job
(`job:run:<runId>`: a receipt, then the CLI's own confirm) and drives it in this process under the
kernel's lease on the `seat.text` lane; the Floor's article lane and the Board make the SAME job records, so
a run started in the browser is driven or resumed here by its run id. `--detach` only enqueues (the
worker, `npm run worker`, drives it). A run that dies mid-step is `interrupted` and HOLDS the
`seat.text` lane until the operator resumes it ("credits may be spent - look first"): that is the
operator's act, never this skill's.

## The one rule

**This skill never runs `approve`, `reject`, `rework` or `resume`, and never lands anything in the
registry.** Approval is the operator's act at the gate (the Board, `/board/pkt:article:<runId>`, or
the operator typing `approve` themselves). Landing pushes a branch and opens a PR in ai-registry,
and for a trial it lands the measurement record too; nothing an agent decides on its own may cause
that. If asked to approve, say that approval happens at the gate and give the run id. `trial drop`
is allowed: it closes a trial that will not run and lands nothing.

## What it spends

- **Framing** is cheap: one Sonnet session per trial with web search, and pilots on the operator's
  seats. Invoking the skill is the go-ahead for it.
- **Each article is about $80 to $90 reported**: writing about $65 to $67 (17 runs reported $1,109 by
  2026-10-17, the critique about 70 percent of it; four parallel runs on 2026-10-14 cost $55 to $67
  each) plus the trial at about $5 to $15. Codex and both agy seats report no cost, so the real spend
  is higher; say so every time a price is shown. `run --trial` takes `--budget-usd` like any
  run; without it the budget only sizes N and nothing enforces it mid-run.
- **The confirmation (step 5) is the yes** for the measurement and the writing.
- **`--budget-usd X` puts a ceiling on a run's job**: a run is priced at up to $92, so a ceiling under
  that is refused before anything is created, and one above it is held between steps and between the
  turns inside a step. `GRAVITONE_DRY_ONLY=1` refuses every live run.

The registry must be reachable: `$AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`, else
`../ai-registry`. In a git worktree `../ai-registry` usually does not exist; set `AI_REGISTRY_DIR` to
the registry checkout on every command. An unreachable registry fails with `registry-unreachable`,
by design. The store is the checkout's own `foundry-out/articles/` (`ARTICLES_STORE_DIR` overrides
it) and trials sit beside it in `foundry-out/article-trials/` (`ARTICLES_TRIALS_DIR`); runs started
from a worktree are seen only by that worktree's Board unless the store is pointed elsewhere.
Leads go to the MAIN checkout's `.ai/registry-leads.jsonl` from a worktree too.

A dry run of the writing spends nothing, against any closed trial: `--dry` makes the run's job dry,
and every agent turn of it, writer and reviewer, is answered by the stand-in
(`lib/articles/dryStandIn.mjs`, or `ARTICLES_DRY_AGENT_BIN`) whatever the environment says. Its turns
are counted as would-calls, and approving a dry run's post lands nothing.

```bash
npx tsx pipeline/article.mts run --trial <trialId> --dry --json
```

The trial verbs themselves are pinned offline by `tests/golden-path/articles-trial.probe.spec.ts`.

## 1. Candidates

```bash
npx tsx pipeline/article.mts trial candidates --limit 10 --json
```

`{candidates, claimed}`: subjects ranked by relevance to this repo and by evidence that their facts
have moved (`governsHere`, `contested` applications whose `ab_verdict` is not-better, `atRisk`,
`volatile`, `changedAt`), with subjects an open trial or a trial run already holds left out and
listed in `claimed`. Validity comes first because the classic runs met stale premises: 13 of 16
round-1 critique decisions were re-research, and two posts stood on a premise already gone
(judge-calibration "announced dead twice", unattended-run-isolation's "Codex Cloud (Legacy)").

Pinned subjects (`/article-run <bundle/slug> ...`) replace the ranking; judge them the same way.

For each candidate from the top, read its golden path (the candidate's `file`, in the registry) and
its techniques (`techniques/` beside it), and judge **testability on this machine**: can one
technique's rule be measured with local code, simulations, tokenizers, local models or the seat
CLIs (claude, codex, agy on the operator's logins) within about 40 minutes and a bounded number of
model calls? Skip, with the reason, a subject whose claim needs production traffic, a paid vendor
API key, or hardware this box lacks (check, for example `nvidia-smi` for a GPU; do not assume).
Stop once you have as many testable subjects as step 2's other bounds allow.

## 2. How many (N)

N = the smallest of:

- 3, the operator's ceiling on parallel subagents, and `--max` when given;
- floor(budget / 100 USD). The budget is the operator's `--budget`. When it is absent, derive it as
  100 USD per article, never for more than 3 articles, and say so in your first line;
- the testable candidates;
- 3 minus the article runs already driving.

A run is driving when its status is a working one (`queued`, `researching`, `drafting`,
`critiquing`, `checking`, `approved`, `landing`) and one of its jobs is `running`: `status <runId>
--json` carries `jobs` (the kernel's claim, not a pid file; `lib/producers/article.ts`). Read that for
every working run in `status --json`. The same store pass lists runs that failed on `seat-limit` in
the last 24 hours:

```bash
node -e '
const fs=require("fs"),p=require("path");
const root=process.env.ARTICLES_STORE_DIR||"foundry-out/articles";
const read=(f)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return null}};
const seatLimit24h=[];
for(const id of fs.existsSync(root)?fs.readdirSync(root):[]){
  const r=read(p.join(root,id,"run.json"));if(!r)continue;
  if(r.status==="failed"&&/seat-limit/.test(r.error||"")&&Date.now()-Date.parse(r.updatedAt)<864e5)seatLimit24h.push(id);
}
console.log(JSON.stringify({seatLimit24h}));'
```

**Drop N to 1** when a run ended `seat-limit` in the last 24 hours: the seat's window is the
constraint, and three runs would only queue on it. A trial whose design needs exclusive hardware (a
GPU, a fixed port) is measured alone (step 6): two harnesses on one device measure each other.

Say N and why in one line before framing.

## 3. Frame

For each chosen subject:

```bash
npx tsx pipeline/article.mts trial open <bundle/slug> --json
```

It writes the trial and its `brief/` (golden path, techniques, applications with their
`ab_verdict`, currency, the contexts here it governs) and answers with the trial's `id`. The trial
dir is `<trials root>/<id>`, and `trial status <id> --json` names it (`dir`). `409 trial-claimed`:
another trial holds the subject; take the next candidate.

Then launch **one subagent per trial, all N in ONE message**: `Agent` with
`subagent_type: "general-purpose"`, `model: "sonnet"`, in the background, `description`
`frame trial <slug>`, and as the prompt the FRAME section of [trial-agent.md](trial-agent.md) with
`<TRIAL_ID>` and `<TRIAL_DIR>` (absolute, forward slashes) filled in. Keep each agent's id: step 6
resumes the same agent. Each replies with a design card and stops.

## 4. Vet (no spend)

For each returned design:

```bash
npx tsx pipeline/article.mts trial check <id> --json
```

`{record, prereg, validity}`. Read the trial's `frame.md` beside it, then drop the trial when:

- **the alternative is a strawman**: it is the golden path's own "naive reading" or a failure mode
  the golden path argues against (open `brief/golden-path.md` and compare). That foil always loses,
  and the trial would say nothing;
- **the metric does not measure the claim** (a latency metric for a correctness rule);
- **n or the band cannot separate the arms**: the verdict compares the mean difference with the
  band and runs no significance test, so as a rough bar the band should exceed
  `2 x sd x sqrt(2 / n)` with the pilot's sd (measurement-honesty/noise-band-and-hysteresis);
- **both arms piloted at the metric's ceiling** (an sd of 0 is not low noise, it is no room): the
  trial can only end `null`. Keep it only when frame.md says the null is the intended result and
  why it teaches something; otherwise send it back once to harden the task (2026-10-18:
  agent-instruction-files piloted 8 of 8 in both arms and was kept as a deliberate null);
- **a guard the winning arm can clear only by its grader's leniency or miss only by its grader's
  strictness**: read the grading rule in the harness against a few pilot answers (2026-10-18:
  prompt-assembly's whole-token key scored "Foxglove" wrong against "Team Foxglove", and the
  alternative met its 0.9 accuracy guard with no margin);
- **the golden arm is not the rule as written** (measurement-honesty/the-baseline-is-the-untouched-path),
  or the design keeps a best of several runs (eval-harness/selection-over-noise);
- **validity is `stale` or `untestable`**, or `trial check` fails.

```bash
npx tsx pipeline/article.mts trial drop <id> --reason "<why, one line>" --json
```

A `stale` validity files its subject lead through `drop`. A design may go back to its subagent ONCE
with `SendMessage` and a specific fix (what to change and why); check it again when it returns. A
dropped trial is not replaced in this batch.

## 5. One confirmation

ONE `AskUserQuestion`, `multiSelect: true`, one option per surviving trial:

- label: the subject (`bundle/slug`);
- description: claim vs alternative; the metric and its direction; n per arm; the budget (wall
  minutes, model calls); "exclusive hardware, measured alone" when it is; and the article's
  expected cost, about $80 to $90 reported.

The question itself carries the total for everything picked, and the line that codex and agy
report no cost. Picking is the yes. Every unpicked trial:

```bash
npx tsx pipeline/article.mts trial drop <id> --reason "operator declined" --json
```

With one surviving trial the picker still needs two options: ask single-select between it and
`Drop it`. Nothing picked, nothing survives: report and stop.

## 6. Measure

`SendMessage` each picked agent, all in ONE message, with the RUN section of
[trial-agent.md](trial-agent.md), filled the same way. If an agent cannot be resumed, launch a
fresh `Agent` (`general-purpose`, `model: "sonnet"`) with the same RUN text: it reads everything
from the trial dir. A trial needing exclusive hardware gets its RUN alone, before or after the
others, never beside them.

Each agent seals, measures every command through `trial exec`, writes `results.json`, runs
`trial close` and replies with its verdict card followed by a `=== REPORT.md ===` line and the
report. **Save that report yourself** as `<trialDir>/REPORT.md`, verbatim, under a one-line note
that you transcribed it: the agent harness refuses a subagent's report file ("Subagents should
return findings as text"; 2 of 2 trials on 2026-10-18), and the writer and the reviewers read
`REPORT.md`, so it must exist before step 7. Confirm the verdict from the store, not the card:

```bash
npx tsx pipeline/article.mts trial status <id> --json
```

- **`void`** (a control failed, an arm fell short of `n`, or the harness passed its model-call
  budget): report the reason from `verdict.json`; `close` has filed its registry lead. No article.
- **An agent that stopped without closing** (`budget-spent`, a broken harness): report its last
  `exec.jsonl` record and leave the trial for the operator. It still holds its subject until the
  operator closes or drops it.

## 7. Write

For every closed trial whose verdict is not `void`, start all runs in ONE background shell, each
with `nohup … > out 2> err &` (`<scratch>` is the session's scratchpad):

```bash
for t in <trialId> <trialId>; do
  nohup npx tsx pipeline/article.mts run --trial "$t" --json > "<scratch>/$t.out" 2> "<scratch>/$t.err" &
done
```

Each run's id is linked into its trial within seconds of creation:
`python -c "import json,sys;print(json.load(open(sys.argv[1]+'/trial.json')).get('runId','-'))" <trialDir>`.
A trial that never gets one and whose `.out` holds `{error, code}` was refused before anything was
created (`trial-not-closed`, `trial-void`, `trial-taken`, `trial-mismatch`, `no-trial`): report
the code.

Four parallel `run` processes are fine (separate run dirs, nothing shared but the seats); measured
2026-10-14: four runs, three reached the gate in about two hours of wall time, the fourth about an
hour later.

**Wait with one poller, not a chain of monitors.** A Monitor expires after 30 minutes and a run takes
hours. Use one background Bash with an `until` loop that exits when every run is terminal, so you
get a single completion notice:

```bash
until [ "$(for r in <runId> <runId>; do python -c "import json;print(json.load(open('foundry-out/articles/$r/run.json'))['status'])"; done | grep -cvE 'awaiting-approval|failed|rejected|landed')" = 0 ]; do sleep 60; done
```

**A run's job says whether anything holds it.** `status <runId> --json` carries `jobs`: each job of
the run with its state (`queued`, `running`, `interrupted` with the step it died in, `failed`,
`done`), mode and spend. A working status whose job is `running` is being driven.

**A quiet `run.json` is not a dead run.** `run.json` is rewritten at step boundaries, and a critique
fix round can leave it untouched for 30 minutes. Before calling a run stuck, list `<dir>/agent/` and
`<dir>/critique/round-<n>/` by mtime: a file written in the last few minutes means it is working.

## 8. Report

Per run, in this order, the trial first:

1. **The trial**, from `<dir>/experiment/`: the verdict and its reason (`verdict.json`), the claim
   (quoted) vs the alternative with its dated source, the metric and direction, per arm n / mean /
   sd / guards cleared, the band and the delta, `deltaCi95` as reported-not-decisive, each control
   held or not, model calls against the budget. Say whether the agent called the result a discovery
   or a mirror of its prior (`REPORT.md`).
2. The run id, its status, and the gate: `/board/pkt:article:<runId>`.
3. The critique, from `run.json` `critique`: rounds, each reviewer with its engine, model and
   outcome, and the error of any that did not complete (an `unavailable` or `seat-limit` reviewer is
   a review that did not happen, not a verdict). Then the findings by disposition and the writer's
   decision. **METHOD findings** (the review's method lens: confounds, arm fairness, controls, n,
   the band, whether the verdict follows, overclaiming) arrive as `kind: "factual"` with a
   `location` starting `METHOD:`; count them separately, with their dispositions. The per-round
   detail is in `<dir>/critique/round-<n>/`.
4. The check's failures (they are listed first), each with its value and the bar, including
   `trial-preview` (the text before the first section cites [1] and states the per-arm n) and
   `trial-figure` (a figure caption cites [1]). Say plainly that `storytelling` and `depth` are not
   measured by the check; they are the human's judgement.
5. Sources: count, and the primary and counter split (`primary` / `counter` flags on each row of
   `<dir>/sources.json`; count them). Row 1 is the trial's record and must equal
   `<dir>/experiment-source.json`. If `source-dates` fails, name the source that breaks it.
6. The registry outcome (`<dir>/patches.json`): `t1`, the application record at
   `run.trial.applicationPath`, which is `required` and lands with the post whatever the approval
   names; any technique amendment (`kind: technique`, a file in the subject's `techniques/`)
   proposed beside it; what `<dir>/patches.rejected.json` refused and why (a trial run patches
   nothing else, the writing standard included). Leads: what `close` or `drop` filed; a
   `challenged` or `null` landing files a technique lead and a reject files an application lead,
   both at the operator's act. The contexts here the subject governs (`governsHere`).
7. Cost per step from `run.json` `steps[].costUsd` (a step without the field is unpriced, not free;
   codex and agy reviewers never report a cost), plus the trial's own spend: the subagent's session
   and the harness's model calls, unpriced unless the harness recorded a price.

If a run failed, report `error` verbatim and which step failed. `<dir>/agent/<step>.json` holds the
agent's outcome (`completed | unavailable | timed-out | errored | seat-limit`); a `seat-limit` is a
run that did not happen, not a verdict on the topic. `critique: critique-quorum: …` means fewer than
two reviewers completed a round, and the error names each one's reason. A research turn whose
source 1 differs from the trial's record fails with `source 1 must be the trial's record
(experiment-source.json); …` naming the fields that differ. Suggest `resume` to the operator; do not
run it.

End a batch with one table: subject, verdict, check (failures), METHOD findings
(accepted/rejected), cost reported. Then the voids and drops, each with its reason.

## Reading a batch

What the batch says about the pipeline: which reviewer seat errored in every run (that is
configuration, not bad luck: grok's `cancelled` in 4 of 4 runs on 2026-10-14 is why it was
descoped), whether every run ended in `rewrite`, the wall-time spread, and which reviewers raised
the METHOD findings the writer accepted. `gemini4` (Gemini 4 Argon) ran at `high` / 14 min and timed
out in 3 of 4 first rounds, so it now runs at `medium` / 35 min; check that it completes. Per-reviewer
yield is in `run.json` `critique.reviewers` and `<dir>/critique/round-<n>/reviews/<id>.json`. Across
trials: how often the alternative won, how many trials were void or dropped and why, and whether the
agents' priors were mirrors.

## Registry yield

A trial carries its own registry record: the application `t1` with `applied: experiment`, its
`ab_verdict` and `proof: ab-paired`, any technique amendment, and the leads filed at close, drop,
reject or landing. There is nothing to extract afterwards. [subject-delta.md](subject-delta.md)
measures what a classic run's research is worth to the registry and is for classic runs only.

## Status

```bash
npx tsx pipeline/article.mts status <runId> --json   # the whole run.json, plus `jobs`
npx tsx pipeline/article.mts status --json           # every run, newest first
npx tsx pipeline/article.mts trial status [<id>] --json
```
