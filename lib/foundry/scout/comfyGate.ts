import { comfyBase, comfyStats } from "../../imaging/video/comfyLtx";

// THE ENGINE'S DOOR (spark perfect, failed-draws-spare-cap, 2026-11-08). On 2026-10-26 thirty-two storyboards
// were launched into a ComfyUI that was not there; each failed in seconds with "ComfyUI is not reachable" and
// the night's cap was spent on frames never drawn. A launch the engine could not hear is not an attempt: it
// writes no candidate, spends no cap, and the plan item stays queued for the next tick.
//
// EngineUnreachable is NOT a Refusal. A Refusal is the door answering "no" (a cap, the money, an idea no longer
// kept) and the item is settled; this is the door unable to ask, and the night-fill tells the two apart by class.
// One panel's error never reaches here: the probe is the engine's /system_stats, asked once before any
// candidate is written, so a single bad frame can not read as the engine being down.

/** The engine could not be asked: the launch was not made, and nothing was spent. */
export class EngineUnreachable extends Error {}

/** Resolves when the engine answers; throws when it does not. A test replaces it. */
export type ComfyProbe = () => Promise<void>;

/** The production probe: ComfyUI's own `/system_stats`. */
export const probeComfy: ComfyProbe = async () => {
  await comfyStats({ base: comfyBase() });
};

/**
 * Asks the engine before a live launch. `reachable` is the injected probe; an engine given in its place (a test's
 * `draw`) is not ComfyUI and is not asked after. Throws EngineUnreachable with the engine's own sentence.
 */
export async function requireComfy(o: { readonly reachable?: ComfyProbe; readonly draw?: unknown }): Promise<void> {
  if (o.reachable === undefined && o.draw !== undefined) return;
  try {
    await (o.reachable ?? probeComfy)();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new EngineUnreachable(m.includes("ComfyUI") ? m : `ComfyUI is not reachable: ${m}`);
  }
}
