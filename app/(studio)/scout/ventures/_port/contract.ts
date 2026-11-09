// THE VENTURES SCREEN'S VIEW (spark concept-casting-stages S6) - client-safe (types only). The real side reads the kernel's
// venture heads, the channel files they were imported from, and each one's productions and accepted lessons (./real.ts); the
// fixture side (GRAVITONE_PRODUCE_SIDE=fixture) is a small scripted slate.

import type { VentureFrame, VentureGround, VentureKind } from "@gt/domain/genre";
import type { LessonDimension, ProductionId, ProductionStage } from "@gt/domain/production";

import type { ActionResult } from "../../../../_server/actionCore.ts";

/** The channel card as the file holds it now; absent when the file is gone or the venture has no channel. */
export type ChannelCard = { readonly id: string; readonly group: string; readonly name: string; readonly audience: string; readonly promise: string; readonly gap: string; readonly edge: string; readonly medium: string; readonly look?: string };

export type VentureProduction = { readonly id: ProductionId; readonly title: string; readonly stage: ProductionStage };
export type VentureLesson = { readonly id: string; readonly dimension: LessonDimension; readonly text: string; readonly production: string; readonly drawnFrom: number };

export type VentureEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: VentureKind;
  readonly ground: VentureGround;
  readonly proposal: string;
  readonly frame: VentureFrame;
  readonly bornAt: string;
  readonly retiredAt?: string;
  readonly channelId?: string;
  readonly channel?: ChannelCard;
  /** The channel file could not be read: this card says so and says why. */
  readonly channelProblem?: string;
  readonly productions: readonly VentureProduction[];
  readonly lessons: readonly VentureLesson[];
};

export type VenturesView = { readonly ventures: readonly VentureEntry[] };

export type VentureCreateInput = { readonly name: string; readonly tone: string; readonly audience: string; readonly format: string; readonly look: string };

export type VenturesPort = {
  readonly create: (input: VentureCreateInput) => Promise<ActionResult<VenturesView>>;
};
