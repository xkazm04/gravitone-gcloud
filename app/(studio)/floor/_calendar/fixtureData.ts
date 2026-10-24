import "server-only";

// THE FIXTURE CALENDAR - the slots the Floor's rail, month and slot level are built, driven and
// photographed against in the fixture universe (GRAVITONE_PRODUCE_SIDE=fixture, ./port.ts); the
// real side has read the kernel's slot store since Phase 6 wave B (./real.ts). Every
// row is a domain Slot (@gt/domain/slot) and goes through `slotSchema` at the door
// (./fixture.ts), so a fixture that breaks an invariant - a failed slot with no sentence, a
// claim on a slot that is not publishing - fails at boot rather than drawing a state the
// machine cannot reach.
//
// Shaped to be leaned on, as v1's publish fixture was (pipeline/fixtures/publish.ts): every
// state, every channel the badge set knows (blog among them, owner ruling 2026-10-17), the
// three ways a publish breaks - credentials, quota, and the interruption v1 names
// (lib/publish/schedule.ts INTERRUPTED_TEXT, verbatim) - both drifts, a failure cancelled
// afterwards (its error kept), metrics with gaps (null, never 0) and a figure that is a floor.
//
// Times are minutes from the hour the fixture was first read, so the rail always has a NOW to
// draw between the past and the future. The ids are fixed: cx screens and the live spec name
// them (`sl-chokepoint-quota` is the failed slot `floor-slot` photographs).

import type { Look } from "@gt/ui/components/status/status.ts";

const H = 60;
const D = 24 * H;

export type FixtureMetric = {
  readonly views: number | null;
  readonly viewsFloor?: true;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly shares: number | null;
  readonly avgViewDurationS: number | null;
  readonly subsDelta: number | null;
  /** Minutes after the publish the snapshot was read. */
  readonly after: number;
};

export type FixtureSlot = {
  readonly id: string;
  readonly item: string;
  readonly channel: "youtube" | "tiktok" | "instagram" | "blog";
  /** Minutes from the anchor hour. */
  readonly at: number;
  readonly state: "scheduled" | "publishing" | "published" | "missed" | "failed" | "cancelled";
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly project?: string;
  readonly error?: string;
  readonly drift?: "export_missing" | "channel_not_wired";
  readonly metric?: FixtureMetric;
};

/** The Library items the slots publish: a preset clip and its poster, or an article run's post. */
export const ITEMS: Readonly<Record<string, { readonly video: string; readonly poster: string; readonly title: string; readonly meta: string } | { readonly pr?: string }>> = {
  "video:export:glass-harbor-trailer": { video: "/clips/presets/paper-relief.webm", poster: "/clips/presets/paper-relief.jpg", title: "Glass Harbor — trailer", meta: "film · 41.2 MB" },
  "video:export:glass-harbor-teaser": { video: "/clips/presets/newsprint-cutout.webm", poster: "/clips/presets/newsprint-cutout.jpg", title: "Glass Harbor · teaser", meta: "film · 12.8 MB" },
  "video:export:why-bitcoin": { video: "/clips/presets/data-neon.webm", poster: "/clips/presets/data-neon.jpg", title: "Why the Bitcoin price does not rise", meta: "film · 88.0 MB" },
  "video:export:chokepoint": { video: "/clips/presets/blueprint.webm", poster: "/clips/presets/blueprint.jpg", title: "Chokepoint explainer", meta: "film · 63.5 MB" },
  "video:export:quiet-tariff": { video: "/clips/presets/chalk-argument.webm", poster: "/clips/presets/chalk-argument.jpg", title: "The quiet tariff", meta: "ad · 9.1 MB" },
  "video:export:signal-room": { video: "/clips/presets/signal-ledger.webm", poster: "/clips/presets/signal-ledger.jpg", title: "Signal Room · ad", meta: "ad · 7.4 MB" },
  "video:export:river-steps": { video: "/clips/presets/paper-relief.webm", poster: "/clips/presets/paper-relief.jpg", title: "Two hundred days of rain", meta: "music-video · 54.0 MB" },
  "article:run:art-2026-10-14-faceting": { pr: "https://github.com/xkazm04/ai-registry/pull/41" },
  "article:run:art-2026-10-11-search": { pr: "https://github.com/xkazm04/ai-registry/pull/37" },
  "article:run:art-2026-10-16-routing": {},
};

/** The seeded produce projects (../../projects/_port/fixtureData.ts) and their steps as looks. */
export const PROJECTS: Readonly<Record<string, { readonly title: string; readonly steps: readonly Look[] }>> = {
  "glass-harbor-trailer": { title: "Glass Harbor — trailer", steps: ["done", "done", "done", "done", "done", "done"] },
  "why-bitcoin": { title: "Why the Bitcoin price does not rise", steps: ["done", "running", "idle", "idle", "idle", "idle"] },
  "the-quiet-tariff": { title: "The quiet tariff", steps: ["done", "done", "failed", "idle", "done", "idle"] },
  "provider-routing-explainer": { title: "Generative provider routing — explainer", steps: ["done"] },
};

const DESC_HARBOR = "A crew that never breaks in waits for the one door every city leaves unlocked.\n\nShot list, score and cut: Glass Harbor project.";

export const SLOTS: readonly FixtureSlot[] = [
  // ── next ──
  { id: "sl-harbor-teaser-tt", item: "video:export:glass-harbor-teaser", channel: "tiktok", at: 2 * H, state: "scheduled", title: "Glass Harbor · teaser", description: "Four people, one tide table.", tags: ["heist", "teaser"], project: "glass-harbor-trailer" },
  { id: "sl-bitcoin-yt", item: "video:export:why-bitcoin", channel: "youtube", at: 5 * H + 30, state: "scheduled", title: "Why the Bitcoin price does not rise", description: "The supply is fixed; the price is not. Eight minutes on why.", tags: ["economics", "explainer"], project: "why-bitcoin" },
  { id: "sl-routing-blog", item: "article:run:art-2026-10-16-routing", channel: "blog", at: D + 3 * H, state: "scheduled", title: "Generative provider routing", description: "", tags: ["media-generation", "registry"], project: "provider-routing-explainer" },
  { id: "sl-harbor-ig", item: "video:export:glass-harbor-trailer", channel: "instagram", at: 2 * D + 6 * H, state: "scheduled", title: "Glass Harbor — trailer · square", description: DESC_HARBOR, tags: ["heist", "trailer"], project: "glass-harbor-trailer" },
  { id: "sl-tariff-yt-later", item: "video:export:quiet-tariff", channel: "youtube", at: 9 * D + 2 * H, state: "scheduled", title: "The quiet tariff", description: "Who pays a tariff nobody announces.", tags: ["trade"], project: "the-quiet-tariff" },
  { id: "sl-signal-yt-next", item: "video:export:signal-room", channel: "youtube", at: 21 * D, state: "scheduled", title: "Signal Room · ad", description: "Thirty seconds, one room, every signal.", tags: ["ad"] },
  { id: "sl-harbor-yt-live", item: "video:export:glass-harbor-trailer", channel: "youtube", at: -4, state: "publishing", title: "Glass Harbor — official trailer", description: DESC_HARBOR, tags: ["heist", "trailer", "short film"], project: "glass-harbor-trailer" },
  // ── what the operator owes ──
  { id: "sl-chokepoint-quota", item: "video:export:chokepoint", channel: "youtube", at: -D - 3 * H, state: "failed", title: "Chokepoint explainer", description: "Every shipping lane has one strait it cannot route around.", tags: ["geography", "trade"], error: "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota." },
  { id: "sl-bitcoin-tt-auth", item: "video:export:why-bitcoin", channel: "tiktok", at: -5 * H, state: "failed", title: "Why the Bitcoin price does not rise · vertical", description: "", tags: ["economics"], project: "why-bitcoin", error: "auth: access_token_invalid - The access token is invalid or not found in the request." },
  { id: "sl-harbor-yt-interrupted", item: "video:export:glass-harbor-teaser", channel: "youtube", at: -2 * D - 4 * H, state: "failed", title: "Glass Harbor · teaser", description: DESC_HARBOR, tags: ["heist"], project: "glass-harbor-trailer", error: "interrupted before the publish finished" },
  { id: "sl-tariff-tt-missed", item: "video:export:quiet-tariff", channel: "tiktok", at: -3 * D - 2 * H, state: "missed", title: "The quiet tariff · vertical", description: "Who pays a tariff nobody announces.", tags: ["trade"], project: "the-quiet-tariff" },
  { id: "sl-signal-ig-drift", item: "video:export:signal-room", channel: "instagram", at: D + 9 * H, state: "scheduled", title: "Signal Room · square", description: "Thirty seconds, one room, every signal.", tags: ["ad"], drift: "channel_not_wired" },
  { id: "sl-chokepoint-tt-drift", item: "video:export:chokepoint", channel: "tiktok", at: 3 * D + 4 * H, state: "scheduled", title: "Chokepoint explainer · vertical", description: "", tags: ["geography"], drift: "export_missing" },
  // ── history ──
  { id: "sl-harbor-yt-out", item: "video:export:glass-harbor-trailer", channel: "youtube", at: -6 * D, state: "published", title: "Glass Harbor — they never break in", description: DESC_HARBOR, tags: ["heist", "short film", "cinematic"], project: "glass-harbor-trailer", metric: { views: 18_420, likes: 1_204, comments: 88, shares: 140, avgViewDurationS: 71, subsDelta: 37, after: 5 * D } },
  { id: "sl-search-blog-out", item: "article:run:art-2026-10-11-search", channel: "blog", at: -5 * D - 2 * H, state: "published", title: "Search that answers the question asked", description: "", tags: ["software-engineering"] },
  { id: "sl-bitcoin-tt-out", item: "video:export:why-bitcoin", channel: "tiktok", at: -4 * D - 7 * H, state: "published", title: "Why the Bitcoin price does not rise · cut", description: "", tags: ["economics"], project: "why-bitcoin", metric: { views: 52_000, viewsFloor: true, likes: 3_100, comments: null, shares: null, avgViewDurationS: null, subsDelta: null, after: 3 * D } },
  { id: "sl-faceting-blog-out", item: "article:run:art-2026-10-14-faceting", channel: "blog", at: -2 * D - 6 * H, state: "published", title: "Faceting without a second index", description: "", tags: ["software-engineering"] },
  { id: "sl-tariff-ig-cancelled", item: "video:export:quiet-tariff", channel: "instagram", at: -D - 8 * H, state: "cancelled", title: "The quiet tariff · square", description: "", tags: ["trade"], project: "the-quiet-tariff", error: "upload: 400 invalid_container - The video container is not supported; re-export as MP4 (H.264)." },
  { id: "sl-signal-tt-cancelled", item: "video:export:signal-room", channel: "tiktok", at: 4 * D + 2 * H, state: "cancelled", title: "Signal Room · vertical", description: "", tags: ["ad"] },
];

/** The id the failed-slot screen photographs (cx `floor-slot`). */
export const FIXTURE_FAILED_SLOT = "sl-chokepoint-quota";

/**
 * What each channel can do in the fixture universe - the readiness v1's seam reports with nothing
 * set (lib/publish/channels.ts): YouTube runs dry (PUBLISH_MODE unset), Instagram has no adapter
 * (the drifted `sl-signal-ig-drift` says so on its slot), TikTok runs dry like YouTube here so its
 * slots have somewhere to go, and blog goes out by the article approve.
 */
export const CHANNEL_SEED: readonly { readonly channel: "youtube" | "tiktok" | "instagram" | "blog"; readonly state: "live" | "dry" | "not_wired" | "act"; readonly env: readonly string[]; readonly note?: string }[] = [
  { channel: "youtube", state: "dry", env: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"], note: "PUBLISH_MODE=dry: publishing writes a request plan, no upload" },
  { channel: "tiktok", state: "dry", env: ["TIKTOK_ACCESS_TOKEN"], note: "PUBLISH_MODE=dry: publishing writes a request plan, no upload" },
  { channel: "instagram", state: "not_wired", env: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"], note: "Graph API adapter not built" },
  { channel: "blog", state: "act", env: [] },
];

