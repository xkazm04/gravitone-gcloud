# Unit lane measurement, 2026-11-09 (b)

Branch sha read at: `fe0e04dbcf2781e06e95b4df2f35ff4a57da52dd` (the `projects.mts` fix, on `11636774`).
Command: `npx vitest run --reporter=json --outputFile=<temp>`, each run its own foreground command in its own tool call, nothing else beside it.
Where: a headless builder worktree, `node_modules` a junction to the main checkout's; nothing installed or rewritten. Node 24.14.0, libuv 1.51.0, V8 13.6.233.17-node.41. 16 logical cores, `maxWorkers: "50%"` (8 workers).

## The runs that count (sequential)

| Run | CPU before (10 s avg) | node procs | Seconds | Exit | Passed | Failed | Total | Quiet |
|---|---|---|---|---|---|---|---|---|
| 1 | 10.8 % | 11 | 117 | 0 | 5024 | 0 | 5034 | yes |
| 2 | 23.6 % | 10 | 204 | 0 | 5024 | 0 | 5034 | yes |
| 3 | 34.5 % | 10 | 157 | 0 | 5024 | 0 | 5034 | yes |

5034 total in every run; the 10 not passed are skipped or todo. CPU was sampled before each run only, so the longer runs 2 and 3 are not explained by this measurement (their pre-run CPU was higher than run 1's).

## The crash: cause and counts

The child printed its usage line, then libuv aborted during teardown:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

Exit 3221226505 is 0xC0000409. It reproduced sequentially, alone, with no parallel load: stdout and stderr piped, as the test spawns it, from a temp cwd.

Cause: `process.exit` while V8 is still tiering up the Wasm of amaro, Node's TypeScript stripper. The evidence is a set of 200-run counts on copies of `projects.mts`, changing one thing at a time:

| Variant (200 runs, usage path) | Exit 2 | 3221226505 |
|---|---|---|
| Full copy of `projects.mts`, `process.exit(2)` | 18 | 182 |
| Same copy, `--no-wasm-tier-up` | 200 | 0 |
| Same copy, `--no-wasm-dynamic-tiering` | 200 | 0 |
| Same copy, `--liftoff-only` | 200 | 0 |
| Same copy, `--no-liftoff` | 200 | 0 |
| Same full source, `process.exitCode = 2` and a natural end | 200 | 0 |
| First 33 lines only, `process.exit(2)` | 200 | 0 |
| First 33 lines, the rest as comments, `process.exit(2)` | 200 | 0 |
| First 33 lines plus a top-level await, `process.exit(2)` | 200 | 0 |
| Small `.mts` + `lib-hooks.mts` + `@gt/domain/errors`, `process.exit(2)` | 200 | 0 |
| Plain `.mjs`, `process.exit(2)` | 200 | 0 |

`lib-hooks.mts` alone does not cause it, and neither does stripping as such: the crash needs enough TypeScript to strip for V8 to tier up, and an exit before that work has finished. The flags, not an observation of the internal task, are what tie it to tier-up; the code path inside V8 was not traced. An abort on process exit in this libuv assertion is a Node or libuv behaviour; the change below avoids it in this CLI and does not fix it in Node.

## Crash counts per path, before and after

Sequential unless noted, temp stores, no paid call. Before is `11636774`; after is `fe0e04db`.

| Path | Before | After |
|---|---|---|
| `projects.mts` no arguments (run A) | 31 x `2`, **169 x 3221226505** of 200 | 200 x `2`, 0 crashes |
| `projects.mts` no arguments (run B) | 49 x `2`, **151 x 3221226505** of 200 | 200 x `2`, 0 crashes |
| `projects.mts` no arguments, 8 in parallel | not counted | 200 x `2`, 0 crashes |
| `projects.mts` missing file | 19 x `1`, **81 x 3221226505** of 100 | 100 x `1`, 0 crashes |
| `projects.mts` malformed archive | 100 x `1`, 0 crashes | 100 x `1`, 0 crashes |
| `runs.mts --only nope` | 100 x `2`, 0 crashes | unchanged file |
| `runs.mts --fixtures` dry | 100 x `0`, 0 crashes | unchanged file |
| `slots.mts --bad` | 100 x `2`, 0 crashes | unchanged file |
| `slots.mts` dry | 100 x `0`, 0 crashes | unchanged file |
| `styles.mts --bad` | 100 x `2`, 0 crashes | unchanged file |
| `styles.mts` missing `--from` | 100 x `1`, 0 crashes | unchanged file |

The crashes were only on the two exits that come straight after the strip of `projects.mts`, so only that file changed. `projects.mts` success paths were not looped; they run in `import-runs.test.ts` in all three counted runs.

## Failures

None. `tests/next-server/import-runs.test.ts:222` passed in all three counted runs.

## Verdict

**PROVEN.** All three counted runs were quiet (CPU under 40 % before each) and all three exited 0, 5024 passed and 0 failed of 5034.

## Duration against vitest.config.mts

vitest.config.mts records 186 to 215 s at 10 workers. Counted runs here: 117 to 204 s at 8 workers. Fewer workers and a different box, so the delta is a property of the machine, not of a code change.
