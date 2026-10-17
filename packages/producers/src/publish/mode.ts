import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { RunMode } from "@gt/domain/job";
import { armLive, DRY } from "@gt/kernel/dryrun";

// PUBLISH_MODE, FOLDED INTO THE KERNEL'S DRY RUN (plan §3.2; packages/kernel/src/dryrun.ts names
// publish DRY as one of the four mechanisms it absorbed). v1 lib/publish/channels.ts kept its own
// switch: PUBLISH_MODE unset = dry, a typo refused rather than read as either, and "live" only
// counted when all three YouTube variables were present (`youtubeEffectiveMode`), so the record
// (`dry: true`) and the readiness row agreed. All three rules are kept. What changes is what
// "live" IS: a kernel LiveArm naming who armed it, when and why, so every live upload carries
// its authority on the ledger - and GRAVITONE_DRY_ONLY=1 (every test lane, the fixture
// universe) refuses the arm outright, whatever PUBLISH_MODE says.

export const PUBLISH_MODE_VAR = "PUBLISH_MODE";

export type ModeFacts = {
  /** PUBLISH_MODE as set; undefined or blank is dry. */
  readonly requested: string | undefined;
  /** Every credential the live channel needs is present (presence, not validity). */
  readonly credentials: boolean;
  readonly dryOnly: boolean;
  readonly by: Actor;
  readonly at: string;
};

/** The mode a publish runs in. A malformed PUBLISH_MODE is `invalid`, never a guess. */
export function publishMode(f: ModeFacts): Result<RunMode> {
  const want = f.requested?.trim() || "dry";
  if (want !== "dry" && want !== "live") return err("invalid", `${PUBLISH_MODE_VAR} must be 'dry' or 'live', got '${want}'`);
  if (want === "dry" || !f.credentials || f.dryOnly) return ok(DRY);
  return armLive(f.by, f.at, `${PUBLISH_MODE_VAR}=live with the channel's credentials present`, { dryOnly: f.dryOnly });
}
