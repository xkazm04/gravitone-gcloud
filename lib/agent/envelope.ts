// THE AGENT SEAM'S OUTPUT READING: what a finished run's stdout means.
//
// Split out of cliSeam.ts (the door, which re-exports these) because reading an
// engine's output is separate from spawning it. This file turns stdout into
// { final, errors, turns, costUsd } and then into an outcome. It holds the claude
// JSON envelope reader, the codex, agy and grok envelope readers with their
// dispatch, the classification of errors into outcomes, and killTree, which both
// spawners use. Apart from killTree, nothing here touches a process.

import { execFile } from "node:child_process";

import type { AgentOutcome } from "./cliSeam";
import type { ReviewerEngineName } from "./reviewerEngines";

/** The last JSON object on stdout (a banner line before it is tolerated). */
function lastJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    // fall through to the backwards scan
  }
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    try {
      return JSON.parse(text.slice(i));
    } catch {
      // keep looking
    }
  }
  return null;
}

export interface ParsedEnvelope {
  final: string;
  errors: string[];
  turns: number;
  costUsd?: number;
}

export function parseEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  const errors: string[] = [];
  if (v.is_error || (v.subtype && v.subtype !== "success")) errors.push(`${String(v.subtype ?? "error")}: ${String(v.result ?? "").slice(0, 300)}`);
  return {
    final: String(v.result ?? ""),
    errors,
    turns: typeof v.num_turns === "number" ? v.num_turns : 0,
    costUsd: typeof v.total_cost_usd === "number" ? v.total_cost_usd : undefined,
  };
}

/** An engine that cannot serve this call at all: no balance (402), a model the
 *  account does not offer, a CLI that is not installed. Measured texts:
 *  grok 1.0.40 on 2026-10-05 answered "API error (status 402 Payment Required):
 *  Grok Build usage balance exhausted"; codex lists the models it supports and
 *  refuses others as "not supported". */
const UNAVAILABLE = /\b402\b|payment required|balance (is )?exhausted|insufficient (credit|balance|funds)|not supported|unsupported model|model[^.;]{0,60}(not found|does not exist|is not available|not available)|cli was not found|could not be started|eligibility check failed|load code assist/;
/** agy fails its start-up eligibility call with a 503 and then sits idle until its own timeout:
 *  on 2026-10-05 the Gemini reviewer printed "ERROR: failed to send message: send failed;
 *  already reported to the user: Eligibility check failed: failed to get load code assist
 *  response: UNAVAILABLE (code 503): The service is currently unavailable." and held its slot
 *  for 25 minutes. The line on stdout or stderr is the whole diagnosis, so the reviewer is
 *  stopped the moment it appears and recorded as `unavailable`. */
const AGY_EARLY_UNAVAILABLE = /eligibility check failed[^\n]{0,200}|load code assist response[^\n]{0,200}/i;

/** The early-failure line in a chunk of an engine's output, when it is one that ends the call. */
export function earlyUnavailable(engine: ReviewerEngineName, text: string): string | undefined {
  if (engine !== "agy") return undefined;
  const m = AGY_EARLY_UNAVAILABLE.exec(text);
  return m ? m[0].replace(/\s+/g, " ").trim() : undefined;
}

/** A seat or rate limit: the contest runner's pattern, plus HTTP 429. */
const SEAT_LIMIT = /\b429\b|too many requests|usage limit|rate limit|quota|out of (extra )?usage|resource.?exhausted|seat/;

/** A refusal or a seat limit is not a score of zero; it is a run that did not
 *  happen. The contest runner's verdicts and order, with `unavailable` checked
 *  first so that a 402 is never read as a seat limit. */
export function classifyOutcome(parsed: ParsedEnvelope, run: { exit: number | null; timedOut: boolean }): AgentOutcome {
  if (run.timedOut) return "timed-out";
  if (parsed.errors.length) {
    const text = parsed.errors.join(" ").toLowerCase();
    if (UNAVAILABLE.test(text)) return "unavailable";
    if (SEAT_LIMIT.test(text)) return "seat-limit";
    return "errored";
  }
  if (run.exit !== 0) return "errored";
  return "completed";
}

/** End the whole tree: a timed-out agent that keeps running keeps spending. */
export function killTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === "win32" && pid) {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => kill());
    return;
  }
  kill();
}

/* ── envelopes ─────────────────────────────────────────────────────────────── */

/** codex `exec --json`: one event per line. The final message is the last
 *  `agent_message`; an `error` or `turn.failed` event is an error (codex's own
 *  "Reconnecting…" notices are not). No cost is reported. */
export function parseCodexEvents(stdout: string): ParsedEnvelope {
  let final = "";
  let turns = 0;
  const errors: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (v.type === "item.completed") {
      const it = (v.item ?? {}) as Record<string, unknown>;
      if (it.type === "agent_message" && typeof it.text === "string") final = it.text;
    } else if (v.type === "turn.completed") turns += 1;
    else if (v.type === "error" || v.type === "turn.failed") {
      const msg = v.message ?? (v.error as Record<string, unknown> | undefined)?.message;
      if (msg && !String(msg).startsWith("Reconnecting")) errors.push(String(msg).slice(0, 300));
    }
  }
  if (!final && !errors.length && !turns) errors.push("no codex events on stdout");
  return { final, errors, turns };
}

/** agy: `{status, response, error, num_turns, denied_actions}`. A SUCCESS with
 *  an empty response and denied actions is a run that could not use its tools
 *  (probed: read_url denied without --dangerously-skip-permissions). */
export function parseAgyEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  const errors: string[] = [];
  if (v.status && v.status !== "SUCCESS") errors.push(`${String(v.status)}: ${String(v.error ?? v.response ?? "").slice(0, 300)}`);
  const final = String(v.response ?? "");
  const denied = Array.isArray(v.denied_actions) ? (v.denied_actions as { action?: unknown }[]).map((d) => String(d?.action ?? "?")) : [];
  if (!errors.length && !final.trim() && denied.length) errors.push(`denied: ${denied.join(", ")} (headless mode could not prompt for it)`);
  return { final, errors, turns: typeof v.num_turns === "number" ? v.num_turns : 0 };
}

/** grok: success `{text, stopReason, num_turns, total_cost_usd}` (the contest
 *  runner's reading — not observed here, the account is at 402); failure
 *  `{type:"error", message, http_status}` (observed). */
export function parseGrokEnvelope(stdout: string): ParsedEnvelope {
  const v = lastJsonObject(stdout);
  if (!v) return { final: "", errors: ["no JSON envelope on stdout"], turns: 0 };
  if (v.type === "error") {
    const status = typeof v.http_status === "number" ? ` (http ${v.http_status})` : "";
    return { final: "", errors: [`${String(v.message ?? "error").slice(0, 300)}${status}`], turns: 0 };
  }
  const stop = v.stopReason ?? v.stop_reason ?? "unknown";
  const final = String(v.text ?? v.result ?? "");
  const out: ParsedEnvelope = { final, errors: stop === "end_turn" ? [] : [`${String(stop)}: ${final.slice(0, 300)}`], turns: typeof v.num_turns === "number" ? v.num_turns : 0 };
  if (typeof v.total_cost_usd === "number") out.costUsd = v.total_cost_usd;
  return out;
}

export function parseEngineEnvelope(engine: ReviewerEngineName, stdout: string): ParsedEnvelope {
  if (engine === "codex") return parseCodexEvents(stdout);
  if (engine === "agy") return parseAgyEnvelope(stdout);
  if (engine === "grok") return parseGrokEnvelope(stdout);
  return parseEnvelope(stdout);
}
