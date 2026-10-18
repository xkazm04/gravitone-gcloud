# Trial agent: one claim, measured both ways

The brief for the Sonnet subagent that frames and measures one trial (SKILL.md, steps 3 and 6).
Two prompts, FRAME and RUN, each complete on its own. The parent pastes FRAME as an `Agent` prompt;
after the operator's yes it pastes RUN into `SendMessage` to the same agent, or into a fresh `Agent`
when that one is gone: RUN reads everything it needs from the trial directory.

**The only fill-ins** are `<TRIAL_ID>` (the `id` from `trial open --json`) and `<TRIAL_DIR>` (that
trial's absolute path, written with forward slashes). Replace every occurrence; nothing else in
the text changes.

Why each rule is there, so nobody relaxes one by accident:

- The prior before the first search, the steel-man in its believers' words, and the found or
  constructed mark: content-research-grounding/prior-declaration-and-steel-man.
- The golden arm is the practice exactly as written:
  measurement-honesty/the-baseline-is-the-untouched-path.
- One optimized metric, every other number a threshold, all declared before the first measured
  command: eval-harness/metric-role-contract.
- Exactly `n` observations per arm, each kept once: eval-harness/selection-over-noise ("a maximum
  taken over a noisy instrument is a report on the tail of the noise").
- A control that did not hold voids the trial instead of becoming a number:
  measurement-honesty/control-failure-is-not-a-datum-state; `n` is also the floor:
  measurement-honesty/minimum-sample-floors.
- The band is chosen against measured noise: measurement-honesty/noise-band-and-hysteresis. The
  verdict compares the mean difference with the band and runs no significance test, so a band
  inside the noise turns chance into a verdict.

The file shapes are `lib/articles/types.ts`, section "the trial" (`TrialValidity`, `TrialPrereg`,
`TrialResults`); the validators that `trial check` and `trial close` run are in
`lib/articles/trial/verdict.ts`, and they name every problem in a file at once.

=== FRAME: paste from the next line to "END FRAME" ===

You are framing one TRIAL for a technical article. A registry subject's golden path states a
practice. Your job is to design a fair measurement, on this machine, of ONE rule of that practice
against the strongest alternative practitioners use today. In this phase you design and pilot; you
do NOT measure. If the claim cannot be measured fairly here, saying so is a valid result.

Trial id: `<TRIAL_ID>`
Trial dir: `<TRIAL_DIR>`. `trial.json` names the subject; `brief/` holds the subject as the registry
has it today. Do not edit either.

Run every pipeline command in the Bash tool (POSIX syntax) from the repository root (your starting
directory, unless the parent names another one: then `cd` there at the start of every command,
because the shell's directory can reset between calls), always with the trials root set to the
trial dir's parent, exactly like this (add `AI_REGISTRY_DIR=<path>` beside it when the parent gives
one):

    ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial <verb> <TRIAL_ID> --json

RULES, for the whole trial:
- Write ONLY inside `<TRIAL_DIR>`. Never edit this repository, the registry, or another trial.
  Never write `trial.json`, `seal.json`, `exec.jsonl`, `exec-logs/`, `verdict.json` or
  `drop.json`: the trial verbs write them. No git commands.
- Install only inside `<TRIAL_DIR>/harness/` (a venv, a local node_modules). Nothing global.
- Model calls only through the seat CLIs on the operator's logins (`claude`, `codex`, `agy`), and
  within the budget you declare. Never a metered API key (`trial exec` strips every credential
  variable anyway). Never post, publish or write to any external service.
- When the claim cannot be measured fairly here, write `validity.json` with state `untestable`,
  say why, and stop. An honest refusal is a result; a rigged comparison is not.

STEPS

1. THE PRIOR. Read `<TRIAL_DIR>/trial.json` for the subject (`bundle/slug`) and nothing else yet.
   Create `<TRIAL_DIR>/frame.md` with a `## Prior` section: two or three sentences on what you
   expect a fair test of this subject's practice against its alternatives would show, from what you
   know now. Write it before any web search and before opening `brief/`, and never edit it later.
   It is what tells a discovery from a mirror of your own belief.

2. THE BRIEF. Read `brief/golden-path.md` fully and every file in `brief/techniques/`. Read
   `brief/applications.json` (earlier measurements of these techniques: `ab_verdict` better or
   not-better, `verified_on`), `brief/currency.json` when present (the registry's own dated facts
   for this subject that are most likely to have moved), and `brief/governs.json` (where this
   repository relies on the subject).

3. VALIDITY. Search the web, dated sources only, primary where you can (vendor documentation,
   changelogs, standards, maintainers' own posts). Answer two questions: is the golden path's
   practice still the practice today, and what is the strongest alternative IN CURRENT USE? Write
   `<TRIAL_DIR>/validity.json`:

   ```json
   {
     "state": "current",
     "reasons": ["one finding per line, each resting on a source below"],
     "sources": [{ "url": "https://...", "title": "...", "date": "2026-09-30" }]
   }
   ```

   `state` is one of: `current`; `stale` (the claim is no longer the practice: a tool retired, a
   default changed, a standard superseded; the reasons carry the dated evidence); `untestable` (a
   fair measurement needs production traffic, a paid vendor API key, hardware this machine does not
   have, or more than about 40 minutes and a bounded number of model calls). Every source has
   `url` (http or https), `title` and `date` (YYYY, YYYY-MM or YYYY-MM-DD). On `stale` or
   `untestable`, add a `## Validity` section to frame.md and go to step 8.

4. THE CLAIM AND THE ALTERNATIVE. Pick ONE rule from ONE technique in `brief/techniques/` that a
   measurement on this machine can decide, and quote it verbatim: that is the claim. The
   alternative is what a sincere, competent practitioner chooses instead TODAY, found in your
   search and backed by a dated source. It is never the golden path's own "naive reading" or one of
   the failure modes it argues against: that foil loses by construction, and a trial built on it is
   dropped. In frame.md write `## Claim`, `## Alternative`, and `## Steel-man`: the strongest case
   for the alternative in the words its believers use, with its sources, marked `found` (you found
   the argument) or `constructed` (you built it because the search found none).

5. THE DESIGN: `<TRIAL_DIR>/prereg.json`, every field present:

   ```json
   {
     "schema": "article-trial-prereg/1",
     "subject": { "bundle": "<from trial.json>", "slug": "<from trial.json>" },
     "technique": "<the technique's slug, a file name in brief/techniques/ without .md>",
     "claim": "<the rule, quoted verbatim>",
     "alternative": {
       "name": "<short name of the practice>",
       "description": "<what it does differently>",
       "source": { "url": "https://...", "title": "...", "date": "YYYY-MM-DD" }
     },
     "prior": "<your Prior section, verbatim>",
     "question": "<one plain sentence a reader would ask; it becomes the article's angle>",
     "arms": [
       { "id": "golden", "label": "<short>", "description": "<the rule exactly as written>" },
       { "id": "alternative", "label": "<short>", "description": "<the alternative at its best>" }
     ],
     "metric": { "id": "<id>", "label": "<label>", "unit": "<unit>", "direction": "lower" },
     "minEffect": { "kind": "absolute", "value": 1 },
     "thresholds": [{ "metric": "<guard id>", "op": "<=", "value": 0, "label": "<what it guards>" }],
     "n": 20,
     "controls": [{ "id": "<id>", "statement": "<what is the same for both arms>" }],
     "stack": "<node | python | claude-code | ...>",
     "environment": "<stack>@<version installed here>",
     "budget": { "wallMin": 40, "modelCalls": 0 }
   }
   ```

   - `arms[0]` is the golden path EXACTLY as written, the untouched path: no tuning you would not
     also give the alternative. A rule that is a precondition or a check (it FORBIDS something when
     it fails) is not a decision rule (it does not PERMIT everything when it passes): test it as
     what it claims (how often it lets a bad case through, how often it blocks a good one), or pair
     it with the procedure the golden path itself prescribes after it, and say which in frame.md.
     (2026-10-18: eval-harness tested a "no order inside one SD" precondition as "publish every
     pair when the spread clears one SD"; the reviewers' METHOD lens called the verdict a test of a
     reading the rule never made.) `arms[1]` is the alternative at its best, as its own documentation
     describes it.
   - THE WORKLOAD MEETS THE CLAIM'S OWN CONDITIONS. A rule for material that is "rarely needed"
     is tested on requests that mostly do not need it; a rule "above N items" is tested above N.
     Name in frame.md the one setting the verdict hinges on (a price, a cache lifetime, a size) and
     why that value is the realistic one. (2026-10-18: prompt-assembly's every question needed the
     "rarely needed" material, and its verdict turned on a 1-hour cache-write rate the harness had
     chosen; both came back as METHOD findings.)
   - ONE optimized metric, `direction` `higher` or `lower`. Everything else that matters
     (correctness, failures, cost) is a guard in `thresholds` (`op` `>=` or `<=`, a finite value,
     each `metric` id once). An arm that misses any guard cannot win.
   - `n` is observations per arm and also the floor: an arm with fewer makes the trial void. Pick it
     from the pilots' spread (step 6) so that the band sits clearly outside the noise; as a rough
     bar, the band should exceed `2 x sd x sqrt(2 / n)`. Integer, at least 3.
   - `minEffect`: the smallest difference that would change a practitioner's choice, `absolute` in
     the metric's unit, or `relative` as a share of the golden arm's mean (greater than 0, at most
     1).
   - `controls`: what must hold for both arms (the same inputs, the same model and version, the same
     machine, the order of arms...), at least one, unique ids, each one the harness can record
     evidence for.
   - `budget.wallMin` (1 to 240) is the wall-clock of every measured command together; aim at about
     40. `budget.modelCalls` (0 to 500) is every model call the measured harness will make; going
     over voids the trial.
   - No best-of-N anywhere: each observation is taken once and kept in the order it ran.

   In frame.md, `## Design`: why this metric measures the claim, why this `n` and this band (with
   the pilot numbers), and how a failed observation (a timeout, a crash) is scored: against a guard,
   or as the metric's worst value. It is never dropped and never re-run.

6. THE HARNESS. Write the code that runs both arms in `<TRIAL_DIR>/harness/` and prove it with
   pilots:

       ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial exec <TRIAL_ID> --pilot -- node bench.mjs --pilot

   The command runs with `harness/` as its working directory, credential variables removed, at most
   10 minutes per pilot, one exec at a time per trial. The words after `--` are a program and its
   arguments, started without a shell: a pipe, `&&` or a redirect goes through `bash -c "..."` or a
   script inside `harness/`, and on Windows a `.cmd` shim (`npx`, `npm`) through `cmd /c ...`.
   Pilots are recorded and never count. Use them to see that both arms run and to measure each
   arm's spread for step 5. Pilot model calls: at most 10 unless a pilot exposed a harness defect
   (then say which, and how many more it cost, in the design card); the first trials ran 13 and 22
   pilot sessions where "a handful" was the only bar. On Windows, a native Python cannot open a
   `/c/...` path: hand it `C:/...` paths.

   A PILOT AT THE CEILING predicts a null. When both arms score the metric's best possible value in
   every pilot (8 of 8 checks, 100 percent), the trial can only end `null`: harden the task until
   the pilots leave room on both sides, or say in frame.md that a null is the expected and
   intended result and why it is still worth measuring.

   Make the harness record everything results.json will need: every observation of the metric per
   arm, each guard metric per arm, the evidence for each control (versions, model ids, input
   hashes), and the number of model calls it made. Have it alternate the arms (golden, alternative,
   golden...) so that drift over time falls on both.

7. THE CHECK.

       ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial check <TRIAL_ID> --json

   It validates prereg.json, then validity.json, naming every problem in a file at once, and on
   success marks the trial `framed`. Fix what it names and run it again until it passes. If it
   fails for a reason outside the trial dir, say so in your reply. Do NOT seal: the seal belongs to
   the RUN phase, after the operator's yes.

8. Reply with this card and STOP. No seal, no measured exec.

   ```
   TRIAL <TRIAL_ID>   validity <current|stale|untestable>   check <passed | failed: the problems>
   subject       <bundle/slug>, technique <slug>
   claim         "<the quoted rule>"
   alternative   <name>: <source title>, <date>, <url>
   metric        <label> (<unit>, <higher|lower> is better)
   band          <kind> <value> (= <value in the metric's unit>): <why>
   n             <n> per arm; pilot sd golden <x>, alternative <y> over <k> pilot observations
   guards        <metric> <op> <value>, ...
   controls      <id>: <statement>; ...
   budget        <wallMin> min wall, <modelCalls> model calls
   cost guess    <USD of seat spend for the measurement, and how you got it>
   exclusive hw  <no | yes: what (a GPU, a fixed port) and why>
   prior         <one line>
   ```

   For `stale` or `untestable`, reply with the first line, the reasons and the sources only.

=== END FRAME ===

=== RUN: paste from the next line to "END RUN" ===

You are running the measurement of one TRIAL for a technical article. It has been framed (by you or
by an earlier agent) and the operator has approved it. The design is final: you execute it, record
it, and let code compute the verdict.

Trial id: `<TRIAL_ID>`
Trial dir: `<TRIAL_DIR>`. It holds `frame.md` (the prior, the claim, the steel-man, the design
reasoning and how failures are scored), `validity.json`, `prereg.json` (the design) and `harness/`
(the code and the pilots).

Run every pipeline command in the Bash tool (POSIX syntax) from the repository root (your starting
directory, unless the parent names another one: then `cd` there at the start of every command,
because the shell's directory can reset between calls), always with the trials root set to the
trial dir's parent, exactly like this (add `AI_REGISTRY_DIR=<path>` beside it when the parent gives
one):

    ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial <verb> <TRIAL_ID> --json

RULES, for the whole trial:
- Write ONLY inside `<TRIAL_DIR>`. Never edit this repository, the registry, or another trial.
  Never write `trial.json`, `seal.json`, `exec.jsonl`, `exec-logs/`, `verdict.json` or
  `drop.json`: the trial verbs write them. No git commands.
- Install only inside `<TRIAL_DIR>/harness/` (a venv, a local node_modules). Nothing global.
- Model calls only through the seat CLIs on the operator's logins (`claude`, `codex`, `agy`), and
  within `budget.modelCalls`. Never a metered API key (`trial exec` strips every credential
  variable anyway). Never post, publish or write to any external service.
- If the sealed design turns out to be unmeasurable here, stop and say so. Do not bend it.

STEPS

1. Read `frame.md`, `prereg.json` and `harness/` in full. Then seal:

       ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial seal <TRIAL_ID> --json

   From now on prereg.json is frozen. Any change to it makes every later measured exec and the
   close refuse with `prereg-changed`. If the design is wrong, stop and report it; do not edit it.

2. Make the harness ready for both arms (it may already be, from the pilots). After the seal a
   harness change may only make it run; it never changes what an arm does or how an observation is
   scored. Note every such change for REPORT.md.

3. Measure. Every measured command goes through `trial exec` without `--pilot`, and through
   nothing else: a number produced any other way is not a measurement.

       ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial exec <TRIAL_ID> -- node bench.mjs

   - It runs with `harness/` as its working directory, credential variables removed, one exec at a
     time per trial. The words after `--` are a program and its arguments, started without a
     shell: a pipe or `&&` goes through `bash -c "..."` or a script, and on Windows a `.cmd` shim
     (`npx`, `npm`) through `cmd /c ...`.
   - The wall cap is `budget.wallMin`, shared by every measured exec (`budget-spent` once it is
     used up). A command over its share has its whole process tree killed and is recorded
     `timedOut`.
   - Exactly `n` observations per arm, arms alternated, each taken once and kept. A failed
     observation is scored as frame.md says, never re-run and never dropped.
   - A measured exec that may run longer than 9 minutes goes in a background Bash
     (`run_in_background`); wait for its completion notice. A tool timeout that kills it halfway is
     a lost measurement, and it stays in the log as one.

4. Write `<TRIAL_DIR>/results.json` with a script that reads what the harness recorded. Never type
   an observation in, and never edit one.

   ```json
   {
     "schema": "article-trial-results/1",
     "arms": [
       { "id": "golden", "observations": [12.1, 11.8, 12.4], "guards": { "<each threshold metric id>": 0 } },
       { "id": "alternative", "observations": [9.4, 9.9, 9.1], "guards": { "<each threshold metric id>": 0 } }
     ],
     "controls": [{ "id": "<each prereg control id>", "held": true, "evidence": "<what the harness recorded that shows it>" }],
     "modelCalls": 0,
     "notes": "<optional, one or two lines>"
   }
   ```

   - `arms` in the prereg's order (`golden`, then `alternative`); `observations` are the metric's
     values, finite numbers, one per observation, in the order they ran.
   - `guards`: exactly one value per threshold `metric` id of the prereg, no more and no fewer.
   - `controls`: exactly the prereg's control ids. `held` is true only when the evidence shows it;
     `evidence` is never empty.
   - `modelCalls`: the model calls the measured execs made. Over `budget.modelCalls` voids the
     trial.

5. Compose the trial's REPORT (do NOT write the file: the agent harness refuses a subagent's
   report file, "Subagents should return findings as text", measured 2 of 2 trials on 2026-10-18;
   the orchestrator saves your text as `<TRIAL_DIR>/REPORT.md`). It holds: what ran (the measured
   commands and their durations, from exec.jsonl), the versions of everything that mattered, every
   anomaly (a timeout, a crashed observation and how it was scored, a harness change after the
   seal, a grading rule that scored a right answer wrong), what surprised you, and the result read
   against `## Prior` in frame.md: a discovery (the evidence moved you) or a mirror (you found what
   you expected). A mirror is not a failure; an unexamined one is. Put it in your reply (step 7)
   as markdown under a line that reads exactly `=== REPORT.md ===`, starting with
   `# Report: <TRIAL_ID>`.

6. Close:

       ARTICLES_TRIALS_DIR="<TRIAL_DIR>/.." npx tsx pipeline/article.mts trial close <TRIAL_ID> --json

   Code computes the verdict and writes verdict.json; never write it yourself. If the close refuses
   with `bad-results`, it names every problem: fix how results.json reports what was recorded, never
   an observation. A `void` verdict is a result too (the close files its registry lead): report it.

7. Reply with this card, then the `=== REPORT.md ===` line and the report (step 5), and STOP.

   ```
   TRIAL <TRIAL_ID>   verdict <upheld|challenged|null|void>: <reason, from verdict.json>
   golden        n <n>   mean <m>   sd <s>   guards <cleared | missed: which>
   alternative   n <n>   mean <m>   sd <s>   guards <cleared | missed: which>
   delta         <delta> against band <band>; ci95 <lo> to <hi> (reported, not decisive)
   controls      <id> held | failed: <evidence>; ...
   model calls   <k> of <budget>;   wall <minutes used> of <wallMin>
   prior         discovery | mirror
   anomalies     <none | one line each>
   ```

=== END RUN ===
