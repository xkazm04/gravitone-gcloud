// Wire types for the publishing seam (platform-consolidation spark, 2026-10-04).
// Shared by lib/publish (engine + store), app/api/publish (routes),
// pipeline/publish.mts (the headless CLI) and app/calendar (the UI).
//
// Absent-value convention: `null` means unmeasured / unknown — never 0, never an
// omitted key. A metric that was not read is not a metric that read zero.

export type ChannelId = "youtube" | "tiktok" | "instagram";
export type ChannelStatus = "live" | "dry" | "not_wired";

export interface ChannelReadiness {
  id: ChannelId;
  name: string;
  status: ChannelStatus;
  /** Names only — a value never leaves the server. */
  env: { name: string; present: boolean }[];
  /** `forbidden`: this deployment may not spawn a local binary at all
   *  (lib/deployment.ts), so PATH was not probed and nothing renders here. */
  cli: { name: string; present: boolean; forbidden?: true }[];
  note?: string;
}

export type SlotStatus = "scheduled" | "publishing" | "published" | "failed" | "missed" | "cancelled";

export interface ScheduleSlot {
  id: string;
  projectId: string;
  exportId: string;
  channelId: ChannelId;
  /** ISO 8601. */
  publishAt: string;
  status: SlotStatus;
  title: string;
  description: string;
  tags: string[];
  publicationId: string | null;
  error: string | null;
  createdAt: string;
  missedAt: string | null;
}

export interface Publication {
  id: string;
  slotId: string;
  channelId: ChannelId;
  platformVideoId: string | null;
  visibility: "private";
  dry: boolean;
  publishedAt: string;
}

export interface MetricSnapshot {
  publicationId: string;
  at: string;
  views: number | null;
  watchTimeS: number | null;
  avgViewDurationS: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subsDelta: number | null;
}

export interface ExportRef {
  id: string;
  projectId: string | null;
  path: string;
  bytes: number;
  createdAt: string;
}
