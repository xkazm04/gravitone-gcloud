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
import type { RoomGlyphName } from "@gt/ui/components/glyph/RoomGlyph.tsx";

import { deskHref, GROUPS as DESK_GROUPS, KINDS, parseDeskUrl, SECTIONS as DESK_ROOMS, type Section as DeskSection } from "../audio/_audio/desk.ts";
import { parseStudioUrl, STUDIO_STAGES, studioHref } from "../audio/studio/url.ts";
import { KIT_GROUPS, kitHref, type KitGroupId } from "../kit/sections.ts";

export type NavTally = { readonly value: number; readonly label: string };

export type NavItem = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
  readonly tally?: NavTally;
  readonly glyph?: RoomGlyphName;
};

/** A run of rooms under one heading; the column's first run has none (the overview). */
export type NavGroupModel = { readonly id: string; readonly label: string | null; readonly items: readonly NavItem[] };

/** A route's context column: its rooms (flat, and as headed groups), the current room's stages and its kind switch. */
export type Rooms = {
  /** The column's name: the section it belongs to. */
  readonly title: string;
  readonly rooms: readonly NavItem[];
  readonly groups: readonly NavGroupModel[];
  /** null: the current room has no walk. */
  readonly stages: readonly NavItem[] | null;
  /** null: the current room reads no kind. */
  readonly kinds: readonly NavItem[] | null;
};

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

/** The audio desk's rooms that read one kind (music or sfx) at a time; the others have none. */
const KINDLESS: ReadonlySet<DeskSection> = new Set<DeskSection>(["overview", "compose", "cover", "songlab", "release"]);

/** /audio: the overview, then the desk's rooms in their groups with their tallies, compose's three stages, the kind
 *  where a room reads one. */
export function audioRooms(q: Query, tallies: Readonly<Partial<Record<DeskSection, NavTally>>>): Rooms {
  const desk = parseDeskUrl(q);
  const rooms = DESK_ROOMS.map((x): NavItem => {
    const tally = tallies[x.id];
    return { id: x.id, label: x.label, glyph: x.glyph, href: deskHref({ ...desk, section: x.id }), current: desk.section === x.id, ...(tally !== undefined ? { tally } : {}) };
  });
  const of = (group: string | null): NavItem[] => rooms.filter((r) => (DESK_ROOMS.find((x) => x.id === r.id)?.group ?? null) === group);
  const groups: NavGroupModel[] = [{ id: "top", label: null, items: of(null) }, ...DESK_GROUPS.map((g) => ({ id: g.id, label: g.label, items: of(g.id) }))];
  let stages: NavItem[] | null = null;
  if (desk.section === "compose") {
    const studio = parseStudioUrl(q);
    const at = studio.stage ?? "make";
    stages = STUDIO_STAGES.map((st) => ({ id: st, label: st.charAt(0).toUpperCase() + st.slice(1), href: studioHref({ ...studio, stage: st }), current: at === st }));
  }
  const kinds = KINDLESS.has(desk.section) ? null : KINDS.map((k): NavItem => ({ id: k, label: k, href: deskHref({ ...desk, kind: k }), current: desk.kind === k }));
  return { title: "Audio", rooms, groups, stages, kinds };
}

/** /kit: the kit's groups and nothing under them (each group is its own page, ../kit/sections.ts); foundations
 *  first, then the screens' compositions. */
export function kitRooms(current: KitGroupId): Rooms {
  const rooms = KIT_GROUPS.map((g): NavItem => ({ id: g.id, label: g.label, glyph: g.glyph, href: kitHref(g.id), current: g.id === current }));
  const shelf = (s: "foundations" | "screens"): NavItem[] => rooms.filter((r) => KIT_GROUPS.find((g) => g.id === r.id)?.shelf === s);
  return { title: "Kit", rooms, groups: [{ id: "foundations", label: "Foundations", items: shelf("foundations") }, { id: "screens", label: "Screens", items: shelf("screens") }], stages: null, kinds: null };
}

/** The Scout's rooms (/scout, /scout/canvas, /scout/runs[/packet], /scout/productions, /scout/ventures), the current one the
 *  pathname's; the Runs tally is the open scout packets the layout counted (undefined: the Board could not be read). */
export function scoutRooms(pathname: string, undecided: number | undefined): Rooms {
  const at = pathname.startsWith("/scout/canvas") ? "canvas" : pathname.startsWith("/scout/runs") ? "runs" : pathname.startsWith("/scout/productions") ? "productions" : pathname.startsWith("/scout/ventures") ? "ventures" : "graph";
  const rows: readonly (readonly [string, string, string, RoomGlyphName])[] = [
    ["graph", "Graph", "/scout", "graph"],
    // The map of the same graph (docs/scout-canvas-port.md), beside Graph until the owner promotes it.
    ["canvas", "Canvas", "/scout/canvas", "graph"],
    ["runs", "Runs", "/scout/runs", "runs"],
    ["productions", "Productions", "/scout/productions", "production"],
    ["ventures", "Ventures", "/scout/ventures", "ventures"],
  ];
  const rooms = rows.map(([id, label, href, glyph]): NavItem => ({ id, label, href, glyph, current: id === at, ...(id === "runs" && undecided !== undefined ? { tally: { value: undecided, label: "undecided" } } : {}) }));
  return { title: "Scout", rooms, groups: [{ id: "scout", label: null, items: rooms }], stages: null, kinds: null };
}
