// THE SUNO BROWSER DRIVER — server-only. STUB until WP2 lands: the signatures
// are final, the bodies are not. Attaches over CDP to the dedicated profile
// (~/.suno-chrome on SUNO_CDP_PORT); never the operator's default profile,
// which Chrome 136+ refuses to expose to remote debugging.

import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoModel, SunoPhase } from "./types";

/** Is a signed-in Suno reachable? Cheap; called on every snapshot read. */
export async function probeSuno(): Promise<SunoDriverHealth> {
  return { ok: false, reason: "suno driver not built yet" };
}

/** One custom create on one model. Resolves with the clips Suno made for it
 *  (normally 2) once each has a song id; `onPhase` is called on every phase
 *  change. Throws an Error whose message is shown to the operator verbatim. */
export async function createSunoTracks(
  fields: SunoFields,
  model: SunoModel,
  onPhase: (phase: SunoPhase) => void,
): Promise<SunoClipRef[]> {
  void fields;
  void model;
  void onPhase;
  throw new Error("suno driver not built yet");
}
