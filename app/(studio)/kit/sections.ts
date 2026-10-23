// The kit's sections, in reading order (kit.js `SECTIONS`): one list the nav and the body both
// read, so a section cannot be in one and missing from the other. The prototype's Floor,
// Composition and Routes groups showed page compositions (RunRow, Pile, CullTile, the job
// bar, live Library and Ledger frames); those arrive with their phases and join the kit then.

export const SECTIONS = [
  { id: "colour", group: "Tokens", title: "Colour", sub: "tokens/source.json · ground · signal · roles" },
  { id: "type", group: "Tokens", title: "Type", sub: "--fs-* · floor 12px" },
  { id: "space", group: "Tokens", title: "Space · size · radii", sub: "--sp-* · --h-* · --r-*" },
  { id: "motion", group: "Tokens", title: "Motion", sub: "--ease · --dur-*" },
  { id: "frame", group: "Tokens", title: "Frame · layers", sub: "--hdr-h · --z-*" },
  { id: "signal", group: "Signal", title: "Chip · Tally · Source", sub: "chip · tally · source · ledger · channel" },
  { id: "keys", group: "Signal", title: "Keys · Hint · Ghost", sub: "KEYMAP · every mode" },
  { id: "evidence", group: "Signal", title: "Evidence", sub: "provenance · breaks · errors · facts" },
  { id: "status", group: "Signal", title: "Status", sub: "STATUS · machine → look → label" },
  { id: "controls", group: "Controls", title: "Buttons", sub: "tone · size · key · disabled" },
  { id: "inputs", group: "Controls", title: "Choices · fields", sub: "toggle · seg · field · facet · fold" },
  { id: "structure", group: "Structure", title: "Panels · headings · empty", sub: "panel · caps heading · empty" },
  { id: "runs", group: "Composition", title: "Runs", sub: "day-line · lane chip · load band · resource summary" },
  { id: "ledger", group: "Composition", title: "Ledger", sub: "time strip · event row · json · stale" },
  { id: "floor", group: "Composition", title: "Floor", sub: "lane · run · pile · shelf · calendar · month · header" },
  { id: "board", group: "Composition", title: "Board", sub: "sheet · rail · cull · pair · review · cut · consequence" },
  { id: "produce", group: "Composition", title: "Produce", sub: "composer · receipt · plan · compose · re-route · hold" },
  { id: "part", group: "Composition", title: "Part workspace", sub: "workspace · rail · verdict · part tabs" },
  { id: "audio", group: "Composition", title: "Audio", sub: "preview · prompt · measured · terms · composer · variations · drafts · references" },
  { id: "graph", group: "Composition", title: "Scout graph", sub: "stage graph · column head · node · share meter" },
  { id: "library", group: "Composition", title: "Library", sub: "rail · tile · row · detail · lineage · summary" },
  { id: "style", group: "Composition", title: "Style atelier", sub: "proof sheet · trial matrix · ratchet · slots · palette · evidence · plates" },
  { id: "contract", group: "Contract", title: "Style contract", sub: "docs/next/style-contract · each page's own words" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
