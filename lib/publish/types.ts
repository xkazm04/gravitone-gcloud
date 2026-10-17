// Wire types for the publishing seam (platform-consolidation spark, 2026-10-04): v1's calendar
// files as ./store.ts wrote them. The calendar is the kernel's slot tables now
// (@gt/kernel/slots; the importer reads these shapes through its own schema), so what is left
// here serves only the v1 code still standing - ./schedule.ts and ./store.ts, which the sibling
// session's lib/sound/mv/calendar.ts keeps alive, and pipeline/fixtures/publish.ts, which writes
// a v1 calendar for the importer to take in. Delete with them (Phase 6 wave C, L68 report).
//
// Absent-value convention: `null` means unmeasured / unknown — never 0, never an
// omitted key. A metric that was not read is not a metric that read zero.

import type { ChannelId } from "./channels";

export type { ChannelId, ChannelReadiness, ChannelStatus } from "./channels";
export type { ExportRef } from "./exports";

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
