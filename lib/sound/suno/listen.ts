// THE LISTENER (spark suno-advisor): one priced read of an uploaded take by an audio-capable model,
// returned as a StudioListen and kept on the take (./facts.ts saveListened). Quoted before it runs;
// DRY by default (GRAVITONE_DRY_ONLY=1 forces a stand-in marked as one). Its read is a hypothesis:
// audio models over-specify instruments and misread vocal presence, so the page shows it unconfirmed.
// WP0 STUBS: the signatures are the contract; WP2 fills the bodies.
import type { StudioTakeFacts } from "@gt/domain/audio.suno";
import { err, type Result } from "@gt/domain/errors";

/** The price of one listen of a take this long, in USD; undefined when the pricing table cannot say (Listen then refuses). */
export function quoteListen(_durationS: number): number | undefined {
  return undefined;
}

/** Listen to one take: quote, receipt, call (or stand-in under DRY), validate, keep. */
export async function listenTake(takeId: string): Promise<Result<StudioTakeFacts>> {
  return err("unavailable", `take ${takeId}: the listener is not built yet (spark suno-advisor WP2)`);
}
