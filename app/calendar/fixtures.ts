// DEV-ONLY FIXTURE for the /calendar surface — NOT the publishing engine.
//
// The platform-consolidation spark builds the engine (lib/publish, app/api/publish,
// WP4) and this UI (WP5) in parallel. Until the routes exist, a GET to them is a
// Next 404, and publishClient.ts falls back HERE — only on that route-missing
// 404, and only when NODE_ENV is not "production" (publishClient's
// `FIXTURE_ALLOWED`). Every screen fed from here wears a `fixture` badge, so a
// fabricated slot can never pass for a scheduled one.
//
// Mutations behave like the HTTP contract in 00-brief.md (201 on create, 409 on
// a not_wired channel or an unknown export, DELETE = status cancelled, never a
// hard delete) so the three schedule variants can be driven end to end before
// the engine lands — in memory, gone on reload, nothing written anywhere.

import type {
  ChannelId,
  ChannelReadiness,
  ExportRef,
  MetricSnapshot,
  Publication,
  ScheduleSlot,
} from "@/lib/publish/types";

interface Store {
  slots: ScheduleSlot[];
  exports: ExportRef[];
  channels: ChannelReadiness[];
  publications: Publication[];
  snapshots: MetricSnapshot[];
}

let store: Store | null = null;
let seq = 0;

const H = 3_600_000;
const D = 24 * H;

/** An instant `days` from today's local midnight, at `hour:minute` local. */
function at(base: number, days: number, hour: number, minute = 0): string {
  const d = new Date(base);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, minute).toISOString();
}

function seed(now: number): Store {
  const exports: ExportRef[] = [
    { id: "exp-glass-harbor-v3", projectId: "seed-glass-harbor", path: "foundry-out/exports/glass-harbor-v3.mp4", bytes: 48_211_904, createdAt: new Date(now - 2 * D).toISOString() },
    { id: "exp-salt-lines-v1", projectId: "seed-salt-lines", path: "foundry-out/exports/salt-lines-v1.mp4", bytes: 31_457_280, createdAt: new Date(now - 5 * D).toISOString() },
    { id: "exp-night-ferry-v2", projectId: "seed-night-ferry", path: "foundry-out/exports/night-ferry-v2.mp4", bytes: 67_108_864, createdAt: new Date(now - 9 * D).toISOString() },
    { id: "exp-orphan-cut", projectId: null, path: "foundry-out/exports/orphan-cut.mp4", bytes: 12_582_912, createdAt: new Date(now - 1 * D).toISOString() },
  ];
  const slot = (
    id: string,
    exportId: string,
    channelId: ChannelId,
    publishAt: string,
    status: ScheduleSlot["status"],
    title: string,
    extra: Partial<ScheduleSlot> = {},
  ): ScheduleSlot => ({
    id,
    projectId: exports.find((e) => e.id === exportId)?.projectId ?? "unassigned",
    exportId,
    channelId,
    publishAt,
    status,
    title,
    description: "",
    tags: [],
    publicationId: null,
    error: null,
    createdAt: new Date(now - 3 * D).toISOString(),
    missedAt: null,
    ...extra,
  });
  const slots: ScheduleSlot[] = [
    slot("fx-1", "exp-glass-harbor-v3", "youtube", at(now, 1, 17), "scheduled", "Glass Harbor — the long night", { tags: ["harbor", "documentary"] }),
    slot("fx-2", "exp-salt-lines-v1", "youtube", at(now, 3, 12, 30), "scheduled", "Salt Lines, cut 1"),
    slot("fx-3", "exp-night-ferry-v2", "youtube", at(now, 9, 19), "scheduled", "Night Ferry (second pass)"),
    slot("fx-4", "exp-salt-lines-v1", "youtube", at(now, -1, 9), "missed", "Salt Lines teaser", { missedAt: at(now, -1, 10) }),
    slot("fx-5", "exp-night-ferry-v2", "youtube", at(now, -2, 15), "failed", "Night Ferry teaser", {
      error: "youtube: 403 quotaExceeded — The request cannot be completed because you have exceeded your quota.",
    }),
    slot("fx-6", "exp-glass-harbor-v3", "youtube", at(now, -4, 18), "published", "Glass Harbor — trailer", { publicationId: "fx-pub-1" }),
    slot("fx-7", "exp-night-ferry-v2", "youtube", at(now, -6, 11), "published", "Night Ferry — first look", { publicationId: "fx-pub-2" }),
    slot("fx-8", "exp-salt-lines-v1", "youtube", at(now, 2, 8), "cancelled", "Salt Lines — alt thumb test"),
  ];
  const publications: Publication[] = [
    { id: "fx-pub-1", slotId: "fx-6", channelId: "youtube", platformVideoId: null, visibility: "private", dry: true, publishedAt: at(now, -4, 18) },
    { id: "fx-pub-2", slotId: "fx-7", channelId: "youtube", platformVideoId: "dQw4fixture", visibility: "private", dry: false, publishedAt: at(now, -6, 11) },
  ];
  // Lifetime snapshots, one per day for the measured publication: the deltas the
  // Metrics tab draws are computed from these, first day null.
  const lifetime = [41, 118, 160, 233, 251, 290];
  const snapshots: MetricSnapshot[] = [
    { publicationId: "fx-pub-1", at: at(now, -3, 6), views: null, watchTimeS: null, avgViewDurationS: null, likes: null, comments: null, shares: null, subsDelta: null },
    ...lifetime.map((v, i) => ({
      publicationId: "fx-pub-2",
      at: at(now, -5 + i, 6),
      views: v,
      watchTimeS: v * 37,
      avgViewDurationS: 37,
      likes: Math.round(v / 14),
      comments: Math.round(v / 60),
      shares: null,
      subsDelta: i === 0 ? null : 1,
    })),
  ];
  // lib/publish/channels.ts CLI_NAMES: the tools an export is muxed and probed with.
  const CLI = [
    { name: "ffmpeg", present: true },
    { name: "ffprobe", present: false },
  ];
  const channels: ChannelReadiness[] = [
    {
      id: "youtube",
      name: "YouTube",
      status: "dry",
      env: [
        { name: "YOUTUBE_CLIENT_ID", present: true },
        { name: "YOUTUBE_CLIENT_SECRET", present: true },
        { name: "YOUTUBE_REFRESH_TOKEN", present: false },
      ],
      cli: CLI,
      note: "PUBLISH_MODE=dry — plans written to foundry-out/publish/plans/",
    },
    {
      id: "tiktok",
      name: "TikTok",
      status: "not_wired",
      env: [{ name: "TIKTOK_ACCESS_TOKEN", present: false }],
      cli: CLI,
      note: "Content Posting API adapter not built",
    },
    {
      id: "instagram",
      name: "Instagram",
      status: "not_wired",
      env: [
        { name: "INSTAGRAM_ACCESS_TOKEN", present: false },
        { name: "INSTAGRAM_USER_ID", present: false },
      ],
      cli: CLI,
      note: "Graph API adapter not built",
    },
  ];
  return { slots, exports, channels, publications, snapshots };
}

function get(): Store {
  if (!store) store = seed(Date.now());
  return store;
}

export class FixtureRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const fxSchedule = () => ({ slots: get().slots.map((s) => ({ ...s })), now: new Date().toISOString() });
export const fxChannels = () => ({ channels: get().channels, mode: "dry" as const });
export const fxExports = () => ({ exports: get().exports });
export const fxMetrics = () => ({ publications: get().publications, snapshots: get().snapshots });
export const fxRefresh = () => ({ refreshed: 0, note: "fixture: no platform reached" });

export function fxCreate(body: {
  projectId: string;
  exportId: string;
  channelId: ChannelId;
  publishAt: string;
  title: string;
  description: string;
  tags: string[];
}): { slot: ScheduleSlot } {
  const s = get();
  const ch = s.channels.find((c) => c.id === body.channelId);
  if (!ch || ch.status === "not_wired") throw new FixtureRefusal(`channel ${body.channelId} is not wired`, 409);
  if (!s.exports.some((e) => e.id === body.exportId)) throw new FixtureRefusal(`unknown export ${body.exportId}`, 409);
  seq += 1;
  const slot: ScheduleSlot = {
    id: `fx-new-${seq}`,
    ...body,
    status: "scheduled",
    publicationId: null,
    error: null,
    createdAt: new Date().toISOString(),
    missedAt: null,
  };
  s.slots.push(slot);
  return { slot: { ...slot } };
}

export function fxPatch(id: string, body: { publishAt?: string; status?: "scheduled" | "cancelled" }): { slot: ScheduleSlot } {
  const s = get();
  const slot = s.slots.find((x) => x.id === id);
  if (!slot) throw new FixtureRefusal(`unknown slot ${id}`, 404);
  if (slot.status !== "scheduled" && slot.status !== "missed" && slot.status !== "failed")
    throw new FixtureRefusal(`slot ${id} is ${slot.status}; only a scheduled, missed or failed slot can change`, 409);
  if (body.publishAt) slot.publishAt = body.publishAt;
  if (body.status) slot.status = body.status;
  if (body.status === "scheduled") {
    slot.missedAt = null;
    slot.error = null;
  }
  return { slot: { ...slot } };
}

export function fxDelete(id: string): { slot: ScheduleSlot } {
  return fxPatch(id, { status: "cancelled" });
}
