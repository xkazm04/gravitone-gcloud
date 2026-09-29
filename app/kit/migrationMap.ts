// THE MIGRATION MAP — which kit parts each module of the app will need, and which
// the kit does not have yet. A data table, not prose: the /kit route renders it,
// the long-running sessions read it to know what exists before they build a local
// copy (which is a finding).
//
// MEASURED 2026-09-29 from the code (grep over app/ and components/, kit and
// foundry excluded): file counts, and the evidence column, are what the module
// contains today. `needs` names parts that exist (catalog.ts); `missing` names
// gaps below. Start of the gap list: Builder F's foundry inventory, extended by
// what the other modules turned out to contain.

import type { PartName } from "./catalog";

export interface Gap {
  id: string;
  name: string;
  /** What the kit would add, as a shape. */
  shape: string;
  /** Where it is first hit, from the code. */
  evidence: string;
}

export const GAPS = [
  {
    id: "account",
    name: "World-skinned NotificationBell, UserMenu",
    shape: "components/ui parts drawn in the Almanac skin; they sit in <Bar right>",
    evidence: "StudioFrame world=almanac mounts both; neither reads useWorld",
  },
  {
    id: "field",
    name: "Field, Segmented, select, textarea",
    shape: "components/ui/Field.tsx controls in the kit skin; kit has Text/Number/Check only",
    evidence: "<select in 5 files, Segmented in 5 (StudioView, PlaygroundView, ProjectDialog, LibraryAtelier, WithholdingPanel)",
  },
  {
    id: "callout",
    name: "Callout / quote",
    shape: "a claim with its source, ruled, in the work's voice",
    evidence: "FollowUpResult, GatePanel, EvidenceLog, ScoreSpotting each hand-roll one",
  },
  {
    id: "pager",
    name: "Pagination sentinel",
    shape: "a list that windows itself and says how much is beyond",
    evidence: "no list under app/ windows its rows; Library assets render whole",
  },
  {
    id: "table",
    name: "Sortable Table",
    shape: "DataTable with sortable heads and a sticky header",
    evidence: ".sort( in ProjectsMatrix, MatrixTracks, MatrixSpend, library/parts",
  },
  {
    id: "toast",
    name: "Toast tray",
    shape: "transient outcome of an action; the bell keeps the record",
    evidence: "no toast anywhere; NotificationBell is the only failure surface",
  },
  {
    id: "steps",
    name: "Studio steps rail",
    shape: "Research · Script · Frames · Score · Cut as marks with the current one ringed",
    evidence: "StudioView and StageRail draw it Obsidian; the door has it as a meridian",
  },
  {
    id: "roving",
    name: "Tile roving focus",
    shape: "one tab stop per grid, arrows move within it",
    evidence: "foundry binds window keydown; Library grids have none",
  },
  {
    id: "deck",
    name: "Deck, DeckCard, StageRail in the world",
    shape: "components/ui/deck read useWorld like Modal does",
    evidence: "ProjectsView, CreateWizard, GuidedResearch, RunStage import Deck",
  },
  {
    id: "menu",
    name: "Context menu, folder tree",
    shape: "a tree of named places and a right-click menu over its rows",
    evidence: "library/ContextMenu.tsx, FolderTree.tsx, MoveDialog.tsx",
  },
  {
    id: "layers",
    name: "Layer list with drag order",
    shape: "SideList rows that reorder",
    evidence: "frames/LayerPanel.tsx, FramesAssembly.tsx",
  },
  {
    id: "player",
    name: "Audio / video player, waveform",
    shape: "transport marks and a magnitude waveform in the world's line",
    evidence: "<audio in ScoreSpotting, PlaygroundView; <video in CutTimeline, components/ui/Clip",
  },
  {
    id: "timeline",
    name: "Timeline",
    shape: "tracks on a time axis with cues as marks",
    evidence: "cut/CutTimeline.tsx is the whole cut step",
  },
] as const satisfies readonly Gap[];

export type GapId = (typeof GAPS)[number]["id"];

export interface Module {
  module: string;
  path: string;
  /** Source files (.ts, .tsx) under the path, 2026-09-29. */
  files: number;
  /** Kit parts the module's current surfaces map to. */
  needs: readonly PartName[];
  missing: readonly GapId[];
  /** What in the module says so. */
  evidence: string;
}

export const MODULES: readonly Module[] = [
  {
    module: "Studio shell",
    path: "app/studio, app/_studio",
    files: 18,
    needs: ["Bar", "Crumbs", "TabRail", "Tally", "SideList", "SideItem", "StatusGlyph", "Sheet", "Ghost"],
    missing: ["account", "steps", "field", "toast"],
    evidence: "Segmented in StudioView; AssetDrawer is a drawer over the shelf",
  },
  {
    module: "Research",
    path: "app/_phases/research",
    files: 29,
    needs: ["Entry", "Chip", "Chips", "StatusPill", "Tally", "Hint", "Sheet", "Ghost", "ErrorBox", "Loading"],
    missing: ["deck", "field", "callout"],
    evidence: "Modal and Hint throughout; Deck in guided/*; FollowUpResult quotes a claim",
  },
  {
    module: "Script",
    path: "app/_phases/script",
    files: 44,
    needs: ["TabRail", "Matrix", "Scene", "Entry", "ScoreChip", "Chips", "Duo", "StackBar", "ConfirmDialog", "KeyRow"],
    missing: ["field", "table", "roving", "callout"],
    evidence: "role=tab in ScriptStep; <select in PresetSelect, PromiseLedger; .sort in _matrix",
  },
  {
    module: "Frames",
    path: "app/_phases/frames",
    files: 15,
    needs: ["Tile", "Plate", "VerdictKeys", "Sheet", "Figures", "StatusGlyph", "SideList", "SideItem"],
    missing: ["layers", "field", "roving"],
    evidence: "svg in frames/*; LayerPanel; <select in FramesAssembly",
  },
  {
    module: "Score",
    path: "app/_phases/score",
    files: 5,
    needs: ["SideList", "SideItem", "StatusGlyph", "Meridian", "Dock", "Count"],
    missing: ["player", "field", "callout"],
    evidence: "<audio in ScoreSpotting; <select in SpotList",
  },
  {
    module: "Cut",
    path: "app/_phases/cut",
    files: 1,
    needs: ["Dock", "Meridian", "StatusStrip", "Report", "OpenLink"],
    missing: ["timeline", "player"],
    evidence: "one file; <video in CutTimeline",
  },
  {
    module: "Shared phase parts",
    path: "app/_phases/_shared",
    files: 19,
    needs: ["Doc", "DocSection", "DefList", "Chip", "Loading", "ErrorBox", "Tally"],
    missing: ["callout"],
    evidence: "notebook/EvidenceLog quotes sources",
  },
  {
    module: "Projects and wizard",
    path: "app/projects, app/_projects",
    files: 8,
    needs: ["Card", "CardGrid", "ConfirmDialog", "Ghost", "Tally", "StatusPill", "PageHead"],
    missing: ["deck", "field", "table", "account"],
    evidence: "Deck in ProjectsView, CreateWizard; Field in ProjectDialog; .sort in ProjectsMatrix",
  },
  {
    module: "Library",
    path: "app/library, app/_library",
    files: 23,
    needs: ["Card", "CardGrid", "Thumb", "Sheet", "Dropzone", "KeyRow", "SideList", "SideItem", "Ghost", "Plate"],
    missing: ["menu", "field", "roving", "pager", "table"],
    evidence: "ContextMenu, FolderTree, MoveDialog; Keycaps in AssetLightbox; role=tab in LibraryView",
  },
  {
    module: "Playground",
    path: "app/playground",
    files: 2,
    needs: ["TextField", "NumberField", "Button", "StatusStrip", "Plate", "Loading", "ErrorBox", "Ghost"],
    missing: ["field", "player"],
    evidence: "<input, <textarea, <select and <audio in PlaygroundView",
  },
];
