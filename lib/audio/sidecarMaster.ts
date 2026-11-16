import { ok, type Result } from "@gt/domain/errors";
import { masterAnswerSchema, type MasterResult } from "@gt/domain/audio.master";
import type { MasterRecipe } from "@gt/domain/release";

import { sidecarCall as call, type SidecarOptions } from "./sidecar.ts";

// THE MASTER VERB, FROM NODE (spark audio-distribution) - `master --in --out --recipe`,
// pipeline/audio/master.py. Split out of ./sidecar.ts for the same reason ./sidecarPhrase.ts was
// (the 400-line cap); it reaches the sidecar through the same bounded `call`, so the posture
// refusal, the verbatim error and the refused-is-invalid reading are that door's. The recipe is the
// whole request: the owner's "one click" ruling, no setting crosses this line.

/** A five-minute song takes about 7 s here (2026-11-16); a slow box and eight limiter passes, far more. */
const MASTER_TIMEOUT_MS = 300_000;

/**
 * Master `input` into `output` (24-bit WAV, 48 kHz, channels kept) under `recipe`: -14 LUFS
 * integrated, true peak at or under -1 dBTP. `after` is measured on the file as written.
 */
export async function masterFile(input: string, output: string, recipe: MasterRecipe, opts: SidecarOptions = {}): Promise<Result<MasterResult>> {
  const r = await call("master", ["--in", input, "--out", output, "--recipe", recipe], masterAnswerSchema, opts.timeoutMs ?? MASTER_TIMEOUT_MS);
  if (!r.ok) return r;
  const v = r.value;
  return ok({ recipe: v.recipe, input: v.input, output: v.output, before: v.before, after: v.after, ms: v.ms, limitDb: v.limitDb, passes: v.passes });
}
