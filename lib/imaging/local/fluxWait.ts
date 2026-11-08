// THE WAIT FOR ONE FLUX PROMPT, apart from the engine's four requests (flux2.ts hands it three ports and a clock).
//
// TWO CLOCKS, because there are two different things being waited on:
//   - RUNNING (CAP_MS, 15 min): counted from the first poll that finds OUR prompt in queue_running. This is the draw
//     itself; a prompt that runs 15 minutes is hung (a 1280x720 frame is 100-330 s on the shared card, a 21 MP
//     reference once ran 10+ min inside VAEEncode).
//   - PENDING (PENDING_CAP_MS, 90 min): counted from when the prompt was accepted until it starts. The card is
//     shared: another session's video job can hold it for many minutes, and a board's frames queue one behind the
//     other. Killing a healthy draw for having waited its turn is the defect this replaces. 90 min covers several
//     foreign jobs and still ends well inside a night, so a wedged foreign queue cannot hold our lane till morning.
//
// EVERY EXIT THAT LEAVES OUR PROMPT IN COMFYUI WITHDRAWS IT - the cap, the lost-prompt throw, and anything
// unexpected - so the next panel never lands behind a prompt nobody is waiting for. A withdrawal never throws over
// the sentence that caused it, and its sentence says only what it knows: a POST that failed is not "withdrawn".
// The error names where the prompt was (queued or running), as it always has.
//
// A prompt ComfyUI stopped ANSWERING for is the ENGINE's absence, not the panel's fault: its error carries
// COMFY_UNREACHABLE (flux2.ts), which the scout board reads to wait the outage out instead of booking an empty
// panel. A prompt it answered for and simply no longer held (a restart that wiped its queue, answering throughout),
// and a timed-out draw, are `unavailable` without it: the engine was alive, and a graph that kills it must not be
// retried as if it were weather.

import { AppError, isAppError } from "@gt/domain/errors";

export const POLL_MS = 3_000;
export const CAP_MS = 15 * 60_000;
export const PENDING_CAP_MS = 90 * 60_000;
export const LOST_POLLS = 6;

/** `AppError.detail` of an `unavailable` that means "the engine could not be reached / lost the prompt". */
export const COMFY_UNREACHABLE = "comfy-unreachable";

/** Did this error come from ComfyUI being unreachable (any copy of AppError)? */
export const isComfyUnreachable = (e: unknown): boolean => isAppError(e) && e.code === "unavailable" && e.detail === COMFY_UNREACHABLE;

export const comfyUnreachable = (m: string): AppError => new AppError("unavailable", m, { detail: COMFY_UNREACHABLE });

export type Place = "running" | "pending" | "neither";
export type WaitPorts<E> = {
  /** The history entry for our prompt; `null` when the history could not be read at all. */
  readonly history: () => Promise<E | undefined | null>;
  /** Where the queue holds our prompt; `null` when the queue could not be read. */
  readonly place: () => Promise<Place | null>;
  /** Ours, and only ours, out of the queue; the sentence says what happened. Never throws. */
  readonly withdraw: () => Promise<string>;
  readonly done: (e: E) => boolean;
};
export type WaitClock = { readonly now: () => number; readonly sleep: (ms: number) => Promise<void>; readonly pollMs?: number; readonly capMs?: number; readonly pendingCapMs?: number };

const min = (ms: number): string => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);

/** Poll until our prompt has an entry that is done, or fail with a sentence after withdrawing it. `sentAt` = when ComfyUI accepted it. */
export async function awaitPrompt<E>(id: string, sentAt: number, p: WaitPorts<E>, k: WaitClock): Promise<E> {
  const cap = k.capMs ?? CAP_MS;
  const pendingCap = k.pendingCapMs ?? PENDING_CAP_MS;
  let lost = 0;
  let silent = false;
  let startedAt: number | undefined;
  let seen: Place = "pending";
  const fail = async (build: (withdrawn: string) => AppError): Promise<never> => {
    const was = await p.withdraw().catch(() => "could not be withdrawn: the withdrawal itself threw");
    throw build(was);
  };
  try {
    for (;;) {
      const h = await p.history().catch(() => null);
      const entry = h ?? undefined;
      if (entry !== undefined && p.done(entry)) return entry;
      let where: Place | null = null;
      if (h === null) lost++;
      else {
        where = await p.place().catch(() => null);
        lost = where === null || (where === "neither" && entry === undefined) ? lost + 1 : 0;
      }
      if (h === null || where === null) silent = true;
      if (lost === 0) silent = false;
      if (where !== null) seen = where;
      const t = k.now();
      if (where === "running" && startedAt === undefined) startedAt = t;
      if (lost >= LOST_POLLS) return await fail((w) => {
          const said = `ComfyUI lost prompt ${id}: unreachable, or holding it in neither its queue nor its history, for ${LOST_POLLS} polls (restarted?); the prompt ${w}`;
          return silent ? comfyUnreachable(said) : new AppError("unavailable", said);
        });
      if (startedAt !== undefined && t - startedAt >= cap) {
        return await fail((w) => new AppError("unavailable", `ComfyUI did not finish Flux prompt ${id}: it ran ${min(t - startedAt!)} (limit ${min(cap)}); it was ${w}`));
      }
      if (startedAt === undefined && t - sentAt >= pendingCap) {
        return await fail((w) => new AppError("unavailable", `ComfyUI did not start Flux prompt ${id}: it waited ${min(t - sentAt)} behind other prompts (limit ${min(pendingCap)}, last seen ${seen}); it was ${w}`));
      }
      await k.sleep(k.pollMs ?? POLL_MS);
    }
  } catch (e) {
    if (isAppError(e)) throw e;
    // Unexpected (a clock or a port threw): still ours out of the queue, then the original error.
    await p.withdraw().catch(() => undefined);
    throw e;
  }
}
