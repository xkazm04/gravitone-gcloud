// THE STUDIO'S NAVIGATION TREE, FROM THE ADDRESS (design baseline, docs/next/design-baseline/PLAN.md §1a, §2).
//
//   section   the app's places (./nav.ts SECTIONS)                       /audio
//   room      the open section's own rooms (the audio desk's ten)        ?s=arrange
//   stage     the open room's walk (the studio: make, package, release)  &stage=package
//   kind      the room's filter where it reads one kind at a time        &kind=sfx
//
// One pure function per level, every current item derived from the URL and never held, so the spine, a route's
// context column and the jump dialog cannot disagree about where the operator is. What the address cannot say - a
// room's tally - is handed in by the page that read it. A section with rooms registers them here as data.
import { deskHref, KINDS, parseDeskUrl, SECTIONS as DESK_ROOMS, type Section as DeskSection } from "../audio/_audio/desk.ts";
import { parseStudioUrl, STUDIO_STAGES, studioHref } from "../audio/studio/url.ts";

export type NavTally = { readonly value: number; readonly label: string };

export type NavItem = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
  readonly tally?: NavTally;
};

/** A route's context column: its rooms, the current room's stages (a numbered descent) and its kind switch. */
export type Rooms = {
  /** The column's name: the section it belongs to. */
  readonly title: string;
  readonly rooms: readonly NavItem[];
  /** null: the current room has no walk. */
  readonly stages: readonly NavItem[] | null;
  /** null: the current room reads no kind. */
  readonly kinds: readonly NavItem[] | null;
};

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

/** The audio desk's rooms that read one kind (music or sfx) at a time; the others have none. */
const KINDLESS: ReadonlySet<DeskSection> = new Set<DeskSection>(["compose", "cover", "songlab", "release"]);

/** /audio: the desk's ten rooms with their tallies, compose's three stages, the kind where a room reads one. */
export function audioRooms(q: Query, tallies: Readonly<Partial<Record<DeskSection, NavTally>>>): Rooms {
  const desk = parseDeskUrl(q);
  const rooms = DESK_ROOMS.map((x): NavItem => {
    const tally = tallies[x.id];
    return { id: x.id, label: x.label, href: deskHref({ ...desk, section: x.id }), current: desk.section === x.id, ...(tally !== undefined ? { tally } : {}) };
  });
  let stages: NavItem[] | null = null;
  if (desk.section === "compose") {
    const studio = parseStudioUrl(q);
    const at = studio.stage ?? "make";
    stages = STUDIO_STAGES.map((st) => ({ id: st, label: st, href: studioHref({ ...studio, stage: st }), current: at === st }));
  }
  const kinds = KINDLESS.has(desk.section) ? null : KINDS.map((k): NavItem => ({ id: k, label: k, href: deskHref({ ...desk, kind: k }), current: desk.kind === k }));
  return { title: "Audio", rooms, stages, kinds };
}
