// The kit's sections, in reading order (kit.js `SECTIONS`): one list the nav and the body both
// read, so a section cannot be in one and missing from the other. The prototype's Floor,
// Composition and Routes groups showed page compositions (RunRow, Pile, CullTile, the job
// bar, live Library and Ledger frames); each joined the kit with its phase, under Composition.
//
// THE GROUPS ARE PAGES (design baseline P4, 2026-11-17; owner: "Redesign the kit page to divide content into
// groups/subroutes instead of having one huge page. Sidebar menu should then include these groups only"): /kit is
// the tokens, /kit/<group> each other group, and the kit's context column lists the groups and nothing under
// them. A section's `group` is its page; the old one-page index (KitNav) retired with the one page.
import type { RoomGlyphName } from "@gt/ui/components/glyph/RoomGlyph.tsx";

export const KIT_GROUPS = [
  { id: "tokens", label: "Tokens", glyph: "tokens", shelf: "foundations" },
  { id: "signal", label: "Signal", glyph: "signal", shelf: "foundations" },
  { id: "controls", label: "Controls", glyph: "controls", shelf: "foundations" },
  { id: "structure", label: "Structure", glyph: "structure", shelf: "foundations" },
  { id: "operations", label: "Operations", glyph: "operations", shelf: "screens" },
  { id: "production", label: "Production", glyph: "production", shelf: "screens" },
  { id: "audio", label: "Audio", glyph: "wave", shelf: "screens" },
  { id: "library", label: "Library · Scout", glyph: "books", shelf: "screens" },
  { id: "contract", label: "Style contract", glyph: "contract", shelf: "screens" },
] as const satisfies readonly { readonly id: string; readonly label: string; readonly glyph: RoomGlyphName; readonly shelf: "foundations" | "screens" }[];
export type KitGroupId = (typeof KIT_GROUPS)[number]["id"];

/** /kit is the first group; every other group is /kit/<id>. */
export const kitHref = (g: KitGroupId): string => (g === "tokens" ? "/kit" : `/kit/${g}`);

export const SECTIONS = [
  { id: "colour", group: "tokens", title: "Colour", sub: "tokens/source.json · ground · signal · roles" },
  { id: "type", group: "tokens", title: "Type", sub: "--fs-* · floor 12px" },
  { id: "space", group: "tokens", title: "Space · size · radii", sub: "--sp-* · --h-* · --r-*" },
  { id: "motion", group: "tokens", title: "Motion", sub: "--ease · --dur-*" },
  { id: "frame", group: "tokens", title: "Frame · layers", sub: "--w-spine · --w-context · --z-*" },
  { id: "signal", group: "signal", title: "Chip · Tally · Source", sub: "chip · tally · source · ledger · channel" },
  { id: "keys", group: "signal", title: "Keys · Hint · Ghost", sub: "KEYMAP · every mode" },
  { id: "evidence", group: "signal", title: "Evidence", sub: "provenance · breaks · errors · facts" },
  { id: "status", group: "signal", title: "Status", sub: "STATUS · machine → look → label" },
  { id: "controls", group: "controls", title: "Buttons", sub: "tone · size · key · disabled" },
  { id: "inputs", group: "controls", title: "Choices · fields", sub: "toggle · seg · field · facet · fold" },
  { id: "structure", group: "structure", title: "Panels · headings · empty", sub: "panel · caps heading · empty" },
  { id: "runs", group: "operations", title: "Runs", sub: "day-line · lane chip · load band · resource summary" },
  { id: "ledger", group: "operations", title: "Ledger", sub: "time strip · event row · json · stale" },
  { id: "floor", group: "operations", title: "Floor", sub: "lane · run · pile · shelf · calendar · month · header" },
  { id: "board", group: "operations", title: "Board", sub: "sheet · rail · cull · pair · review · cut · consequence" },
  { id: "produce", group: "production", title: "Produce", sub: "composer · receipt · plan · compose · re-route · hold" },
  { id: "part", group: "production", title: "Part workspace", sub: "workspace · rail · verdict · part tabs" },
  { id: "timeline", group: "production", title: "Timeline", sub: "sections · beats · lyrics · takes · verdict · direction" },
  { id: "reels", group: "production", title: "Reels", sub: "filmstrip · loupe · playhead · pinned notes" },
  { id: "audio", group: "audio", title: "Audio", sub: "preview · prompt · measured · terms · composer · variations · drafts · references" },
  { id: "ear", group: "audio", title: "Steer by ear", sub: "ear button" },
  { id: "studio", group: "audio", title: "Audio studio", sub: "dock · verdict row · transport row · fader" },
  { id: "suno", group: "audio", title: "Suno advisor", sub: "prompt card · lineage · verdict row · taste · take facts" },
  { id: "songlab", group: "audio", title: "Song lab", sub: "bracket · blind match · director's band · draw tabs · queue · field" },
  { id: "graph", group: "library", title: "Scout graph", sub: "stage graph · column head · node · share meter" },
  { id: "library", group: "library", title: "Library", sub: "rail · tile · row · detail · lineage · summary" },
  { id: "style", group: "library", title: "Style atelier", sub: "proof sheet · trial matrix · ratchet · slots · palette · evidence · plates" },
  { id: "contract", group: "contract", title: "Style contract", sub: "docs/next/style-contract · each page's own words" },
] as const satisfies readonly { readonly id: string; readonly group: KitGroupId; readonly title: string; readonly sub: string }[];

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Where a section is drawn: its group's page and its anchor. */
export function sectionHref(id: SectionId): string {
  const s = SECTIONS.find((x) => x.id === id);
  return s === undefined ? "/kit" : `${kitHref(s.group)}#${id}`;
}
