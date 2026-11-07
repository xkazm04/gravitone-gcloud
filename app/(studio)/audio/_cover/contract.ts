import type { Result } from "@gt/domain/errors";
import type { CoverDeskView } from "@gt/domain/cover";
import type { Receipt } from "@gt/domain/produce";

// WHAT THE COVER SURFACE IS HANDED (spark track-mirror-studio, WP0): WP2 fills it, WP3 reads it. File bytes go
// through the routes under /audio/cover/, because an action's body is capped far below a song.

export type { CoverDeskView };

export const COVER_SOURCE_ROUTE = "/audio/cover/source";
export const COVER_REMIX_ROUTE = "/audio/cover/remix";

export type CoverLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string }
  | { readonly kind: "existing"; readonly jobId: string };

export type CoverPlan = { readonly id: string; readonly startS: number; readonly endS: number; readonly style: string; readonly lyrics: string; readonly sourceStyle?: string };

export type CoverActs = {
  /** With no token: answers the receipt and queues nothing. With the receipt's token: queues the job. */
  readonly launch: (plan: CoverPlan, token?: string) => Promise<Result<CoverLaunch>>;
  /** Picks the winner and makes its mp3. */
  readonly pick: (id: string, seed: number) => Promise<Result<{ readonly winnerUrl: string }>>;
  /** The back-filled style prompts. */
  readonly saveStyles: (id: string, styles: { readonly sourceStyle?: string; readonly remixStyle?: string }) => Promise<Result<void>>;
};

export type CoverLayout = "steps" | "bench" | "chain";
export const COVER_LAYOUTS: readonly CoverLayout[] = ["steps", "bench", "chain"];
