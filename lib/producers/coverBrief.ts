import type { CoverLaunch } from "@gt/domain/cover";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Store } from "@gt/kernel/store";

// WP0 STUB: final signatures, filled by WP-A on lib/producers/cover.ts's shape. One job per cover,
// `job:cover-brief:<id>`, lane seat.text, steps measure, listen-1..3, write.

export type LaunchBriefOptions = {
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
};

export const coverBriefJobId = (id: string): string => `job:cover-brief:${id}`;

export async function launchCoverBrief(_store: Store, _id: string, _opts: LaunchBriefOptions): Promise<Result<CoverLaunch>> {
  throw new AppError("internal", "cover brief launch: not built yet");
}
