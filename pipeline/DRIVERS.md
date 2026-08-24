# `drive-*.mjs` — one-off browser drivers, and what they are NOT

*2026-08-24.*

There are nine of them: `drive-studio`, `drive-signed-in`, `drive-research-step`,
`drive-script-step`, `drive-followup`, `drive-persistence`, `drive-impact-matrix`,
`drive-recalibration`, `drive-assets`. Each launches Chromium, drives the gated
studio through the dev-auth bypass, prints `PASS`/`FAIL` lines and exits non-zero
on a failure.

**They were the repository's live-app harness until this date, and they were an
improvised one.** Each opened with a comment telling a human to start a server
first; each re-derived its own waiting, its own pass/fail vocabulary and its own
notion of a clean starting state; none could ask the product what it believed;
none ran in CI; and when the human had not started the server, most of them
reported nothing useful. That is the "improvised door" the registry's
`test-harness / live-app-harness` technique names.

## The harness is now `tests/live/`

- **The door is designed.** `lib/harness/protocol.ts` is the command vocabulary,
  typed on both sides; `components/ui/HarnessBridge.tsx` implements it;
  `tests/live/_control.ts` consumes it.
- **The launcher exists.** `playwright.live.config.ts` starts `next dev` on port
  3187 — never 3000 — waits for it, and stops the process it started.
- **The gate is build-time.** The control surface is compiled out of any
  production build, and `npm run check:bundle` reads the emitted browser chunks
  to prove it.
- **It runs in CI**, as its own job in `.github/workflows/gates.yml`.

Run it with `npm run test:live`.

## Why these nine still exist

They are not dead and they were not deleted: between them they drive surfaces the
live lane deliberately does not carry — column integrity on the triage board, the
follow-up serialisation rules, the recalibration flow, the impact matrix, the
asset shelves. That is real coverage, and throwing it away to tidy a directory
would be a net loss.

What they are **from now on** is exploratory one-off drivers: something a person
runs by hand while working on a surface, in the same spirit as the imaging probe
scripts beside them. They are not a gate, nothing invokes them, and no claim in
`.ai/registry-conformance.md` rests on them.

**If a claim one of them makes is worth defending, it does not belong here.** Move
it: to `tests/golden-path/` if a Node probe can witness it (almost always), or to
`tests/live/` if it genuinely needs the assembled product — and read that lane's
population rule at the top of `tests/live/golden-path.live.spec.ts` before adding
to it, because the lane is slow and serial and stays useful only while it is
small.
