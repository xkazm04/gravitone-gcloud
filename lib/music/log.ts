// ONE LINE PER MUSIC CALL — the engine's entire server-side trace.
//
// Before this file there was nothing. `grep -n "console\.\|log(" lib/music/**
// app/api/music/**` returned NOTHING AT ALL: four routes that spend the
// operator's balance, a vendor that can refuse, rate-limit, time out or return
// bytes that are not audio, and no artefact anywhere that answers "it stopped
// working". Built in lib/imaging/log.ts's shape and vocabulary on purpose — a
// single `[music]` grep should read like a single `[imaging]` grep:
//
//   [music] generate ok model=music_v2 ms=41200 sec=13 cost=unpriced
//   [music] plan ok model=music_v2 ms=1900 sec=0 cost=free
//   [music] generate err kind=refused ms=820 sec=13 msg="…"
//
// ── WHAT A LOG LINE MAY CARRY (audited before the first line was written) ───
//
// SAFE by construction: the operation, model ids, error kinds, durations,
// seconds requested, and the cost basis. All are closed unions or numbers this
// repo owns. The model id is a literal in lib/music/elevenlabs.ts, not
// operator-set — but it is scrubbed anyway, on the same principle imaging uses.
//
// NOT SAFE, therefore scrubbed: the error MESSAGE. `vendorFailure` in
// elevenlabs.ts splices up to 300 characters of the vendor's own response body
// into it verbatim, so a message is not provably free of vendor-supplied text.
// Every message goes through `scrub` and is collapsed to one truncated line.
//
// NEVER LOGGED AT ALL:
//   · THE PLAN. `MusicPlan` carries the cue's intent sentence, the project's
//     logline and every scene slugline — the USER'S OWN SCRIPT. This is a
//     creative tool; the script is the user's content and it does not go in a
//     server log at any length, scrubbed or not.
//   · THE AUDIO, or its length in bytes beyond the adapter's own guard.
//
// The key: ElevenLabs authenticates by the `xi-api-key` HEADER, and every URL
// this engine builds is a hard-coded constant, so no key can ride in a query
// string. `scrub` still blanks the live key VALUE wherever it appears in a
// string — the backstop for a vendor that echoes a header back at us — plus
// Bearer tokens and URL userinfo, for a credential arriving by a route
// `liveSecrets()` cannot enumerate.

import type { MusicErrorKind } from "./errors";
import type { MusicCostBasis, MusicOp } from "./pricing";

const MASK = "[redacted]";

/**
 * The key var, RESTATED here rather than imported from elevenlabs.ts.
 *
 * elevenlabs.ts imports this module (it is the adapter's logger), so importing
 * back would make the adapter and its own logger a cycle — the kind of import
 * graph that resolves in one bundler and is `undefined` at module-init time in
 * another, and the failure would be a silently unscrubbed log line.
 *
 * Kept honest behaviourally instead of structurally: music-log-line.probe sets
 * the env var through elevenlabs.ts's OWN exported `MUSIC_KEY_VAR` and asserts
 * the value is masked here. If the two ever drift apart, that probe fails.
 */
const MUSIC_KEY_VAR = "ELEVENLABS_API_KEY";

/** Credentials this process actually holds, so a leak of one is caught by
 *  VALUE rather than by guessing which field it travelled in. */
function liveSecrets(): string[] {
  const s = process.env[MUSIC_KEY_VAR]?.trim();
  // Short values are almost certainly placeholders, and blanking a 3-char
  // string would redact half the line.
  return s && s.length >= 8 ? [s] : [];
}

/** Remove anything credential-shaped from a string bound for a log. Order
 *  matters: `Bearer …` first, or the key/value rule masks the word "Bearer"
 *  and leaves the token standing after it. */
export function scrub(text: string): string {
  let s = text;
  for (const secret of liveSecrets()) s = s.split(secret).join(MASK);
  return s
    .replace(/\bBearer\s+[\w.\-+/=]+/gi, `Bearer ${MASK}`)
    .replace(/\/\/[^\s/@]+:[^\s/@]+@/g, `//${MASK}@`)
    .replace(
      /\b(xi[-_]?api[-_]?key|api[-_]?key|key|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      (_m, name: string, sep: string) => `${name}${sep}${MASK}`,
    );
}

/** One line means one line: no newline survives, and nothing runs away. */
function oneLine(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface MusicCallLog {
  op: MusicOp;
  /** Elapsed around the vendor call, which is what the user waited. */
  ms: number;
  /** Seconds of audio the call ASKED FOR. The one exact cost quantity this
   *  engine has (see pricing.ts's unit chain), so it is on every line whether
   *  or not money could be attached to it. */
  seconds: number;
  /* — set when the call succeeded — */
  model?: string;
  /** Which link of the unit chain the price reached. */
  basis?: MusicCostBasis;
  credits?: number;
  usd?: number;
  /* — set when it did not — */
  kind?: MusicErrorKind;
  message?: string;
}

/**
 * The line, as a string. Separate from writing it so it can be asserted on —
 * and, unlike imaging's for its first two years, it IS asserted on
 * (tests/golden-path/music-log-line.probe.spec.ts).
 */
export function formatCall(l: MusicCallLog): string {
  const f: string[] = [`[music]`, l.op, l.kind ? "err" : "ok"];

  if (l.kind) f.push(`kind=${l.kind}`);
  else if (l.model) f.push(`model=${l.model}`);

  f.push(`ms=${l.ms}`);
  f.push(`sec=${l.seconds}`);

  // COST, IN WHICHEVER UNIT THE CHAIN ACTUALLY REACHED. A missing figure is
  // never a zero, and "free" is a declared fact rather than the absence of one
  // — the two must not print the same, because one of them is a claim.
  if (!l.kind) {
    if (l.basis === "free") f.push("cost=free");
    else if (typeof l.usd === "number") f.push(`cost=$${l.usd.toFixed(4)}`);
    else if (typeof l.credits === "number") f.push(`cost=${l.credits}cr`);
    else f.push("cost=unpriced");
  }

  if (l.message) f.push(`msg="${oneLine(scrub(l.message))}"`);
  return f.join(" ");
}

export function logCall(l: MusicCallLog): void {
  const line = formatCall(l);
  if (l.kind) console.error(line);
  else console.log(line);
}

/** The catch-all: something that was not a MusicError at all. Its stack is the
 *  point, so it gets more room — scrubbed, and still one line. */
export function logUnexpected(op: MusicOp, e: unknown): void {
  const raw = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`[music] ${op} err kind=unexpected msg="${oneLine(scrub(raw), 500)}"`);
}
