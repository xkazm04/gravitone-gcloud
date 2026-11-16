// The release's and the channels' states in the house status vocabulary (look + words). Scheduled is
// awaiting, as a Calendar slot's is; a DSP that no route reaches is idle, not failed - nothing was tried.
import type { StatusEntry } from "@gt/ui/components/status/status.ts";
import type { ChannelState, ReleaseStatus } from "@gt/domain/release";

export const STATUS_ENTRY: Readonly<Record<ReleaseStatus, StatusEntry>> = {
  draft: { look: "idle", label: "draft" },
  ready: { look: "done", label: "ready" },
  scheduled: { look: "awaiting", label: "scheduled" },
  published: { look: "done", label: "published" },
};

export const CHANNEL_ENTRY: Readonly<Record<ChannelState, StatusEntry>> = {
  ready: { look: "done", label: "ready" },
  dry: { look: "awaiting", label: "dry" },
  "not-wired": { look: "idle", label: "not wired" },
  "not-reachable": { look: "idle", label: "not reachable" },
};
