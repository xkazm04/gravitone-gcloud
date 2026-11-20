// THE AUDIO DESK'S SECTIONS AND KIND, as data (Phase 6, L60). The owner's ruling folds every v1
// Sound lab tool into /audio; the desk is one page whose sections are rows of this table, so a
// later wave adds Hunt, Lessons, Strengths and Batch as rows - a section, its component in
// ../page.tsx's switch - without rewriting the ones here. The section and the kind live in the
// URL (`/audio?s=arrange&kind=sfx`), so a link, a reload and the back button carry them.
//
// The kind seam is v1 PlaygroundView's music | sfx KindSwitch: every section reads ONE kind at a
// time, because a song and an effect have different rows (genre groups vs sfx categories),
// different rubrics and different engines.
//
// ORDER AND GROUPS (design baseline P4, 2026-11-17; owner: "In Audio there is no logical order ... leading into first
// overview page"): the desk opens on its overview - the conversation kept, a card per room - and the rooms follow
// the work's own order: make a sound (compose, cover, hunt), refine what was made (arrange, the song lab's knockout,
// the rubric), learn from it (strengths, lessons, a batch's spread), ship it (the releases). A label is the word
// the column and the card print; the group is the column's heading.
import type { RoomGlyphName } from "@gt/ui/components/glyph/RoomGlyph.tsx";

export const GROUPS = [
  { id: "make", label: "Make" },
  { id: "refine", label: "Refine" },
  { id: "learn", label: "Learn" },
  { id: "ship", label: "Ship" },
] as const;
export type Group = (typeof GROUPS)[number]["id"];

type Row = { readonly id: string; readonly label: string; readonly glyph: RoomGlyphName; readonly group: Group | null };

export const SECTIONS = [
  { id: "overview", label: "Overview", glyph: "overview", group: null },
  { id: "compose", label: "Compose", glyph: "compose", group: "make" },
  { id: "cover", label: "Cover", glyph: "cover", group: "make" },
  { id: "hunt", label: "Hunt", glyph: "hunt", group: "make" },
  { id: "arrange", label: "Arrange", glyph: "arrange", group: "refine" },
  // spark yue2-song-lab S2: the knockout (../_songlab/) - the agent seeds a bracket, the owner's ear judges it.
  { id: "songlab", label: "Song lab", glyph: "songlab", group: "refine" },
  { id: "rubric", label: "Rubric", glyph: "rubric", group: "refine" },
  { id: "strengths", label: "Strengths", glyph: "strengths", group: "learn" },
  { id: "lessons", label: "Lessons", glyph: "lessons", group: "learn" },
  { id: "batch", label: "Batch", glyph: "batch", group: "learn" },
  // spark audio-distribution S1: a release from kept takes - metadata, rights, sleeve, master, channels (../_release/).
  { id: "release", label: "Releases", glyph: "release", group: "ship" },
] as const satisfies readonly Row[];
export type Section = (typeof SECTIONS)[number]["id"];

export const KINDS = ["music", "sfx"] as const;
export type Kind = (typeof KINDS)[number];

export type DeskUrl = { readonly section: Section; readonly kind: Kind };

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

/** `?s=studio` (spark audio-agent-studio) is the compose section's alias: the studio IS compose now. */
const ALIASES: Readonly<Record<string, Section>> = { studio: "compose" };

/** An unknown section or kind reads as the default (the overview), never a 404: an old link still lands. */
export function parseDeskUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): DeskUrl {
  const raw = one(q["s"]);
  const s = raw === undefined ? undefined : (ALIASES[raw] ?? raw);
  const k = one(q["kind"]);
  return { section: SECTIONS.find((x) => x.id === s)?.id ?? "overview", kind: KINDS.find((x) => x === k) ?? "music" };
}

export function deskHref(u: DeskUrl): string {
  const p = new URLSearchParams();
  if (u.section !== "overview") p.set("s", u.section);
  if (u.kind !== "music") p.set("kind", u.kind);
  const q = p.toString();
  return q === "" ? "/audio" : `/audio?${q}`;
}
