// ONE LINE PER REASONING TURN — this engine's entire server-side trace.
//
// The sibling of lib/imaging/log.ts, written for the same reason and to the same
// audit. Before it, a failing /api/frames left `console.error("[frames]", e)`
// for exceptions that were NOT CliErrors — which is to say, it left nothing for
// every failure that actually happens. "It stopped working" was unanswerable on
// the engine that costs the most per call.
//
//   [text] edit-plan ok  provider=claude-cli model=claude-opus-5 rung=preferred ms=184320 cost=$0.8412 schema=prompted
//   [text] scene-direction ok  provider=google model=gemini-3.6-pro rung=alternate ms=41100 cost=unpriced schema=native rerouted=claude-cli:managed-platform
//   [text] edit-plan err kind=not-installed provider=claude-cli ms=8 tried=claude-cli:not-installed,google:no-key msg="…"
//
// ── WHAT A LOG LINE MAY CARRY ───────────────────────────────────────────────
//
// SAFE by construction: the turn class, the env, provider ids, error kinds, the
// descent trail, rung, durations, cost, schema enforcement, prompt LENGTH. All
// closed unions or numbers this repo owns.
//
// NEVER LOGGED, AND THIS IS THE RULE THAT MATTERS MOST ON THIS ENGINE: the
// PROMPT. Not truncated, not hashed, not "just the first line". A reasoning
// prompt here is the creator's entire notebook, script and unpublished research
// — /api/recalibrate measured one at 40,384 characters of exactly that. It is
// the single most sensitive payload this application handles and it has no
// business in a log line. `promptChars` is the only thing about it that travels.
//
// NOT SAFE, therefore scrubbed: the error MESSAGE. It reads as ours, but an
// adapter may splice a vendor's own error text into it, so a message is not
// provably free of vendor-supplied content. Every message goes through `scrub`
// and is collapsed to one truncated line.
//
// NEVER LOGGED AT ALL: `TextError.detail`. It holds raw vendor response bodies
// or `String(e)` of an arbitrary exception, either of which can echo the prompt
// back. No amount of scrubbing makes a body a line.

import { KEY_VAR } from "./env";
import type { TextErrorKind } from "./errors";
import type {
  LadderRung,
  RerouteStep,
  SchemaEnforcement,
  TextProviderId,
  TextSteer,
  TurnClass,
} from "./types";

const MASK = "[redacted]";

/** Credentials this process actually holds, so a leak of one is caught by VALUE
 *  rather than by guessing which field it travelled in. `claude-cli`'s row is
 *  `null` — it holds no key — so this list is short by design and will stay
 *  short as long as the local engine stays keyless. */
function liveSecrets(): string[] {
  const out: string[] = [];
  for (const v of Object.values(KEY_VAR)) {
    if (!v) continue;
    const s = process.env[v]?.trim();
    // Short values are almost certainly placeholders, and blanking a 3-char
    // string would redact half the line.
    if (s && s.length >= 8) out.push(s);
  }
  // The local engine is keyless, but the environment it runs in may not be: an
  // ANTHROPIC_API_KEY present for an unrelated reason is exactly the value
  // lib/claudeCli.ts strips from the child, and if it ever surfaces in a message
  // it must not survive to the log.
  for (const extra of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
    const s = process.env[extra]?.trim();
    if (s && s.length >= 8) out.push(s);
  }
  return out;
}

/** Remove anything credential-shaped from a string bound for a log. Order
 *  matters: `Bearer …` first, or the key/value rule masks the word "Bearer" and
 *  leaves the token standing after it. */
export function scrub(text: string): string {
  let s = text;
  for (const secret of liveSecrets()) s = s.split(secret).join(MASK);
  return s
    .replace(/\bBearer\s+[\w.\-+/=]+/gi, `Bearer ${MASK}`)
    .replace(/\/\/[^\s/@]+:[^\s/@]+@/g, `//${MASK}@`)
    .replace(
      /\b(api[-_]?key|key|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      (_m, name: string, sep: string) => `${name}${sep}${MASK}`,
    );
}

/** One line means one line: no newline survives, and nothing runs away. */
function oneLine(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface TurnLog {
  turn: TurnClass;
  env: string;
  /** Elapsed inside the router, INCLUDING any descent — which is what the user
   *  waited. The serving provider's own time is in provenance.durationMs. */
  ms: number;
  /** The characters that went in. The prompt itself never appears. */
  promptChars: number;
  steer?: TextSteer;
  /** Every candidate that dropped out, in order. */
  tried?: readonly RerouteStep[];
  /* — set when the turn succeeded — */
  provider?: TextProviderId;
  model?: string;
  rung?: LadderRung;
  costUsd?: number;
  schema?: SchemaEnforcement;
  /* — set when it did not — */
  kind?: TextErrorKind;
  message?: string;
}

/** The line, as a string. Separate from writing it so it can be asserted on. */
export function formatTurn(l: TurnLog): string {
  const f: string[] = ["[text]", l.turn, l.kind ? "err" : "ok"];

  if (l.kind) {
    f.push(`kind=${l.kind}`);
    if (l.provider) f.push(`provider=${l.provider}`);
  } else {
    f.push(`provider=${l.provider ?? "-"}`);
    if (l.model) f.push(`model=${l.model}`);
    if (l.rung) f.push(`rung=${l.rung}`);
  }

  f.push(`ms=${l.ms}`, `in=${l.promptChars}c`);
  // An unpriced turn is UNPRICED, not free. A missing number is never a zero.
  if (!l.kind) {
    f.push(`cost=${l.costUsd === undefined ? "unpriced" : `$${l.costUsd.toFixed(4)}`}`);
    if (l.schema) f.push(`schema=${l.schema}`);
  }

  if (l.tried?.length) {
    const trail = l.tried.map((t) => `${t.provider}:${t.why}`).join(",");
    // On a success the trail IS the descent: someone was tried and lost.
    f.push(`${l.kind ? "tried" : "rerouted"}=${trail}`);
  }
  if (l.steer?.prefer) f.push(`prefer=${l.steer.prefer}`);
  if (l.steer?.avoid) f.push(`avoid=${l.steer.avoid}`);
  if (l.message) f.push(`msg="${oneLine(scrub(l.message))}"`);

  return f.join(" ");
}

export function logTurn(l: TurnLog): void {
  const line = formatTurn(l);
  if (l.kind) console.error(line);
  else console.log(line);
}
