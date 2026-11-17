// WHAT EACH STEP READS AS (variant "focus"): the step's values as label / value rows for the quiet read (./Read.tsx).
// Pure: a row is a label of one to three words and a value as the field holds it; a blank stays a blank; counts are
// numbers; a long list (credits, lyrics, slots, stores) is a count whose row opens the list.
import { CHANNEL_NAMES, releaseKind, type ChannelRow, type Release } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { plannedSlots } from "../../../../../_release/draft.ts";
import { clock, db, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY } from "../../../../../_release/wizard/status.ts";
import type { StepId } from "../../../../../_release/wizard/steps.ts";
import type { ReadGroup, ReadRow } from "./Read.tsx";

/** What a row can open: the step's editor, or one of the long reads behind it. */
export type Sheet = "details" | "edit" | "shelf" | "slots" | "previews" | "splits";

export interface RowCtx {
  readonly release: Release;
  readonly read: ReleaseRead;
  readonly track: number;
  readonly problems: readonly ReleaseProblem[];
  readonly pending: readonly ReleaseProposal[];
  readonly open: (sheet: Sheet, track?: number) => void;
}

const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;
const yes = (v: boolean, a: string, b: string): string => (v ? a : b);

function tracks({ release: r, read, open }: RowCtx): ReadGroup[] {
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId)).length;
  const rows: ReadRow[] = r.tracks.map((t, i) => {
    const take = read.shelf.find((x) => x.takeId === t.takeId);
    const facts = [t.title.trim() === "" ? "untitled" : t.title, clock(t.durationS), take === undefined || take.lufs === null ? null : `${db(take.lufs)} LUFS`, t.audioHref === null ? "no audio" : null];
    return { key: `track:${i + 1}`, label: `track ${i + 1}`, value: facts.filter((x) => x !== null).join(" · "), open: () => open("edit", i) };
  });
  return [
    { key: "tracks", label: "On the release", rows: rows.length === 0 ? [{ key: "tracks", label: "tracks", value: null, open: () => open("shelf") }] : rows },
    { key: "shelf", label: "Shelf", rows: [{ key: "shelf", label: "kept takes", value: String(rest), open: () => open("shelf") }] },
  ];
}

function details({ release: r, open }: RowCtx): ReadGroup[] {
  const people: ReadRow[] =
    r.tracks.length === 1 && r.tracks[0] !== undefined
      ? [
          { key: "people:1", label: "songwriters", value: r.tracks[0].songwriters.filter((w) => w.trim() !== "").join(", "), open: () => open("edit", 0) },
          { key: "credits", label: "credits", value: String(r.tracks[0].credits.length), open: () => open("edit", 0) },
          { key: "lyrics", label: "lyrics", value: r.tracks[0].lyrics === null ? null : n(r.tracks[0].lyrics.split("\n").filter((l) => l.trim() !== "").length, "line", "lines"), open: () => open("edit", 0) },
        ]
      : r.tracks.map((t, i) => ({
          key: `people:${i + 1}`,
          label: `track ${i + 1}`,
          value: [t.songwriters.filter((w) => w.trim() !== "").join(", ") || "—", n(t.credits.length, "credit", "credits"), t.lyrics === null ? "no lyrics" : "lyrics"].join(" · "),
          open: () => open("edit", i),
        }));
  return [
    {
      key: "release",
      label: "Release",
      rows: [
        { key: "title", label: "title", value: r.title },
        { key: "version", label: "version", value: r.version },
        { key: "artist", label: "artist", value: r.artist },
        { key: "label", label: "label", value: r.label },
        { key: "releaseDate", label: "release date", value: r.releaseDate === null ? null : day(r.releaseDate) },
        { key: "language", label: "language", value: r.language },
        { key: "genre", label: "genre", value: r.genre.primary },
        { key: "genre2", label: "secondary genre", value: r.genre.secondary },
        { key: "upc", label: "UPC", value: r.upc },
      ],
    },
    { key: "people", label: "People", rows: people },
  ];
}

function rights({ release: r, track }: RowCtx): ReadGroup[] {
  const t = r.tracks[track];
  if (t === undefined) return [{ key: "ai", rows: [{ key: "tracks", label: "tracks", value: null }] }];
  const ai: ReadRow[] = [
    { key: "lyrics", label: "lyrics", value: yes(t.ai.lyrics, "AI", "human") },
    { key: "music", label: "music", value: yes(t.ai.music, "AI", "human") },
    { key: "audio", label: "AI audio", value: t.ai.audio },
    ...(t.ai.audio === "all" ? [{ key: "persona", label: "artist is", value: t.ai.persona === null ? null : t.ai.persona === "ai" ? "AI persona" : "human" }] : []),
  ];
  const x = t.rights;
  return [
    { key: "ai", label: "AI credits", rows: ai },
    {
      key: "rights",
      label: "Rights record",
      rows: [
        { key: "vendor", label: "generator", value: x.vendor },
        { key: "model", label: "model", value: x.model },
        { key: "planTier", label: "plan tier", value: x.planTier },
        { key: "generatedAt", label: "generated", value: x.generatedAt },
        { key: "briefDigest", label: "brief digest", value: x.briefDigest },
        { key: "reference", label: "reference", value: x.reference },
        { key: "licence", label: "licence", value: x.licence === "cc-by-nc" ? "CC BY-NC" : x.licence },
      ],
    },
  ];
}

function sleeve({ release: r, open }: RowCtx): ReadGroup[] {
  const v = r.sleeve;
  return [
    {
      key: "sleeve",
      rows: [
        { key: "sleeve", label: "source", value: v?.source ?? null },
        { key: "size", label: "size", value: v === null ? null : `${v.widthPx} × ${v.heightPx}` },
        { key: "rgb", label: "colour", value: v === null ? null : yes(v.rgb, "RGB", "not RGB") },
        { key: "sleevePrompt", label: "prompt", value: r.sleevePrompt, open: () => open("edit") },
      ],
    },
  ];
}

function channels({ release: r, read, open }: RowCtx): ReadGroup[] {
  const direct = read.channels.filter((c) => c.kind === "direct");
  const stores = read.channels.filter((c) => c.kind === "dsp");
  const states = [...new Set(stores.map((c) => CHANNEL_ENTRY[c.state].label))];
  const on = (c: ChannelRow) => (r.channels as readonly string[]).includes(c.id);
  return [
    {
      key: "channels",
      label: "Direct",
      rows: direct.map((c) => ({ key: c.id, label: CHANNEL_NAMES[c.id], value: on(c) ? `on · ${CHANNEL_ENTRY[c.state].label}` : null, open: () => open("edit") })),
    },
    { key: "stores", label: "Stores", rows: [{ key: "stores", label: "stores", value: `${stores.length} · ${states.join(", ")}`, open: () => open("edit") }] },
  ];
}

function extras({ release: r, open }: RowCtx): ReadGroup[] {
  const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
  const splits = r.splits.length > 0;
  return [
    {
      key: "previews",
      label: "Previews",
      rows: [
        { key: "link", label: "smart link", value: n(r.channels.length, "door", "doors"), open: () => open("previews") },
        { key: "canvas", label: "canvas", value: "9:16 · 8 s", open: () => open("previews") },
        { key: "promo", label: "promo cards", value: "1:1 · 9:16", open: () => open("previews") },
      ],
    },
    {
      key: "splits",
      label: "Splits",
      rows: [
        { key: "splitRows", label: "rows", value: splits ? String(r.splits.length) : null, open: () => open("splits") },
        { key: "sum", label: "sum", value: splits ? `${sum}%` : null, open: () => open("splits") },
      ],
    },
  ];
}

function review({ release: r, read, problems, pending, open }: RowCtx): ReadGroup[] {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  const slots = plannedSlots(r, read.channels).length;
  const blocks = problems.filter((p) => p.severity === "block").length;
  return [
    {
      key: "release",
      rows: [
        { key: "title", label: "title", value: r.version === null ? r.title : `${r.title} (${r.version})` },
        { key: "artist", label: "artist", value: r.artist },
        { key: "kind", label: "kind", value: `${KIND_LABEL[releaseKind(r.tracks)]} · ${n(r.tracks.length, "track", "tracks")} · ${clock(total)}` },
        { key: "releaseDate", label: "date", value: r.releaseDate === null ? "when processed" : day(r.releaseDate) },
        { key: "genre", label: "genre", value: [r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ") },
        { key: "upc", label: "UPC", value: r.upc },
        { key: "slots", label: "calendar", value: n(slots, "slot", "slots"), open: () => open("slots") },
      ],
    },
    {
      key: "open",
      rows: [
        { key: "blocks", label: "blocks", value: String(blocks), open: () => open("details") },
        { key: "warns", label: "warnings", value: String(problems.length - blocks), open: () => open("details") },
        { key: "pending", label: "suggestions", value: String(pending.length), open: () => open("details") },
      ],
    },
  ];
}

export const ROWS: Readonly<Record<StepId, (c: RowCtx) => ReadGroup[]>> = { tracks, details, rights, sleeve, channels, extras, review };
