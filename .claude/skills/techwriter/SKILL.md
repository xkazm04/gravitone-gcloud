---
name: techwriter
memory: none
category: Content
description: Write a technical blog post through the article pipeline, from topic choice to the human gate, using what the first six runs taught. `/techwriter` opens a topic dialogue (uncovered registry subjects, you pick one), then runs research, outline, draft, the check loop and the multi-model critique and reports where the post waits in /articles. `/techwriter --loop N` is the unattended mode for nightly jobs: it covers topics until N are covered, under a budget, with no dialogue. It never approves, rejects, lands or pushes anything. Single headless runs without the dialogue stay with /article-run.
argument-hint: "[--loop N | --loop +N] [--budget USD] [--concurrency 1-5]"
allowed-tools: Read, Write, Bash, PowerShell, Glob, Grep, AskUserQuestion, Agent
---

# Techwriter: a topic in, a post at the gate out

The article pipeline (`lib/articles/`, CLI `pipeline/article.mts`) already knows how to write, check
and critique a post. This skill is the operator's front door to it: it chooses the topic with you,
starts the run, watches it, and reports. It owns no logic: every step is one `npx tsx
pipeline/article.mts ...` call, and the engine is the only thing that changes a run.

## The one rule

**This skill never runs `approve`, `reject` or any landing, and never pushes or opens a PR.** The
post waits at the human gate (`/articles/<runId>`). Approval is the operator's act: it lands the
post in the registry's publications lane, with the Medium package beside it. If asked to approve,
say that approval happens at the gate and give the run id.

## Two modes

- `/techwriter` with no arguments: the dialogue below, one article.
- `/techwriter --loop N` (or `--loop +N`): unattended, no dialogue. `N` is the TARGET NUMBER OF
  COVERED TOPICS in total; `+N` means N more than are covered now. Covered means a run at the gate
  or a publication, see "Loop mode".

## Dialogue (no arguments)

1. Get the candidates, deterministic and ranked, covered topics already left out:

   ```bash
   npx tsx pipeline/article.mts topics --limit 8 --json
   ```

   `topics` offers only the audience bundles (agent-operations, llm-observability,
   software-engineering); `--include-bundle <b>` adds one. Each topic has `bundle`, `slug`, `title`,
   `category` and a suggested `angle`. **The suggested angle is boilerplate: do not show it.** Read the
   subject's golden path (`knowledge/<bundle>/.../<slug>`) and write each option's one-line hook
   yourself, naming the concrete problem a reader of an agent-building blog has, and pass that as `--angle`. The registry must
   be reachable (`$AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`, else
   `../ai-registry`); in a git worktree set `AI_REGISTRY_DIR`. Say how many topics are covered,
   in flight and uncovered (`covered`, `claimed`, `remaining`).

2. Ask ONE `AskUserQuestion`, single select, at most four options. Put the four best candidates as
   options (title as the label, the angle's first clause and the bundle as the description, the
   first marked "(Recommended)" only when you can say why: usually the bundle with the fewest
   covered topics). A fifth candidate goes into the question text, because the picker holds four;
   the user can always type a topic or a subject of their own under "Other". Put the price in the
   question itself: **a run costs $47 to $92 of reported seat spend (the mean of six was about
   $69) and 2.5 to 3.5 hours; the two reviewers that report no cost add to that.** Picking a topic
   is the yes. If the user types free text instead of a subject, use `--topic "<text>"`.

3. Run it. The default angle is a starting point; if the user's reply carries an angle, use theirs.

   ```bash
   npx tsx pipeline/article.mts run --subject <bundle>/<slug> --angle "<angle>" --json
   ```

   It blocks until the gate (use a background shell and wait for its completion notice; do not poll
   it). stdout is one JSON line `{runId, dir, status}`; exit 0 is `awaiting-approval`, 1 is a run
   that stopped elsewhere, 2 is a usage error.

4. If it ends `failed`, see "When a run fails", then report. Otherwise report (below).

## Loop mode (`--loop`)

```bash
npx tsx pipeline/article.mts loop --target N --budget-usd B --concurrency 3 --json
npx tsx pipeline/article.mts loop --add N --budget-usd B --json        # for --loop +N
```

- **A loop never starts without a budget.** `--budget USD` is the operator's. When it is missing,
  derive it and say so in your first line: 100 USD for every topic still to cover (the dearest
  run so far cost 92), and refuse to derive one above 8 topics: ask for an explicit `--budget`.
  The CLI itself refuses without `--budget-usd`.
- **The budget counts what the engine reports** (the Claude seat). Codex and Gemini report no cost,
  so the real spend is higher: say so in the report.
- Concurrency is 3 by default. Three is the only value tested on a live seat (the overnight batch);
  the CLI accepts up to 5, but a seat's usage window may not, so use more only when asked.
- It picks the ranked uncovered topics itself (`--topics <file>` takes a JSON array of
  `"bundle/slug"` or `{subject, angle}` instead). A failed topic does not count and the loop moves
  on to the next; it stops after 3 failed topics.
- Limits that stop it, all in `loop.json`: `target-reached`, `budget-stopped` (the next run would
  not fit, or reported spend passed the budget and the runs in flight were stopped at their next
  turn), `failure-stopped`, `topics-exhausted`. Per run, a cost ceiling ($120 reported) and a turn
  ceiling (45 agent turns) stop a runaway turn at its boundary and mark the run for a human; the
  loop never resumes such a run. A failed run is resumed up to 2 times.
- Run it in a background shell and wait for its completion notice. The report is
  `<store parent>/article-loops/<loop id>/loop.json` and `events.log` (beside the article store).
  After it ends, report as below for every run that reached the gate, then add one table for the
  loop: each run, its end (`at-the-gate`, `failed`, `ceiling-stopped`, `halted`), resumes, reported
  cost and turns, and why the loop stopped.
- A loop that is killed leaves runs in the store with no driver: `status` lists them, and the
  operator resumes them (`resume <runId>`). The skill does not resume on its own.

## When a run fails

`<dir>/agent/<step>.json` holds the agent's outcome (`completed | unavailable | timed-out |
errored | seat-limit`) and `run.json` `error` says where. What has happened so far, and what to do:

- **Re-research rejected at ingest** (a source with no URL, a changed or dropped URL): the turn
  now retries once from the files it wrote; if it still fails, `resume` re-runs only that turn.
  Cost of one lost turn: about $4.50 to $5.60.
- **Triage timeout** (the writer's answer to the reviews): it once finished in 7 minutes on retry
  after timing out at 20. The limit is now 30 minutes; `resume` retries.
- **Reviewer unavailable**: Grok has returned 402 (balance) in every run; Gemini has timed out
  (14 minute limit) or returned its early 503. A reviewer that did not complete is a review that
  did not happen, not a verdict. Two reviewers are the quorum.
- **`seat-limit`**: the Claude seat's usage window ran out. Nothing is wrong with the topic; wait
  and `resume`.
- **A ceiling or a budget stop** (error starts `run-ceiling` or `loop-halt`): the run was stopped on
  purpose. Report it and leave it for the operator.

Suggest `resume`; in a single run do not run it unasked. (In loop mode the CLI resumes within its
own bound.)

## Report

For every run at the gate read `<dir>/run.json`, `<dir>/check.json`, `<dir>/sources.json` and the
critique files under `<dir>/critique/`, and report in this order:

1. The run id, the status, and where it waits: `/articles/<runId>`. How to take it to Medium by hand
   if accepted: before approval `<dir>/post/index.html` is the page to copy from (open it in a
   browser and copy, or take `post.md`); approval at the gate lands it in the registry's
   `publications/<slug>/` with a `medium/` package.
2. The cost per step (`run.json` `steps[].costUsd`; a missing field is unpriced, not free) and the
   total, with the line that Codex and Gemini report no cost.
3. The check: every failing item first with its value and bar, then the dimension verdicts. The
   check passes five measured dimensions; `storytelling` and `depth` are the human's judgement.
   `<dir>/checks/` has every pass of the check loop and whether a fix turn ran.
4. The critique: rounds, each reviewer with engine, model, outcome and any error, the findings
   (total, accepted, rejected, deferred) and the decision. By reviewer: findings by severity and
   kind, accepted and rejected.
5. Sources: count, primary, counter. Proposed registry patches (`patches.json`).
6. A short reading note, written by reading the post: the opening, the preview, any wall of prose,
   the closing table, and which claims rest on third-party evidence. Write the reflection to
   `<dir>/reflection.md` (read-only for the post: never edit `post/` or `run.json`). Anything that
   should change in the pipeline goes in one line at the end, not into the post.

Say plainly what was not evaluated: the post was written by one model family and reviewed by two or
three others; nobody has read it yet.

## Hardened lessons (six real runs, 2026-10-05 to 2026-10-07)

What the first runs cost and how they failed, so that the next one is planned rather than
discovered:

- **Cost and time.** A run costs $47 to $92 of reported seat spend (mean about $69) and takes 2.5
  to 3.5 hours. Critique, with its fix turns, is about three quarters of it; one revise turn cost
  $17.61 and 79 turns. Fix turns cost $4 to $5 each, $9 to $25 a run, and the visual-cadence rule
  broke after a draft or a rewrite in every run: the prompts now state it in words as well as
  paragraphs, and the fix turn edits the post in place. Codex and Gemini turns are unpriced.
- **Never launch a loop without a budget.** Five runs overnight cost about $359 reported with no
  ceiling anywhere; the loop now needs a budget, stops launching when the next run would not fit,
  and stops a run at its ceiling.
- **Reviewers.** Claude and Codex find nearly all blockers, but which of them finds a given blocker
  changes from run to run (all four in one run from Codex alone), so keep both. Gemini raises few
  blockers and had the most rejected findings (up to 27 percent), but many of its findings are not
  found by the others: use it for format and engagement, weight its blockers lower. Grok has been
  unavailable on balance in every run: a panel of four is a panel of three.
- **What fails and how resume behaves.** Resume re-runs only the step that did not finish and reuses
  everything before it (the research, the draft, the reviews, the triage). Two runs failed at the
  re-research ingest, one at a stalled triage; the resumes finished them. A resume costs only the
  lost turn.
- **The evidence.** The angle often promises our own measurement; the evidence was third-party in
  all but one post. The preview must say which it is, and our own constructs carry Derived,
  Inference or Assumption labels. Research labels the population of every number.
- **The openings.** Most posts opened on statistics with 450 to 640 words before the first
  section. The standard is one concrete incident with its date, a one-line-per-section preview, and
  at most 450 words before the first section (a check holds it).
- **Template defects.** Body and chrome font sizes below the bar recurred after nearly every draft:
  they come from the page template, not the prose.
- **Sources.** Keep every source's number and URL in a re-research; append a replacement as a new
  number. Gaps in the numbering survived two rounds in one post and are now a check.
- **Topic choice (first /techwriter run).** The unfiltered ranking offered civic and grant topics with
  identical boilerplate angles; `topics` now filters to the audience bundles and the angle is written
  from the subject. A first run under the skill cost $58.3 reported, reached the gate in one pass, and
  its check loop repaired visual cadence three times (draft, round 1, round 2).
- **Not yet known.** Whether a fix turn that edits in place keeps the post's quality; whether the
  loop's budget gate is tight enough for a seat's usage window; how the new checks change the
  cost of a run. Report what the first runs under this skill show.
