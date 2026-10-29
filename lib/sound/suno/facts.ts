// WHAT GRAVITONE KNOWS ABOUT AN UPLOADED SUNO TAKE (spark suno-advisor): the facts measured on the
// file the person chose to spend a Suno download on (tempo and its octave neighbours, key, loudness),
// the listener's read once a priced Listen ran, and the confirmed taste profile folded from the
// `audio.taste` ledger events. One reader for the studio's port (app/(studio)/audio/studio/_port/ledger.ts)
// and the agent's inbox (app/_server/mcp/tools/audioStudio.ts), so the page and the agent see the same facts.
// WP0 STUBS: the signatures are the contract; WP1 fills the bodies.
import type { StudioListen, StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";

/** Facts for every take id given that this server holds; an id it does not hold is absent from the record. */
export async function takeFactsOf(_takeIds: readonly string[]): Promise<Readonly<Record<string, StudioTakeFacts>>> {
  return {};
}

/** One take's facts, or why there are none. */
export async function factsOf(takeId: string): Promise<Result<StudioTakeFacts>> {
  return err("not-found", `take ${takeId}: facts are not built yet (spark suno-advisor WP1)`);
}

/** Keep a listener's read on the take (WP2's listen calls this after a successful, receipted read). */
export async function saveListened(takeId: string, _listen: StudioListen): Promise<Result<StudioTakeFacts>> {
  return err("unavailable", `take ${takeId}: saving a listen is not built yet (spark suno-advisor WP1)`);
}

/** The confirmed taste profile: the `audio.taste` events folded (@gt/domain/audio.suno.schema foldTaste). */
export function tasteProfile(_store: Store): Result<readonly StudioTasteLine[]> {
  return ok([]);
}
