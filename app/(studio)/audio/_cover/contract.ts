import type { CoverDeskView, CoverLaunch, CoverPlan } from "@gt/domain/cover";
import type { CoverSunoFiled, CoverSunoLaunch, CoverSunoPlan, SunoCoverTakeN } from "@gt/domain/cover.suno";

import type { ActionResult } from "../../../_server/actionCore.ts";

// WHAT THE COVER SURFACE IS HANDED (spark track-mirror-studio, WP0): WP2 fills it, WP3 reads it. File bytes go
// through the routes under /audio/cover/, because an action's body is capped far below a song.

export type { CoverDeskView, CoverLaunch, CoverPlan, CoverSunoFiled, CoverSunoLaunch, CoverSunoPlan, SunoCoverTakeN };

export const COVER_SOURCE_ROUTE = "/audio/cover/source";
export const COVER_REMIX_ROUTE = "/audio/cover/remix";
/** JSON `{ url, rights, title?, holder?, note? }`: the song fetched from a YouTube link, answered as `{ id }`. */
export const COVER_LINK_ROUTE = "/audio/cover/link";

// An ActionResult, not a Result: AppError is a class and React drops an Error crossing the action boundary,
// so the browser would see no refusal sentence (found by WP2; app/_server/actionCore.ts point 4).
export type CoverActs = {
  /** With no token: answers the receipt and queues nothing. With the receipt's token: queues the job. */
  readonly launch: (plan: CoverPlan, token?: string) => Promise<ActionResult<CoverLaunch>>;
  /** Picks the winner and makes its mp3. */
  readonly pick: (id: string, seed: number) => Promise<ActionResult<{ readonly winnerUrl: string }>>;
  /** The brief: with no token answers its receipt (three Gemini listens priced, the Claude turn on the seat);
   *  with the receipt's token queues `job:cover-brief:<id>`, which launches the cover when it is done. */
  readonly brief: (id: string, token?: string) => Promise<ActionResult<CoverLaunch>>;
  /** The back-filled style prompts. */
  readonly saveStyles: (id: string, styles: { readonly sourceStyle?: string; readonly remixStyle?: string }) => Promise<ActionResult<void>>;
  /** Spark suno-covers. The winner to Suno: with no token answers the receipt (two covers, song credits); with
   *  the receipt's token queues `job:cover-suno:<id>:<n>` (upload once, two covers, two free reads). */
  readonly sendSuno: (plan: CoverSunoPlan, token?: string) => Promise<ActionResult<CoverSunoLaunch>>;
  /** Keep one Suno take: unconfirmed answers Suno's download quote; `confirm` spends the credit and files it as
   *  the remix (free when Suno answers the file without one). */
  readonly fileSuno: (i: { readonly id: string; readonly send: number; readonly take: SunoCoverTakeN; readonly confirm?: boolean }) => Promise<ActionResult<CoverSunoFiled>>;
};

/** How often the desk re-reads its view while a brief or a cover job is queued or running: the owner asked for
 *  once a minute, which is coarse beside a 10 s render and fine beside a queue measured in hours. */
export const COVER_POLL_MS = 60_000;
