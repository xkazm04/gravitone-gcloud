// CHANNEL READINESS — what each publishing channel can do on THIS machine,
// right now. Server-only (it reads the process environment and probes PATH).
//
// THE ONE PLACE THESE FACTS LIVE. The Calendar's Channels tab, the
// `/api/publish/channels` route, `pipeline/publish.mts channels` and the
// preflight's `publish` capability row all read `channelReadiness()`; none of
// them re-derives "is YouTube live" from a key check of its own
// (lib/capabilities.ts's rule, applied to this seam).
//
// THREE STATUSES, AS StatReel SEEDED THEM (apps/server/src/calendar.ts seed()):
//   live       PUBLISH_MODE=live AND every YouTube variable is present
//   dry        everything else for YouTube — a publish writes a request plan
//              and records `dry: true`; nothing reaches the network
//   not_wired  TikTok and Instagram: their variables are DECLARED so the
//              operator can see what they will need, but no adapter exists and
//              scheduling onto them is refused (409), whatever is set
//
// PRESENCE IS NOT VALIDITY. A revoked refresh token reads `present: true` here
// and fails on the first live call — the same ceiling the preflight states.

import { spawnSync } from "node:child_process";

import { canSpawnLocalBinaries } from "../deployment";

import { YOUTUBE_ENV_VARS } from "./oauth";
import type { ChannelId, ChannelReadiness } from "./types";
import type { PublishMode } from "./youtube";

export const PUBLISH_MODE_VAR = "PUBLISH_MODE";
export const PUBLISH_MISSED_MIN_VAR = "PUBLISH_MISSED_MIN";
export const TIKTOK_ENV_VARS = ["TIKTOK_ACCESS_TOKEN"] as const;
export const INSTAGRAM_ENV_VARS = ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"] as const;

/** Every variable this seam reads — the preflight's .env.example cross-check walks it. */
export const PUBLISH_ENV_VARS: readonly string[] = [
  PUBLISH_MODE_VAR,
  PUBLISH_MISSED_MIN_VAR,
  ...YOUTUBE_ENV_VARS,
  ...TIKTOK_ENV_VARS,
  ...INSTAGRAM_ENV_VARS,
];

export const CHANNEL_IDS: readonly ChannelId[] = ["youtube", "tiktok", "instagram"];

export class PublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishConfigError";
  }
}

/** The REQUESTED mode. Unset = dry. Anything other than dry|live is a typo
 *  that must not be read as either — it throws rather than guessing. */
export function publishModeFromEnv(env: NodeJS.ProcessEnv = process.env): PublishMode {
  const mode = env[PUBLISH_MODE_VAR]?.trim() || "dry";
  if (mode !== "dry" && mode !== "live") throw new PublishConfigError(`${PUBLISH_MODE_VAR} must be 'dry' or 'live', got '${mode}'`);
  return mode;
}

/** Minutes past `publishAt` after which a slot is MISSED rather than published
 *  late (StatReel calendar.ts: "a stale private upload after downtime is worse
 *  than none"). Unset or not a positive number = 60. */
export function missedWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  const m = Number(env[PUBLISH_MISSED_MIN_VAR]);
  return Number.isFinite(m) && m > 0 ? m * 60_000 : 60 * 60_000;
}

const present = (env: NodeJS.ProcessEnv, name: string) => Boolean(env[name]?.trim());

/** Whether YouTube would actually upload: requested live AND all three set.
 *  Requested live with a variable missing is NOT live — the channel reads
 *  `dry` and its note names what is missing, so the record (`dry: true`) and
 *  the readiness row agree. */
export function youtubeEffectiveMode(env: NodeJS.ProcessEnv = process.env): PublishMode {
  return publishModeFromEnv(env) === "live" && YOUTUBE_ENV_VARS.every((v) => present(env, v)) ? "live" : "dry";
}

// ── CLI probes ───────────────────────────────────────────────────────────────

/** The binaries the export → publish path leans on. ffmpeg muxes every export
 *  (lib/musicVideoExport.ts); ffprobe reads an export's real duration/codec
 *  back. Probed once per process: PATH does not change under a running server,
 *  and a Calendar polling this route must not fork twice per request. */
const CLI_NAMES = ["ffmpeg", "ffprobe"] as const;
let cliCache: { name: string; present: boolean }[] | null = null;

function onPath(bin: string): boolean {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    // a literal binary name from the list above — nothing caller-supplied is interpolated
    const r = spawnSync(`${finder} ${bin}`, { shell: true, encoding: "utf8", timeout: 5_000, windowsHide: true });
    return r.status === 0 && Boolean(r.stdout?.trim());
  } catch {
    return false;
  }
}

/**
 * ASKED OF THE POSTURE FIRST. Where lib/deployment.ts forbids spawning a local
 * binary (LOCAL_BINARIES=off, a managed platform) nothing here can render, so
 * the answer is `forbidden` and PATH is never probed: the `where`/`which` above
 * runs through a shell, and a managed deployment starts no process at all — the
 * deployment-cell lane counted two per Cloud Run cell until 2026-10-06. Checked
 * before the cache, per call, because the posture is (lib/deployment.ts).
 */
export function cliPresence(): ChannelReadiness["cli"] {
  if (!canSpawnLocalBinaries()) return CLI_NAMES.map((name) => ({ name, present: false, forbidden: true as const }));
  cliCache ??= CLI_NAMES.map((name) => ({ name, present: onPath(name) }));
  return cliCache.map((c) => ({ ...c }));
}

// ── the readiness table ──────────────────────────────────────────────────────

export function channelReadiness(env: NodeJS.ProcessEnv = process.env): { channels: ChannelReadiness[]; mode: PublishMode } {
  const mode = publishModeFromEnv(env);
  const cli = cliPresence();
  const envRows = (names: readonly string[]) => names.map((name) => ({ name, present: present(env, name) }));

  const ytEnv = envRows(YOUTUBE_ENV_VARS);
  const ytMissing = ytEnv.filter((e) => !e.present).map((e) => e.name);
  const ytStatus = youtubeEffectiveMode(env);
  const ytNote =
    ytStatus === "live"
      ? "private uploads; visibility is changed on YouTube by hand"
      : mode === "live"
        ? `${PUBLISH_MODE_VAR}=live, but ${ytMissing.join(", ")} unset: publishing runs dry`
        : `${PUBLISH_MODE_VAR}=dry: publishing writes a request plan, no upload`;

  return {
    mode,
    channels: [
      { id: "youtube", name: "YouTube", status: ytStatus, env: ytEnv, cli, note: ytNote },
      { id: "tiktok", name: "TikTok", status: "not_wired", env: envRows(TIKTOK_ENV_VARS), cli, note: "Content Posting API adapter not built" },
      { id: "instagram", name: "Instagram", status: "not_wired", env: envRows(INSTAGRAM_ENV_VARS), cli, note: "Graph API adapter not built" },
    ],
  };
}

export function isChannelId(v: unknown): v is ChannelId {
  return typeof v === "string" && (CHANNEL_IDS as readonly string[]).includes(v);
}
