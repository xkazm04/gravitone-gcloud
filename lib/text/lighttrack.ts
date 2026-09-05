// LIGHTTRACK — an OPT-IN usage sink beside the stdout log.
//
// lib/text/log.ts prints one line per turn and stops at the console. That was
// the whole trace this engine had. .ai/use-cases.json now declares five call
// sites by name — the five TurnClass values, `text.`-prefixed, plus the one
// imaging call site — and there was no way to report a single event against
// any of them. This is that way: it feeds off the exact same settle point as
// `logTurn` (see router.ts::reason, both branches), and does nothing else.
//
// ── OPT-IN, AND INERT WHEN NOT OPTED IN ─────────────────────────────────────
//
// No `LIGHTTRACK_URL` — the out-of-the-box state of every deploy that has not
// heard of this file — means `configured()` returns `null` before anything
// is built, let alone sent. A production deploy that sets nothing is
// byte-identically unaffected: no fetch, no timer, no import-time env read
// (the env is read lazily, per call, exactly as lib/text/env.ts reads keys —
// a route that booted before .env.local was filled in must not hold a stale
// absence for the life of the process). `LIGHTTRACK_DISABLE` is the explicit
// off-switch for an operator who has a URL configured (e.g. for a sibling
// service) but wants this engine silent regardless.
//
// ── FIRE-AND-FORGET, BY CONSTRUCTION NOT BY DISCIPLINE ──────────────────────
//
// `emitLightTrack` returns `void`, not a Promise a caller could `await` and
// therefore fail on. The request it starts is abandoned — not chained, not
// returned — behind a short client-side timeout, and its `.catch` is the only
// thing standing between a sink outage and a creator's reasoning turn, so it
// swallows EVERYTHING: a network error, a non-2xx, a timeout, a malformed URL,
// all of it. A telemetry sink being down must never fail the call it is trying
// to describe. There is deliberately no retry either — a lost event is a gap
// in a chart; a retried one queued behind a minutes-long reasoning turn is a
// resource leak with a good excuse.
//
// ── THE SAME SCRUB, NOT A SECOND LIST ───────────────────────────────────────
//
// lib/text/log.ts's own header records a past drift: its scrubber's
// credential list once read two entries short of lib/claudeCli.ts's spawn-door
// strip-list, and a source-coupled test (text-log-line.probe.spec.ts) now
// holds the two against each other so it cannot happen again unnoticed. That
// drift was between TWO SEPARATE LISTS. This file avoids growing a third: it
// imports `scrub` itself rather than re-deriving or re-declaring which
// environment variables are credential-shaped, so the `error` field below is
// scrubbed by the exact function — and therefore the exact live-secret list —
// that the stdout line already trusts. One scrubber, two sinks.
//
// ── NEVER A COST THAT WAS NOT MEASURED ───────────────────────────────────────
//
// `cost_usd` is sent only when `TurnLog.costUsd` is a real number — the CLI's
// own `total_cost_usd`, or Google's vendor-reported/estimated figure — and
// omitted otherwise, per lib/text/pricing.ts's rule that an unpriced turn is
// UNPRICED, not free. It is never sent as `0`.

import { oneLine, scrub, type TurnLog } from "./log";

const PROJECT_ID = "gravity";
const PATH = "/v1/events";
const TIMEOUT_MS = 2_000;

interface LightTrackConfig {
  url: string;
  key?: string;
}

/** Read lazily, per call — see the header on why this must not be captured at
 *  module load. `null` means "say nothing", the default and the safe state. */
function configured(): LightTrackConfig | null {
  if (/^(1|true)$/i.test(process.env.LIGHTTRACK_DISABLE?.trim() ?? "")) return null;
  const url = process.env.LIGHTTRACK_URL?.trim();
  if (!url) return null;
  return { url: url.replace(/\/+$/, ""), key: process.env.LIGHTTRACK_KEY?.trim() || undefined };
}

/** The wire body for one turn. `name` is the whole point — the use-case key
 *  every other field in this module exists to hang off of. */
function eventFor(l: TurnLog) {
  const body: Record<string, unknown> = {
    project_id: PROJECT_ID,
    provider: l.provider ?? "unknown",
    model: l.model ?? "unknown",
    operation: "chat",
    status: l.kind ? "error" : "success",
    // The closed TurnClass vocabulary IS the declared use-case key, minus the
    // `text.` prefix .ai/use-cases.json puts on it — restored here rather than
    // stored twice.
    name: `text.${l.turn}`,
    // Token counts, where the serving vendor reported them. `claude-cli`
    // reports a cost but never a count, so this is honestly 0 for it rather
    // than a promptChars figure mislabelled as tokens — see TurnLog's own
    // comment on `inputTokens`/`outputTokens`.
    usage: { input: l.inputTokens ?? 0, output: l.outputTokens ?? 0 },
    latency_ms: Math.round(l.ms),
  };
  if (l.costUsd !== undefined) body.cost_usd = l.costUsd;
  if (l.kind && l.message) body.error = oneLine(scrub(l.message));
  else if (l.kind) body.error = l.kind;
  return body;
}

/**
 * Report one settled turn to LightTrack. Never throws, never awaited by the
 * caller, never slows the response it describes.
 */
export function emitLightTrack(l: TurnLog): void {
  let cfg: LightTrackConfig | null;
  try {
    cfg = configured();
  } catch {
    return;
  }
  if (!cfg) return;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.key) headers.authorization = `Bearer ${cfg.key}`;

  // Deliberately not `await`ed and not returned — the whole contract is that
  // this call cannot become the caller's problem, and a Promise a caller could
  // reach for is exactly how that boundary gets crossed by accident later.
  //
  // Wrapped in try/catch as well as `.catch`: `fetch` itself can throw
  // SYNCHRONOUSLY (a malformed URL, an environment without a global fetch),
  // and a synchronous throw is not something a `.catch` on its return value
  // ever sees.
  try {
    fetch(`${cfg.url}${PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify(eventFor(l)),
      signal: ctl.signal,
    })
      .catch(() => {
        // A telemetry sink being down must never fail a creator's reasoning
        // turn. There is nowhere else for this error to go.
      })
      .finally(() => clearTimeout(timer));
  } catch {
    clearTimeout(timer);
  }
}
