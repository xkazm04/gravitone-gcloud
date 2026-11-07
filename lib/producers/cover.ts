import { AppError } from "@gt/domain/errors";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ReceiptMode } from "@gt/domain/produce";
import type { Store } from "@gt/kernel/store";

import type { CoverLaunch, CoverPlan } from "@gt/domain/cover";

// WP0 STUB: final signatures, filled by WP1 on lib/producers/scoutSheet.ts's shape (receipt, then confirm;
// one job per cover, `job:cover:<id>`, gpu.local, engine comfy).

export type LaunchCoverOptions = {
  readonly mode: ReceiptMode;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export const coverJobId = (id: string): string => `job:cover:${id}`;

export async function launchCover(_store: Store, _plan: CoverPlan, _opts: LaunchCoverOptions): Promise<Result<CoverLaunch>> {
  throw new AppError("internal", "cover launch: not built yet");
}
