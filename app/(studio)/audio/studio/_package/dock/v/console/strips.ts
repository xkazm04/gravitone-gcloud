// THE CONSOLE'S CHANNEL STRIPS (prototype dock-package, direction "console"): what each of the seven steps shows on
// its strip - its lamps (block / warn / incoming / clear), the level on its meter, its readouts, one lamp per track -
// derived from the release, its problems and the agent's pending proposals on every render. Pure; nothing here is
// stored, so an edit anywhere moves every strip at once (registry wizard-flows/progress-communication).
import { CHANNEL_NAMES, RELEASE_CHANNELS, SLEEVE_PX, type ChannelRow, type Release, type ReleaseChannelId } from "@gt/domain/release";
import { rightsWarnings, type ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../_release/pending.ts";
import { clock } from "../../../../../_release/wizard/fmt.ts";
import { problemsOf, problemsOnTrack, severityOf, type Severity, type StepId } from "../../../../../_release/wizard/steps.ts";

/** The light a strip, a meter or a lamp shows: the house signal hues, one meaning each. */
export type Level = "block" | "warn" | "clear";

export interface ReadoutRow {
  /** The field a press on the readout opens its editor at (`data-field` in the editor). */
  readonly field: string;
  readonly label: string;
  readonly value: string;
  /** A value that is missing or wrong is drawn in the level's hue. */
  readonly level?: Level;
}

export interface StripModel {
  readonly step: StepId;
  readonly sev: Severity;
  readonly level: Level;
  readonly incoming: readonly ReleaseProposal[];
  /** 0..1 - how much of the step is filled; its hue is `level`. */
  readonly meter: number;
  /** The meter's figure, as its readout prints it. */
  readonly meterText: string;
  readonly readouts: readonly ReadoutRow[];
  /** One lamp per track for a per-track step; empty for the release-wide ones. */
  readonly tracks: readonly Level[];
}

export const levelOf = (sev: Severity): Level => (sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : "clear");
const pct = (f: number): string => `${Math.round(f * 100)}%`;
const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const dash = (v: string | null): string => (v === null || v.trim() === "" ? "—" : v);

/** Two-letter marks for the arm lamps, the way a desk labels its buses. */
export const CHANNEL_MARK: Readonly<Record<ReleaseChannelId, string>> = { youtube: "YT", soundcloud: "SC", audius: "AU", mixcloud: "MX", archive: "IA" };

function trackLamps(r: Release, problems: readonly ReleaseProblem[], step: StepId): Level[] {
  return r.tracks.map((_, i) => levelOf(severityOf(problemsOnTrack(problems, step, i))));
}

function tracksStrip(r: Release, problems: readonly ReleaseProblem[]): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const n = r.tracks.length;
  const lamps = trackLamps(r, problems, "tracks");
  const isrc = r.tracks.filter((t) => t.isrc !== null).length;
  const audio = r.tracks.filter((t) => t.audioHref !== null).length;
  const clean = lamps.filter((l) => l === "clear").length;
  return {
    meter: ratio(clean, n),
    meterText: n === 0 ? "0" : `${clean}/${n}`,
    tracks: lamps,
    readouts: [
      { field: "list", label: "tracks", value: String(n), ...(n === 0 ? { level: "block" as const } : {}) },
      { field: "list", label: "length", value: clock(r.tracks.reduce((a, t) => a + t.durationS, 0)) },
      { field: "isrc", label: "ISRC", value: `${isrc}/${n}` },
      { field: "list", label: "audio", value: `${audio}/${n}`, ...(audio < n ? { level: "warn" as const } : {}) },
      { field: "explicit", label: "explicit", value: String(r.tracks.filter((t) => t.explicit).length) },
    ],
  };
}

const DETAIL_FIELDS = (r: Release): readonly boolean[] => [r.title.trim() !== "", r.artist.trim() !== "", r.genre.primary !== null, r.genre.secondary !== null, r.releaseDate !== null, r.label !== null, r.upc !== null, r.language.trim() !== ""];

function detailsStrip(r: Release, problems: readonly ReleaseProblem[]): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const writers = r.tracks.filter((t) => t.songwriters.some((w) => w.trim() !== "")).length;
  const filled = [...DETAIL_FIELDS(r), ...r.tracks.map((t) => t.songwriters.some((w) => w.trim() !== ""))];
  const f = ratio(filled.filter(Boolean).length, filled.length);
  return {
    meter: f,
    meterText: pct(f),
    tracks: trackLamps(r, problems, "details"),
    readouts: [
      { field: "title", label: "title", value: dash(r.title), ...(r.title.trim() === "" ? { level: "block" as const } : {}) },
      { field: "genre.primary", label: "genre", value: r.genre.primary === null ? "—" : r.genre.secondary === null ? r.genre.primary : `${r.genre.primary} / ${r.genre.secondary}`, ...(r.genre.primary === null ? { level: "block" as const } : {}) },
      { field: "releaseDate", label: "date", value: r.releaseDate ?? "on process" },
      { field: "upc", label: "UPC", value: dash(r.upc) },
      { field: "writers", label: "writers", value: `${writers}/${r.tracks.length}`, ...(writers < r.tracks.length ? { level: "block" as const } : {}) },
    ],
  };
}

function rightsStrip(r: Release, problems: readonly ReleaseProblem[]): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const n = r.tracks.length;
  const stated = r.tracks.filter((t) => t.ai.audio !== "all" || t.ai.persona !== null).length;
  const complete = r.tracks.filter((t) => rightsWarnings(t.rights).length === 0).length;
  const commercial = r.tracks.filter((t) => t.rights.licence === "commercial").length;
  const first = r.tracks[0];
  const gen = first === undefined || first.rights.vendor === null ? "—" : [first.rights.vendor, first.rights.model].filter((x) => x !== null).join(" ");
  const ok = r.tracks.filter((t) => (t.ai.audio !== "all" || t.ai.persona !== null) && rightsWarnings(t.rights).length === 0).length;
  return {
    meter: ratio(ok, n),
    meterText: `${ok}/${n}`,
    tracks: trackLamps(r, problems, "rights"),
    readouts: [
      { field: "persona", label: "persona", value: `${stated}/${n}`, ...(stated < n ? { level: "block" as const } : {}) },
      { field: "record", label: "record", value: `${complete}/${n}`, ...(complete < n ? { level: "warn" as const } : {}) },
      { field: "licence", label: "licence", value: `${commercial}/${n}`, ...(commercial < n ? { level: "warn" as const } : {}) },
      { field: "record", label: "generator", value: gen },
    ],
  };
}

const SOURCE_WORD = { generated: "generated", upload: "upload", "mv-look": "MV look" } as const;

function sleeveStrip(r: Release): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const sl = r.sleeve;
  const px = sl === null ? 0 : Math.min(sl.widthPx, sl.heightPx);
  return {
    meter: Math.min(1, px / SLEEVE_PX),
    meterText: sl === null ? "—" : `${px}`,
    tracks: [],
    readouts: [
      { field: "art", label: "size", value: sl === null ? "—" : sl.widthPx === sl.heightPx ? `${sl.widthPx}²` : `${sl.widthPx}×${sl.heightPx}`, ...(sl === null ? { level: "block" as const } : {}) },
      { field: "art", label: "source", value: sl === null ? "—" : SOURCE_WORD[sl.source] },
      { field: "prompt", label: "prompt", value: r.sleevePrompt === null ? "—" : "set" },
    ],
  };
}

function channelsStrip(r: Release, rows: readonly ChannelRow[]): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const direct = rows.filter((c) => c.kind === "direct");
  const ready = r.channels.filter((c) => rows.find((x) => x.id === c)?.state === "ready").length;
  const stores = rows.filter((c) => c.kind === "dsp");
  return {
    meter: ratio(r.channels.length, direct.length),
    meterText: `${r.channels.length}/${direct.length}`,
    tracks: [],
    readouts: [
      { field: "direct", label: "armed", value: `${r.channels.length}/${direct.length}`, ...(r.channels.length === 0 ? { level: "block" as const } : {}) },
      { field: "direct", label: "ready", value: `${ready}/${r.channels.length}` },
      { field: "stores", label: "stores", value: `${stores.filter((c) => c.state === "ready").length}/${stores.length}` },
    ],
  };
}

function extrasStrip(r: Release): Omit<StripModel, "step" | "sev" | "level" | "incoming"> {
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  return {
    meter: r.splits.length === 0 ? 0 : Math.min(1, sum / 100),
    meterText: r.splits.length === 0 ? "—" : `${sum}%`,
    tracks: [],
    readouts: [
      { field: "splits", label: "splits", value: r.splits.length === 0 ? "—" : `${sum}%`, ...(r.splits.length > 0 && sum !== 100 ? { level: "block" as const } : {}) },
      { field: "splits", label: "payees", value: String(r.splits.length) },
      { field: "previews", label: "doors", value: String(r.channels.length) },
    ],
  };
}

/** The six input strips, in walk order; the review is the master section. */
export function stripsOf(r: Release, problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[], rows: readonly ChannelRow[]): StripModel[] {
  const body: Record<Exclude<StepId, "review">, Omit<StripModel, "step" | "sev" | "level" | "incoming">> = {
    tracks: tracksStrip(r, problems),
    details: detailsStrip(r, problems),
    rights: rightsStrip(r, problems),
    sleeve: sleeveStrip(r),
    channels: channelsStrip(r, rows),
    extras: extrasStrip(r),
  };
  return (Object.keys(body) as Exclude<StepId, "review">[]).map((step) => {
    const sev = severityOf(problemsOf(problems, step));
    return { step, sev, level: levelOf(sev), incoming: pendingIn(pending, step), ...body[step] };
  });
}

/** The arm lamps on the channels strip: every direct channel, armed or not, and the server's state for it. */
export const armLamps = (r: Release, rows: readonly ChannelRow[]) =>
  RELEASE_CHANNELS.map((id) => ({ id, mark: CHANNEL_MARK[id], name: CHANNEL_NAMES[id], armed: r.channels.includes(id), state: rows.find((x) => x.id === id)?.state ?? "not-wired" }));
