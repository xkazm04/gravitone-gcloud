// THE PUBLISHING UNIVERSE — what the Calendar (Schedule · Channels · Metrics ·
// Composer · BroadcastWeek) and Board › Publish read, written in exactly the
// on-disk shape lib/publish/store.ts documents:
//
//   fixtures-out/publish/schedule.json       { version, slots, claims }
//   fixtures-out/publish/publications.json   { version, publications }
//   fixtures-out/publish/metrics.json        { version, snapshots }
//   fixtures-out/publish/plans/<slotId>.json the request plan a dry run WOULD send
//   fixtures-out/publish/sessions/<slotId>.json  one resumable live upload to resume
//   fixtures-out/music-video-exports/<id>.mp4 + <id>.json {projectId} (+ .srt/.vtt)
//   fixtures-out/ad-exports/<id>.mp4          + <id>.json {projectId}
//
// THE MP4S LIST BUT DO NOT PLAY. Each is an ISO-BMFF skeleton — a real `ftyp`,
// a `free`, and an `mdat` of seeded noise — enough for the exports lister, the
// sha256 the plans carry and the byte count, and nothing a decoder will accept.
// The Poster component draws from the export id, not from the frames.
//
// THE CALENDAR IS SHAPED TO BE LEANED ON. Every SlotStatus is present; the
// slot due inside the hour, the one a live process is claiming right now, busy
// days of three, empty stretches, a dead-letter of failures phrased the way each
// platform words them, and metrics that include the awkward cases: statistics-
// only series (watch time null, not 0), a series with a late-starting column, two
// publications whose every number is withheld, one live publication nobody has
// pulled yet. A dry publication carries no snapshots at all — that is what the
// store does (lib/publish/metrics.ts metricsDataOf says "dry-run").
//
// WHAT IT DELIBERATELY LEAVES ALONE: channel readiness. That is probed from env
// and PATH at request time (lib/publish/channels.ts); nothing written here
// pretends a channel is wired. A scheduled slot on an unwired channel will read
// as drifted after the first sweep — that is the app being honest, not a fault.
//
// SWEEP-SAFE. GET /api/publish/schedule sweeps: an overdue `scheduled` slot
// becomes missed, a `publishing` slot whose claim's process is gone becomes
// failed. So the missed rows are written already missed, the one claim is held
// under a pid that exists on every machine (init / System) and is minutes old.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync, utimesSync } from "node:fs";
import path from "node:path";

import type { ChannelId, MetricSnapshot, Publication, ScheduleSlot, SlotStatus } from "../../lib/publish/types";
import { DAY, HOUR, iso, MIN, NOW, outFile, rng, writeBytes, writeJson } from "./kit";

/* ── the exports ─────────────────────────────────────────────────────────── */

interface Exp {
  id: string;
  projectId: string;
  /** music-video-exports or ad-exports. */
  root: "mv" | "ad";
  /** how old the file is, in days. */
  ageDays: number;
  title: string;
  hook: string;
  tags: string[];
  captions?: "srt" | "vtt";
}

const r = rng("publish");
const uuid = () => `${r.hex(8)}-${r.hex(4)}-4${r.hex(3)}-${r.pick(["8", "9", "a", "b"])}${r.hex(3)}-${r.hex(12)}`;

const EXPORTS: Exp[] = [
  {
    id: uuid(),
    projectId: "seed-glass-harbor",
    root: "mv",
    ageDays: 24,
    title: "Glass Harbor — they never break in",
    hook: "A crew that never breaks in waits for the one door every city leaves unlocked.",
    tags: ["heist", "short film", "cinematic", "glass harbor", "ai film"],
    captions: "srt",
  },
  {
    id: uuid(),
    projectId: "seed-glass-harbor-trailer",
    root: "mv",
    ageDays: 18,
    title: "Glass Harbor — official trailer",
    hook: "Four people, one tide table, a vault under the fish market.",
    tags: ["trailer", "heist", "glass harbor", "cinematic"],
    captions: "vtt",
  },
  {
    id: uuid(),
    projectId: "seed-why-bitcoin",
    root: "mv",
    ageDays: 20,
    title: "Why the Bitcoin price does not rise",
    hook: "Every buyer needs a seller. Here is who is selling, and why they are not done.",
    tags: ["bitcoin", "explainer", "markets", "crypto", "finance"],
    captions: "srt",
  },
  {
    id: uuid(),
    projectId: "seed-why-bitcoin",
    root: "mv",
    ageDays: 9,
    title: "Bitcoin in 31 seconds",
    hook: "The supply schedule, drawn as a staircase.",
    tags: ["bitcoin", "shorts", "explainer"],
  },
  {
    id: uuid(),
    projectId: "seed-the-quiet-tariff",
    root: "ad",
    ageDays: 15,
    title: "The quiet tariff — what a tariff does to a shelf price",
    hook: "A tariff is a tax you pay at the till and never see on the receipt.",
    tags: ["tariff", "trade", "economics", "explainer"],
  },
  {
    id: uuid(),
    projectId: "seed-the-quiet-tariff",
    root: "mv",
    ageDays: 6,
    title: "The quiet tariff — the 60 second cut",
    hook: "Four stops between a factory and a shelf, and who adds what.",
    tags: ["tariff", "supply chain", "shorts"],
    captions: "srt",
  },
  {
    id: uuid(),
    projectId: "seed-two-hundred-days",
    root: "mv",
    ageDays: 12,
    title: "Two hundred days of rain",
    hook: "A town counts the days the river stayed above the second step.",
    tags: ["climate", "documentary", "short film", "rain"],
  },
  {
    id: uuid(),
    projectId: "seed-two-hundred-days",
    root: "ad",
    ageDays: 3.5,
    title: "Two hundred days of rain — the spot",
    hook: "Thirty seconds of the wettest year on record.",
    tags: ["climate", "spot", "rain"],
  },
  {
    id: uuid(),
    projectId: "seed-untitled",
    root: "mv",
    ageDays: 1.2,
    title: "The port strike, from the water",
    hook: "Eleven days, forty cranes, and one tug that kept running.",
    tags: ["port strike", "labour", "documentary", "shorts"],
  },
];

/** `ftyp` + `free` + `mdat` — lists and hashes, does not decode. */
function mp4Skeleton(seed: string, kb: number): Buffer {
  const rr = rng(seed);
  const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom", "ascii"), Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2avc1mp41", "ascii")]);
  const free = Buffer.concat([Buffer.from([0, 0, 0, 8]), Buffer.from("free", "ascii")]);
  const body = Buffer.alloc(kb * 1024);
  for (let i = 0; i < body.length; i++) body[i] = Math.floor(rr.next() * 256);
  const mdatHead = Buffer.alloc(8);
  mdatHead.writeUInt32BE(body.length + 8, 0);
  mdatHead.write("mdat", 4, "ascii");
  return Buffer.concat([ftyp, free, mdatHead, body]);
}

const CAPTION_LINES = [
  "They never break in.",
  "They wait for the door every city leaves unlocked.",
  "Tide tables, not crowbars.",
  "By the time the alarm sounds, the vault is a rumour.",
];
function srt(): string {
  return CAPTION_LINES.map((l, i) => `${i + 1}\n00:00:${String(i * 4).padStart(2, "0")},000 --> 00:00:${String(i * 4 + 3).padStart(2, "0")},400\n${l}\n`).join("\n");
}
function vtt(): string {
  return `WEBVTT\n\n${CAPTION_LINES.map((l, i) => `00:00:${String(i * 4).padStart(2, "0")}.000 --> 00:00:${String(i * 4 + 3).padStart(2, "0")}.400\n${l}\n`).join("\n")}`;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/* ── the slots ───────────────────────────────────────────────────────────── */

const startOfDay = Math.floor(NOW / DAY) * DAY;
/** `d` days from today's 00:00 UTC, at hour `h`. */
const at = (d: number, h: number): number => startOfDay + d * DAY + h * HOUR;

interface Row {
  when: number;
  ch: ChannelId;
  status: SlotStatus;
  exp: number;
  /** a published row: live upload (a real platform id) rather than a dry run. */
  live?: boolean;
  /** title override — a re-cut of an export already on that channel. */
  title?: string;
  error?: string | null;
  missed?: boolean;
  /** how long before the slot's time it was put on the calendar. */
  leadDays?: number;
}

const YT_QUOTA = "videos.insert (init) 403: The request cannot be completed because you have exceeded your quota. (quotaExceeded)";
const YT_CHUNK = "videos.insert (chunk) 503: Backend Error — the upload stopped after 3 retries and its session was kept";
const TT_TOKEN = "TikTok content posting: access_token_invalid — the access token is invalid or has expired";
const IG_TOKEN = "Instagram Graph API OAuthException 190: Error validating access token: Session has expired";
const IG_FORMAT = "Instagram media container ERROR 2207026: the video format is not supported — Reels need H.264 in an MP4 container, 9:16, 3 to 90 seconds";
const INTERRUPTED = "interrupted before the publish finished";

const ROWS: Row[] = [
  // — published, oldest first —
  { when: at(-21, 14), ch: "youtube", status: "published", exp: 0, live: true },
  { when: at(-21, 18), ch: "tiktok", status: "published", exp: 0 },
  { when: at(-19, 15), ch: "instagram", status: "published", exp: 0 },
  { when: at(-17, 16), ch: "youtube", status: "published", exp: 2, live: true },
  { when: at(-16, 12), ch: "tiktok", status: "published", exp: 2 },
  { when: at(-14, 17), ch: "youtube", status: "published", exp: 1 },
  { when: at(-13, 11), ch: "instagram", status: "published", exp: 1 },
  { when: at(-12, 15), ch: "youtube", status: "published", exp: 4, live: true },
  { when: at(-11, 18), ch: "tiktok", status: "published", exp: 4 },
  { when: at(-9, 14), ch: "youtube", status: "published", exp: 6, live: true },
  { when: at(-9, 19), ch: "instagram", status: "published", exp: 6 },
  { when: at(-7, 16), ch: "youtube", status: "published", exp: 3, live: true },
  { when: at(-6, 13), ch: "tiktok", status: "published", exp: 3 },
  { when: at(-4, 17), ch: "youtube", status: "published", exp: 5, live: true },
  { when: at(-3, 12), ch: "instagram", status: "published", exp: 5 },
  { when: at(-2, 15), ch: "tiktok", status: "published", exp: 7 },
  { when: at(-1, 10), ch: "youtube", status: "published", exp: 7, live: true },

  // — failed, each in its platform's words —
  { when: at(-15, 13), ch: "youtube", status: "failed", exp: 0, title: "Glass Harbor — they never break in (Shorts cut)", error: INTERRUPTED },
  { when: at(-10, 16), ch: "instagram", status: "failed", exp: 4, error: IG_TOKEN },
  { when: at(-8, 12), ch: "tiktok", status: "failed", exp: 2, title: "Why the Bitcoin price does not rise — part 1", error: TT_TOKEN },
  { when: at(-5, 14), ch: "youtube", status: "failed", exp: 5, title: "The quiet tariff — the 60 second cut (re-upload)", error: YT_QUOTA },
  { when: at(-2, 18), ch: "youtube", status: "failed", exp: 6, title: "Two hundred days of rain — full cut", error: YT_CHUNK },
  { when: at(-1, 14), ch: "instagram", status: "failed", exp: 3, title: "Bitcoin in 31 seconds — reel", error: IG_FORMAT },

  // — missed: overdue past the window, never published late —
  { when: at(-6, 9), ch: "youtube", status: "missed", exp: 1, title: "Glass Harbor — official trailer (premiere slot)", missed: true },
  { when: at(-3, 16), ch: "instagram", status: "missed", exp: 4, missed: true },
  { when: NOW - 4 * HOUR, ch: "tiktok", status: "missed", exp: 5, title: "The quiet tariff — four stops", missed: true },

  // — cancelled —
  { when: at(-4, 9), ch: "instagram", status: "cancelled", exp: 3, missed: true, title: "Bitcoin in 31 seconds — reel (first slot)" },
  { when: at(2, 17), ch: "tiktok", status: "cancelled", exp: 5, title: "The quiet tariff — the 60 second cut (superseded)" },
  { when: at(6, 12), ch: "youtube", status: "cancelled", exp: 8, error: "this channel is not wired" },

  // — publishing: a live process holds the claim —
  { when: NOW - 3 * MIN, ch: "youtube", status: "publishing", exp: 8 },

  // — scheduled —
  { when: NOW + 40 * MIN, ch: "instagram", status: "scheduled", exp: 8 },
  { when: NOW + 5 * HOUR, ch: "tiktok", status: "scheduled", exp: 6, title: "Two hundred days of rain — the river" },
  { when: at(1, 9), ch: "instagram", status: "scheduled", exp: 2 },
  { when: at(1, 15), ch: "youtube", status: "scheduled", exp: 1, title: "Glass Harbor — trailer, the vault scene" },
  { when: at(1, 19), ch: "tiktok", status: "scheduled", exp: 1 },
  { when: at(2, 12), ch: "youtube", status: "scheduled", exp: 3, title: "Bitcoin in 31 seconds — the staircase" },
  { when: at(4, 10), ch: "instagram", status: "scheduled", exp: 7 },
  { when: at(4, 14), ch: "youtube", status: "scheduled", exp: 4, title: "The quiet tariff — who pays at the till" },
  { when: at(4, 18), ch: "tiktok", status: "scheduled", exp: 4 },
  { when: at(5, 16), ch: "youtube", status: "scheduled", exp: 0, title: "Glass Harbor — the door nobody locks" },
  { when: at(7, 11), ch: "tiktok", status: "scheduled", exp: 7, title: "Two hundred days of rain — day 200" },
  { when: at(8, 17), ch: "instagram", status: "scheduled", exp: 6 },
  { when: at(10, 15), ch: "youtube", status: "scheduled", exp: 2, title: "Why the Bitcoin price does not rise — the sellers" },
  { when: at(10, 19), ch: "instagram", status: "scheduled", exp: 0, title: "Glass Harbor — they never break in (reel)" },
  { when: at(13, 9), ch: "tiktok", status: "scheduled", exp: 5, title: "The quiet tariff — 60 seconds" },
  { when: at(15, 14), ch: "youtube", status: "scheduled", exp: 8, title: "The port strike, from the water — eleven days" },
  { when: at(18, 12), ch: "instagram", status: "scheduled", exp: 3 },
  { when: at(21, 16), ch: "youtube", status: "scheduled", exp: 6, title: "Two hundred days of rain — the year in one take" },
  { when: at(24, 18), ch: "tiktok", status: "scheduled", exp: 2, title: "Why the Bitcoin price does not rise — in a minute" },
  { when: at(27, 13), ch: "youtube", status: "scheduled", exp: 4, title: "The quiet tariff — a year later" },
];

const descOf = (e: Exp, ch: ChannelId): string => {
  if (ch === "youtube")
    return `${e.hook}\n\nMade with generated imagery over generated music; every frame is synthetic.\n\n${e.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`;
  if (ch === "tiktok") return `${e.hook} ${e.tags.slice(0, 3).map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`;
  return `${e.hook}\n.\n${e.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`;
};

const platformId = () => Array.from({ length: 11 }, () => r.pick([..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"])).join("");

/** A pid that exists on this machine whoever runs the server (EPERM counts as
 *  alive in lib/publish/schedule.ts processAlive). */
const ALIVE_PID = process.platform === "win32" ? 4 : 1;

/* ── metrics ─────────────────────────────────────────────────────────────── */

type Profile = "analytics" | "statistics" | "partial" | "withheld" | "none";

function snapshotsFor(pubId: string, publishedMs: number, profile: Profile, finalViews: number, avgDur: number): MetricSnapshot[] {
  if (profile === "none") return [];
  const out: MetricSnapshot[] = [];
  const age = NOW - publishedMs;
  const offsets = [3 * HOUR, 1 * DAY, 2 * DAY, 4 * DAY, 7 * DAY, 10 * DAY, 14 * DAY, 18 * DAY, 21 * DAY].filter((o) => o < age - HOUR);
  const tail = age - 20 * MIN; // the latest pull
  const times = [...offsets, tail];
  const tau = 4 * DAY;
  let last = 0;
  times.forEach((o, i) => {
    const frac = 1 - Math.exp(-o / tau);
    const views = Math.max(last, Math.round(finalViews * frac * r.float(0.97, 1.03)));
    last = views;
    const likes = Math.round(views * r.float(0.035, 0.05));
    const base: MetricSnapshot = {
      publicationId: pubId,
      at: new Date(publishedMs + o).toISOString(),
      views,
      watchTimeS: null,
      avgViewDurationS: null,
      likes,
      comments: Math.round(views * r.float(0.002, 0.005)),
      shares: null,
      subsDelta: null,
    };
    if (profile === "analytics")
      Object.assign(base, {
        watchTimeS: Math.round(views * avgDur),
        avgViewDurationS: Math.round(avgDur * r.float(0.97, 1.03)),
        shares: Math.round(views * r.float(0.004, 0.009)),
        subsDelta: Math.round(views * r.float(0.0015, 0.003)),
      });
    if (profile === "partial") {
      // statistics-only at first; analytics arrive (and likes lag) on later pulls
      if (i < 2) base.likes = null;
      if (i >= 3) Object.assign(base, { watchTimeS: Math.round(views * avgDur), avgViewDurationS: Math.round(avgDur) });
    }
    if (profile === "withheld")
      Object.assign(base, { views: null, likes: null, comments: null });
    out.push(base);
  });
  return out;
}

/* ── the plan a dry run writes ───────────────────────────────────────────── */

function planRequests(slot: ScheduleSlot, file: { name: string; bytes: number; sha: string }) {
  const media = { file: file.name, bytes: file.bytes, sha256: file.sha, contentType: "video/mp4" };
  if (slot.channelId === "youtube") {
    const body = {
      snippet: { title: slot.title, description: slot.description, tags: slot.tags, categoryId: "10" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    };
    const bodyText = JSON.stringify(body);
    return [
      {
        method: "POST",
        url: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Content-Length": String(Buffer.byteLength(bodyText)),
          "X-Upload-Content-Length": String(file.bytes),
          "X-Upload-Content-Type": "video/mp4",
        },
        body,
      },
      {
        method: "PUT",
        url: "<session-uri from Location header>",
        headers: { "Content-Length": String(file.bytes), "Content-Type": "video/mp4", "Content-Range": `bytes 0-${file.bytes - 1}/${file.bytes}` },
        body: { media, range: [0, file.bytes - 1] },
      },
    ];
  }
  if (slot.channelId === "tiktok")
    return [
      {
        method: "POST",
        url: "https://open.tiktokapis.com/v2/post/publish/video/init/",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: {
          post_info: { title: slot.description.slice(0, 150), privacy_level: "SELF_ONLY", disable_comment: false, is_aigc: true },
          source_info: { source: "FILE_UPLOAD", video_size: file.bytes, chunk_size: file.bytes, total_chunk_count: 1 },
        },
      },
      {
        method: "PUT",
        url: "<upload_url from init response>",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(file.bytes), "Content-Range": `bytes 0-${file.bytes - 1}/${file.bytes}` },
        body: { media, range: [0, file.bytes - 1] },
      },
    ];
  return [
    {
      method: "POST",
      url: "https://graph.facebook.com/v21.0/<ig-user-id>/media",
      headers: { "Content-Type": "application/json" },
      body: { media_type: "REELS", video_url: "<resumable upload url>", caption: slot.description, share_to_feed: true },
    },
    {
      method: "POST",
      url: "https://graph.facebook.com/v21.0/<ig-user-id>/media_publish",
      headers: { "Content-Type": "application/json" },
      body: { creation_id: "<container id from the previous response>" },
    },
  ];
}

/* ── the whole thing ─────────────────────────────────────────────────────── */

export function generate(): string {
  // wipe only what this generator owns, so a re-run does not stack files
  for (const d of ["publish", "music-video-exports", "ad-exports"]) rmSync(outFile(d), { recursive: true, force: true });

  // exports
  const files = new Map<string, { path: string; name: string; bytes: number; sha: string; created: number }>();
  const stamp: { file: string; ms: number }[] = [];
  EXPORTS.forEach((e, i) => {
    const dir = outFile(e.root === "mv" ? "music-video-exports" : "ad-exports");
    const buf = mp4Skeleton(`mp4-${e.id}`, 48 + ((i * 37) % 80));
    const file = path.join(dir, `${e.id}.mp4`);
    writeBytes(file, buf);
    writeJson(path.join(dir, `${e.id}.json`), { projectId: e.projectId });
    if (e.captions) writeBytes(path.join(dir, `${e.id}.${e.captions}`), e.captions === "srt" ? srt() : vtt());
    const created = NOW - e.ageDays * DAY;
    files.set(e.id, { path: file, name: `${e.id}.mp4`, bytes: buf.length, sha: sha256(buf), created });
    stamp.push({ file, ms: created }, { file: path.join(dir, `${e.id}.json`), ms: created });
  });
  for (const s of stamp) utimesSync(s.file, new Date(s.ms), new Date(s.ms));
  backdateCreation(stamp);

  // slots, publications, plans, sessions
  const slots: ScheduleSlot[] = [];
  const publications: Publication[] = [];
  const claims: Record<string, { pid: number; at: string }> = {};
  const live: { pubId: string; at: number }[] = [];
  let sessionsWritten = 0;
  let plans = 0;

  for (const row of ROWS) {
    const e = EXPORTS[row.exp];
    const id = `sl-${r.hex(8)}`;
    const title = row.title ?? e.title;
    const tags = row.ch === "youtube" ? e.tags : e.tags.slice(0, row.ch === "tiktok" ? 3 : 5);
    const created = Math.max(files.get(e.id)!.created + HOUR, row.when - (row.leadDays ?? r.int(2, 9)) * DAY);
    const slot: ScheduleSlot = {
      id,
      projectId: e.projectId,
      exportId: e.id,
      channelId: row.ch,
      publishAt: new Date(row.when).toISOString(),
      status: row.status,
      title,
      description: descOf(e, row.ch),
      tags,
      publicationId: null,
      error: row.error ?? null,
      createdAt: new Date(Math.min(created, NOW - HOUR)).toISOString(),
      missedAt: null,
    };
    if (row.missed) slot.missedAt = new Date(row.when + 61 * MIN + r.int(0, 20) * MIN).toISOString();

    if (row.status === "publishing") claims[id] = { pid: ALIVE_PID, at: iso(-2 * MIN) };

    if (row.status === "published") {
      const pub: Publication = {
        id: `pub-${r.hex(8)}`,
        slotId: id,
        channelId: row.ch,
        platformVideoId: row.live ? platformId() : null,
        visibility: "private",
        dry: !row.live,
        publishedAt: new Date(row.when + r.int(4, 40) * 1000).toISOString(),
      };
      slot.publicationId = pub.id;
      publications.push(pub);
      if (row.live) live.push({ pubId: pub.id, at: Date.parse(pub.publishedAt) });
      else {
        const f = files.get(e.id)!;
        const dryId = `dry-${createHash("sha256").update([f.sha, title].join("\n")).digest("hex").slice(0, 8)}`;
        writeJson(path.join(outFile("publish", "plans"), `${id}.json`), {
          mode: "dry",
          writtenAt: pub.publishedAt,
          slot: { ...slot, status: "publishing", publicationId: null },
          export: { id: e.id, path: f.path, bytes: f.bytes, sha256: f.sha },
          captions: e.captions ? path.join(path.dirname(f.path), `${e.id}.${e.captions}`) : null,
          dryVideoId: dryId,
          publicationId: pub.id,
          requests: planRequests(slot, { name: f.name, bytes: f.bytes, sha: f.sha }),
        });
        plans++;
      }
    }

    // the one failed live upload that kept its resumable session
    if (row.error === YT_CHUNK) {
      const f = files.get(e.id)!;
      writeJson(path.join(outFile("publish", "sessions"), `${id}.json`), {
        sessionUri: `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=AFiumC${r.hex(40)}`,
        sha256: f.sha,
      });
      sessionsWritten++;
    }
    slots.push(slot);
  }

  // metrics: live publications only
  const profiles: Profile[] = ["analytics", "analytics", "statistics", "partial", "withheld", "withheld", "none"];
  const finals = [48_200, 31_900, 12_400, 8_700, 0, 0, 0];
  const durs = [41, 37, 0, 29, 0, 0, 0];
  const snapshots: MetricSnapshot[] = live.flatMap((l, i) => snapshotsFor(l.pubId, l.at, profiles[i], finals[i], durs[i]));

  writeJson(outFile("publish", "schedule.json"), { version: 1, slots: slots.sort((a, b) => a.publishAt.localeCompare(b.publishAt)), claims });
  writeJson(outFile("publish", "publications.json"), { version: 1, publications });
  writeJson(outFile("publish", "metrics.json"), { version: 1, snapshots });

  const by = (s: SlotStatus) => slots.filter((x) => x.status === s).length;
  return `${slots.length} slots (${by("scheduled")} scheduled, ${by("published")} published, ${by("failed")} failed, ${by("missed")} missed, ${by("cancelled")} cancelled, ${by("publishing")} publishing), ${publications.length} publications (${live.length} live), ${snapshots.length} snapshots, ${plans} plans, ${sessionsWritten} session, ${EXPORTS.length} exports`;
}

/** The exports lister reads file BIRTH time where the filesystem keeps one, and
 *  fs.utimes cannot move it (NTFS and ext4 both pin it to the write). On Windows
 *  it is set through the shell; elsewhere the mtime stands, and a filesystem
 *  with a birth time will list every export as created today. */
function backdateCreation(items: { file: string; ms: number }[]): void {
  if (process.platform !== "win32") return;
  const script = items.map((i) => `$f=Get-Item -LiteralPath '${i.file.replace(/'/g, "''")}'; $f.CreationTime=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.round(i.ms)}).LocalDateTime`).join("; ");
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
  } catch {
    /* listing still works; the dates just read as generation day */
  }
}
