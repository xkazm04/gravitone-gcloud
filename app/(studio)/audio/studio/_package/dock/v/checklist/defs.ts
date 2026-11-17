// THE CHECKLIST'S ITEMS PER STEP (prototype dock-package, round 2, variant "checklist"): each step of the walk as
// three to seven field groups. Details and AI & rights are definitions over fields (./model.ts builds them); the
// tracks, channels, extras and review rows are the release's own lists. Pure: the stage calls `itemsOf` each render.
import { CHANNEL_NAMES, type Licence, type Release, type ReleaseTrack } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import type { ReleaseRead } from "../../../../../_release/_port/port.ts";
import { plannedSlots } from "../../../../../_release/draft.ts";
import { clock, day } from "../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { STEP_LABEL, stepOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import { BLANK, buildItem, markOf, type Item, type ItemDef } from "./model.ts";

const LICENCE_LABEL: Readonly<Record<Licence, string>> = { commercial: "commercial", "cc-by-nc": "CC BY-NC", unknown: "unknown" };
const or = (v: string | null | undefined): string => (v === null || v === undefined || v.trim() === "" ? BLANK : v);
const tr = (r: Release, i: number): ReleaseTrack | undefined => r.tracks[i];

const DETAILS: readonly ItemDef[] = [
  { id: "title", label: "Title", editor: "title", scope: "release", codes: ["title-missing", "title-has-feat", "title-has-version", "title-all-caps"], pick: (r) => [r.title, r.version], show: (r) => (r.version === null ? or(r.title) : `${or(r.title)} · ${r.version}`) },
  { id: "artist", label: "Artist", editor: "artist", scope: "release", codes: ["artist-missing"], pick: (r) => [r.artist, r.label], show: (r) => (r.label === null ? or(r.artist) : `${or(r.artist)} · ${r.label}`) },
  { id: "genre", label: "Genre", editor: "genre", scope: "release", codes: ["genre-missing"], pick: (r) => r.genre, show: (r) => (r.genre.secondary === null ? or(r.genre.primary) : `${or(r.genre.primary)} / ${r.genre.secondary}`) },
  { id: "date", label: "Date & codes", editor: "date", scope: "release", codes: ["release-date-malformed", "upc-malformed"], pick: (r) => [r.releaseDate, r.language, r.upc], show: (r) => [r.releaseDate === null ? "when processed" : day(r.releaseDate), or(r.language), ...(r.upc === null ? [] : [r.upc])].join(" · ") },
  { id: "songwriters", label: "Songwriters", editor: "songwriters", scope: "tracks", codes: ["songwriter-missing", "songwriter-not-full-name"], pick: (r, i) => tr(r, i)?.songwriters, show: (r, i) => or(tr(r, i)?.songwriters.filter((w) => w.trim() !== "").join(", ")) },
  { id: "credits", label: "Credits", editor: "credits", scope: "tracks", codes: [], pick: (r, i) => tr(r, i)?.credits, show: (r, i) => or(tr(r, i)?.credits.map((c) => `${c.name} (${c.role})`).join(", ")) },
  { id: "lyrics", label: "Lyrics", editor: "lyrics", scope: "tracks", codes: [], pick: (r, i) => tr(r, i)?.lyrics, show: (r, i) => {
    const l = tr(r, i)?.lyrics ?? null;
    return l === null ? BLANK : `${l.split("\n").filter((x) => x.trim() !== "").length} lines`;
  } },
];

const aiShow = (t: ReleaseTrack | undefined): string => (t === undefined ? BLANK : [t.ai.lyrics ? "AI lyrics" : "own lyrics", t.ai.music ? "AI music" : "own music", `AI audio ${t.ai.audio}`].join(" · "));
const personaShow = (t: ReleaseTrack | undefined): string => (t === undefined || t.ai.audio !== "all" ? BLANK : t.ai.persona === null ? "unstated" : t.ai.persona === "ai" ? "AI persona" : "human");

const RIGHTS: readonly ItemDef[] = [
  { id: "ai", label: "AI credits", editor: "ai", scope: "tracks", codes: [], pick: (r, i) => { const a = tr(r, i)?.ai; return a === undefined ? null : [a.lyrics, a.music, a.audio]; }, show: (r, i) => aiShow(tr(r, i)) },
  { id: "persona", label: "Persona", editor: "persona", scope: "tracks", codes: ["persona-unstated"], verb: "State", pick: (r, i) => tr(r, i)?.ai.persona, show: (r, i) => personaShow(tr(r, i)) },
  { id: "licence", label: "Licence", editor: "licence", scope: "tracks", codes: ["rights-nc-licence", "rights-unknown-licence"], pick: (r, i) => tr(r, i)?.rights.licence, show: (r, i) => { const t = tr(r, i); return t === undefined ? BLANK : LICENCE_LABEL[t.rights.licence]; } },
  { id: "tier", label: "Plan tier", editor: "tier", scope: "tracks", codes: ["rights-unknown-tier"], pick: (r, i) => tr(r, i)?.rights.planTier, show: (r, i) => or(tr(r, i)?.rights.planTier) },
  { id: "generator", label: "Generator", editor: "generator", scope: "tracks", codes: ["rights-unknown-vendor"], pick: (r, i) => [tr(r, i)?.rights.vendor, tr(r, i)?.rights.model], show: (r, i) => or([tr(r, i)?.rights.vendor, tr(r, i)?.rights.model].filter((x) => x !== null && x !== undefined).join(" ")) },
  { id: "provenance", label: "Provenance", editor: "provenance", scope: "tracks", codes: [], pick: (r, i) => { const x = tr(r, i)?.rights; return x === undefined ? null : [x.generatedAt, x.briefDigest, x.reference]; }, show: (r, i) => { const g = tr(r, i)?.rights.generatedAt ?? null; return g === null ? BLANK : day(g); } },
];

const SLEEVE: readonly ItemDef[] = [
  { id: "cover", label: "Cover art", editor: "sleeve", scope: "release", codes: ["sleeve-missing"], verb: "Make", pick: (r) => r.sleeve, show: (r) => (r.sleeve === null ? BLANK : { generated: "generated", upload: "upload", "mv-look": "MV look" }[r.sleeve.source]) },
  { id: "size", label: "Size", editor: "sleeve", scope: "release", codes: ["sleeve-not-square", "sleeve-too-small"], pick: (r) => (r.sleeve === null ? null : [r.sleeve.widthPx, r.sleeve.heightPx]), show: (r) => (r.sleeve === null ? BLANK : `${r.sleeve.widthPx} × ${r.sleeve.heightPx}`) },
  { id: "colour", label: "Colour", editor: "sleeve", scope: "release", codes: ["sleeve-not-rgb"], pick: (r) => r.sleeve?.rgb ?? null, show: (r) => (r.sleeve === null ? BLANK : r.sleeve.rgb ? "RGB" : "not RGB") },
  { id: "prompt", label: "Prompt", editor: "prompt", scope: "release", codes: [], pick: (r) => r.sleevePrompt, show: (r) => or(r.sleevePrompt) },
];

const trackDef = (i: number): ItemDef => ({
  id: `track-${i}`,
  label: "",
  editor: "track",
  scope: i,
  codes: ["title-missing", "title-has-feat", "title-has-version", "title-all-caps", "isrc-malformed"],
  pick: (r) => { const t = tr(r, i); return t === undefined ? null : [t.title, t.version, t.isrc, t.explicit]; },
  show: (r) => { const t = tr(r, i); return t === undefined ? BLANK : [clock(t.durationS), ...(t.version === null ? [] : [t.version]), t.isrc ?? "no ISRC", ...(t.explicit ? ["explicit"] : [])].join(" · "); },
});

const plain = (id: string, label: string, value: string, mark: Item["mark"], editor: Item["editor"], extra?: Partial<Item>): Item => ({
  id, label, value, mark, editor, problems: [], pending: [], suggested: null, perTrack: false, track: null, ref: null, act: "open", verb: "Fix", ...extra,
});

function tracksItems(r: Release, read: ReleaseRead, problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[]): Item[] {
  const rows = r.tracks.map((t, i) => ({ ...buildItem(trackDef(i), r, problems, pending), label: `${i + 1}  ${or(t.title) === BLANK ? "untitled" : t.title}` }));
  const onRelease = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !onRelease.has(t.takeId)).length;
  const none = problems.filter((p) => p.code === "no-tracks");
  return [...rows, plain("shelf", "Shelf", `${rest} takes`, none.length > 0 ? "need" : "idle", "shelf", { problems: none, verb: "Add" })];
}

function channelItems(r: Release, read: ReleaseRead, problems: readonly ReleaseProblem[]): Item[] {
  const direct = read.channels.filter((c) => c.kind === "direct");
  const none = problems.filter((p) => p.code === "no-channel");
  // The block sits on the one channel best placed to clear it: the readiest.
  const order = ["ready", "dry", "not-wired", "not-reachable"];
  const best = [...direct].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))[0]?.id;
  const rows = direct.map((c) => {
    const on = (r.channels as readonly string[]).includes(c.id);
    const own = c.id === best ? none : [];
    return plain(`ch-${c.id}`, CHANNEL_NAMES[c.id], on ? `picked · ${CHANNEL_ENTRY[c.state].label}` : CHANNEL_ENTRY[c.state].label, own.length > 0 ? "need" : on ? "done" : "idle", "channel", { problems: own, ref: c.id, act: own.length > 0 ? "pick" : "open", verb: "Pick" });
  });
  const dsps = read.channels.filter((c) => c.kind === "dsp");
  return [...rows, plain("stores", "Stores", `0 / ${dsps.length}`, "idle", "stores")];
}

function extrasItems(r: Release, problems: readonly ReleaseProblem[]): Item[] {
  const art = r.sleeve !== null && r.sleeve.href !== null;
  const split = problems.filter((p) => p.code === "splits-not-100");
  const sum = r.splits.reduce((a, x) => a + x.share, 0);
  return [
    plain("link", "Smart link", `${r.channels.length} doors`, r.channels.length > 0 ? "done" : "idle", "previews"),
    plain("canvas", "Canvas", art ? "9:16 · 8 s" : BLANK, art ? "done" : "idle", "previews"),
    plain("promo", "Promo cards", art ? "1:1 · 9:16" : BLANK, art ? "done" : "idle", "previews"),
    plain("splits", "Splits", r.splits.length === 0 ? BLANK : `${r.splits.length} · ${sum}%`, markOf(split, 0, r.splits.length === 0 ? BLANK : "x"), "splits", { problems: split }),
  ];
}

function reviewItems(r: Release, read: ReleaseRead, problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[]): Item[] {
  const blocks = problems.filter((p) => p.severity === "block");
  const warns = problems.filter((p) => p.severity === "warn");
  const slots = plannedSlots(r, read.channels);
  const scheduled = r.status === "scheduled" || r.status === "published";
  const first = blocks[0];
  return [
    plain("blocks", "Blocks", String(blocks.length), blocks.length > 0 ? "need" : "done", "blocks", { problems: blocks, act: "go", verb: first === undefined ? "Fix" : `Fix · ${STEP_LABEL[stepOf(first)]}` }),
    plain("suggestions", "Suggestions", String(pending.length), pending.length > 0 ? "agent" : "done", "suggestions", { pending, act: "accept", verb: "Accept all" }),
    plain("warnings", "Warnings", String(warns.length), warns.length > 0 ? "warn" : "done", "warnings", { problems: warns }),
    plain("slots", "Calendar slots", String(slots.length), slots.length > 0 ? "done" : "idle", "slots"),
    plain("schedule", "Schedule", `${STATUS_ENTRY[r.status].label} · ${r.releaseDate === null ? "when processed" : day(r.releaseDate)}`, scheduled ? "done" : blocks.length === 0 ? "todo" : "idle", "schedule", { act: "schedule", verb: "Schedule" }),
  ];
}

export function itemsOf(step: StepId, r: Release, read: ReleaseRead, problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[]): Item[] {
  const build = (defs: readonly ItemDef[]) => defs.map((d) => buildItem(d, r, problems, pending));
  switch (step) {
    case "tracks":
      return tracksItems(r, read, problems, pending);
    case "details":
      return build(DETAILS);
    case "rights":
      return r.tracks.length === 0 ? [] : build(RIGHTS);
    case "sleeve":
      return build(SLEEVE);
    case "channels":
      return channelItems(r, read, problems);
    case "extras":
      return extrasItems(r, problems);
    case "review":
      return reviewItems(r, read, problems, pending);
  }
}
