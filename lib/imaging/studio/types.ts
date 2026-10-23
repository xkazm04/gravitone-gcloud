// The Leonardo studio driver's own shapes — server-only. The provider
// (providers/leonardoStudio.ts) turns a StudioRun into the imaging contract.

import type { ImageRef } from "../types";

/** Is a signed-in studio with credits reachable? `reason` is one sentence. */
export interface StudioHealth {
  ok: boolean;
  reason?: string;
}

/** One finished studio generation. */
export interface StudioRun {
  /** The studio's own id, from its `Generate` answer. */
  generationId: string;
  image: ImageRef;
  /** STUDIO credits the generation cost, from `Generate`'s receipt; absent if
   *  the answer carried none. Never a dollar figure. */
  credits?: number;
  /** The pool's balance as the page last reported it, after the spend. */
  balance?: number;
  model: string;
}

/**
 * Why a studio generation failed, and whether the click had already happened.
 *
 * `spent` is the money half and it is evidence, the role `dispatched` plays on
 * ImagingError: set only once the page's `Generate` was sent, because from that
 * moment the studio may have billed credits whether or not an image arrives.
 */
export class StudioError extends Error {
  constructor(
    message: string,
    readonly kind: "unreachable" | "signed-out" | "no-credits" | "refused" | "timeout" | "failed",
    readonly spent = false,
    /** The studio's generation, when the page named one before it failed - so a refused or failed
     *  generation is deleted like a delivered one (spark scout-muse). */
    readonly generationId?: string,
  ) {
    super(message);
    this.name = "StudioError";
  }
}
