// THE AUDIO DESK'S SECTIONS AND KIND, as data (Phase 6, L60). The owner's ruling folds every v1
// Sound lab tool into /audio; the desk is one page whose sections are rows of this table, so a
// later wave adds Hunt, Lessons, Strengths and Batch as rows - a section, its component in
// ../page.tsx's switch - without rewriting the ones here. The section and the kind live in the
// URL (`/audio?s=arrange&kind=sfx`), so a link, a reload and the back button carry them.
//
// The kind seam is v1 PlaygroundView's music | sfx KindSwitch: every section reads ONE kind at a
// time, because a song and an effect have different rows (genre groups vs sfx categories),
// different rubrics and different engines.

export const SECTIONS = [
  { id: "compose", label: "compose" },
  { id: "arrange", label: "arrange" },
  { id: "hunt", label: "hunt" },
  { id: "lessons", label: "lessons" },
  { id: "strengths", label: "strengths" },
  { id: "rubric", label: "rubric" },
  { id: "batch", label: "batch" },
  // spark audio-agent-studio: an outside agent drives a studio for non-musicians (../studio/).
  { id: "studio", label: "studio" },
] as const;
export type Section = (typeof SECTIONS)[number]["id"];

export const KINDS = ["music", "sfx"] as const;
export type Kind = (typeof KINDS)[number];

export type DeskUrl = { readonly section: Section; readonly kind: Kind };

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

/** An unknown section or kind reads as the default, never a 404: an old link still lands. */
export function parseDeskUrl(q: Readonly<Record<string, string | readonly string[] | undefined>>): DeskUrl {
  const s = one(q["s"]);
  const k = one(q["kind"]);
  return { section: SECTIONS.find((x) => x.id === s)?.id ?? "compose", kind: KINDS.find((x) => x === k) ?? "music" };
}

export function deskHref(u: DeskUrl): string {
  const p = new URLSearchParams();
  if (u.section !== "compose") p.set("s", u.section);
  if (u.kind !== "music") p.set("kind", u.kind);
  const q = p.toString();
  return q === "" ? "/audio" : `/audio?${q}`;
}
