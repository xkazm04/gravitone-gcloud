# Unit lane measurement, 2026-11-09

Main sha read at: `53c2b8f25f1c437ddf54a40c3e1413d9793eeded` (the gate time limit, 53c2b8f2).
Command: `npx vitest run --reporter=json --outputFile=<temp>`, each run a foreground command, nothing else beside it.
Where: a headless builder worktree. `node_modules` there is a junction-style directory to the main checkout's (`Get-Item` reports no LinkType, it is listed as a directory entry); nothing was installed or rewritten. 16 logical cores, `maxWorkers: "50%"` (8 workers on this box; vitest.config.mts's 186 to 215 s was measured at 10 workers on a 20-core box).

## The runs that count (sequential)

| Run | CPU before (10 s avg) | node procs | Seconds | Exit | Passed | Failed | Total | Quiet |
|---|---|---|---|---|---|---|---|---|
| 1 | 5.3 % | 8 | 118 | 0 | 5024 | 0 | 5034 | yes |
| 2 | 7.5 % | 12 | 132 | 1 | 5023 | 1 | 5034 | yes |
| 3 | 15.9 % (after waiting out a spike, see below) | 8 | 117 | 0 | 5024 | 0 | 5034 | yes |

5034 total in every run; the 10 not passed in a green run are skipped or todo.

Run 2 was a re-run. My first runs 2 and 3 were issued in one tool block and very likely overlapped each other, so they are void and not in the table. Both of them failed on the same test as the valid run 2 (99 s each, exit 1, CPU before 11.8 % and 8.5 %, 12 node procs). They are listed only because they are consistent with it, not as evidence.

After run 2 the CPU sample read 90 % with 28 node processes (something else on the machine). I waited about 90 s; it fell to 37 %, then 15.9 % at the sample taken right before run 3, so run 3 ran under the 40 % bar.

## Failures

| Test file | Test | Class | Runs |
|---|---|---|---|
| `tests/next-server/import-runs.test.ts:222` | `pipeline/import/projects.mts previews dry, imports with --yes, skips on a re-run, refuses a corrupt archive with 1` | environment (reported as an assertion: `expected 3221226505 to be 2`) | run 2, and both void overlapped runs; passed in runs 1 and 3 |

The no-argument `projects.mts` child returned exit code 3221226505 (0xC0000409, a Windows fast-fail abort of the spawned tsx/node process) instead of the usage code 2. The test's own assertions did not fail on logic; the child process crashed. It is intermittent, not deterministic: the same test passed in 2 of 3 counted runs. No timeout failures in any run. No test wrote outside its store directory that I saw (not audited beyond the failure list).

## Verdict

**NOT PROVEN.** All three counted runs were quiet (CPU under 40 % before each), but only two exited 0. One run failed on one intermittent crash in `import-runs.test.ts`, so the lane is not repeatedly green on this tree. Without that one test it was 5023 of 5023 in every run.

## Duration against vitest.config.mts

vitest.config.mts records 186 to 215 s at 10 workers. Counted runs here: 117 to 132 s at 8 workers, which is 54 to 98 s below the recorded range. Fewer workers and a different box, so the delta is a property of the machine, not of a code change.
