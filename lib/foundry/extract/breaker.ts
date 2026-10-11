// THE CIRCUIT BREAKER — consecutive vendor failures stop the run; a money stop
// does not. Also pruneFailures, the retry door that resets this breaker.
//
// Its own file because the breaker and the prune share one rule: a failed unit
// is what a retry takes again, and the streak is what decides when to stop.
// Money stops (the run ceiling, the spend window) are in spend.ts and never
// reach tripped() — see the comment on BREAKER_LIMIT.

import type { EngineIO } from "./engine";
import { log } from "./journal";
import type { ExtractManifest } from "./types";
import { doneUnits, totalUnits } from "./units";

/* ── The circuit breaker ──────────────────────────────────────────────────── */

/** Consecutive vendor failures before the run stops. Three, because one is a
 *  refused frame (normal), two is bad luck, and three in a row is a wall —
 *  a bad parameter, an expired key — that every further unit would also hit.
 *
 *  A BUDGET CEILING IS NOT ONE OF THEM. It used to be named here, and an
 *  `over-budget` refusal went through tripped() like any vendor throw: an
 *  errored round appended, the streak bumped, and after three the run read
 *  "3 consecutive vendor failures". A refusal by our own meter is a named
 *  stop (`stopFor`, `m.stopped`), never a failure; see the spend section. */
export const BREAKER_LIMIT = 3;

export function tripped(m: ExtractManifest, io: EngineIO, what: string): boolean {
  m.fail_streak = (m.fail_streak ?? 0) + 1;
  if (m.fail_streak < BREAKER_LIMIT) return false;
  m.status = "failed";
  m.error = `${BREAKER_LIMIT} consecutive vendor failures; the last: ${what}. Fix the cause, then retry — the failed units are pruned and taken again.`;
  log(m, io, `stopped: ${m.error}`);
  return true;
}

/** Drop every failed element so a retry takes it again: unread sources,
 *  rounds that produced no file, transfers that produced no file. A round
 *  whose image exists but whose critique failed is kept — the pixels cost
 *  money and the critique is retried by the next round's logic only if the
 *  loop is still open. Returns how many were pruned; resets the breaker and
 *  puts the run back in a live stage.
 *
 *  A run with NOTHING to prune is left exactly as it was. This used to fall
 *  through regardless — a clean `done` run lost its `finished` stamp, went
 *  back to `replicating`, and finished a second time with a second "done"
 *  line, while stepRun's comment called the retry a no-op. Zero pruned means
 *  zero touched. */
export function pruneFailures(m: ExtractManifest): number {
  let n = 0;
  for (const s of m.sources)
    if (s.error && !s.readback) {
      s.error = null;
      n++;
    }
  for (const st of m.styles) {
    for (const r of st.replicas) {
      const before = r.rounds.length;
      r.rounds = r.rounds.filter((x) => x.file);
      r.rounds.forEach((x, i) => (x.n = i + 1));
      n += before - r.rounds.length;
    }
    st.replicas = st.replicas.filter((r) => r.rounds.length);
    const before = st.transfers.length;
    st.transfers = st.transfers.filter((t) => t.file);
    n += before - st.transfers.length;
  }
  // A MONEY STOP leaves nothing to prune — a run-ceiling stop is taken before
  // the unit starts, and a period-ceiling refusal leaves no errored element —
  // so `stopped` is itself a resumable state, cleared here.
  if (n === 0 && !m.stopped) return 0;
  delete m.stopped;
  m.fail_streak = 0;
  delete m.error;
  delete m.finished;
  if (m.status === "failed" || m.status === "done") m.status = m.styles.length ? "replicating" : "reading";
  m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
  return n;
}
