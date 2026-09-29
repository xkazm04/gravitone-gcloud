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

// Every gap of the 2026-09-29 measurement is closed (the parts exist and render on /kit).
// A gap found later goes in this list. It is typed loosely on purpose: while the list is
// empty a literal-typed tuple is `readonly []` and `GapId` collapses to `never`, which
// breaks every reader; ids are checked against GAPS by the catalog probe instead.
export const GAPS: readonly Gap[] = [];

export type GapId = string;

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
    needs: ["Bar", "Crumbs", "TabRail", "Tally", "SideList", "SideItem", "StatusGlyph", "Sheet", "Ghost", "Field", "Segmented", "ToastTray", "NotificationBell", "UserMenu", "Steps"],
    missing: [],
    evidence: "Segmented in StudioView; AssetDrawer is a drawer over the shelf",
  },
  {
    module: "Research",
    path: "app/_phases/research",
    files: 29,
    needs: ["Entry", "Chip", "Chips", "StatusPill", "Tally", "Hint", "Sheet", "Ghost", "ErrorBox", "Loading", "Field", "Segmented", "Callout", "Deck", "DeckStage", "DeckCard"],
    missing: [],
    evidence: "Modal and Hint throughout; Deck in guided/*; FollowUpResult quotes a claim",
  },
  {
    module: "Script",
    path: "app/_phases/script",
    files: 44,
    needs: ["TabRail", "Matrix", "Scene", "Entry", "ScoreChip", "Chips", "Duo", "StackBar", "ConfirmDialog", "KeyRow", "Field", "Segmented", "Callout", "Table", "useRoving"],
    missing: [],
    evidence: "role=tab in ScriptStep; <select in PresetSelect, PromiseLedger; .sort in _matrix",
  },
  {
    module: "Frames",
    path: "app/_phases/frames",
    files: 15,
    needs: ["Tile", "Plate", "VerdictKeys", "Sheet", "Figures", "StatusGlyph", "SideList", "SideItem", "Field", "Segmented", "LayerList", "useRoving"],
    missing: [],
    evidence: "svg in frames/*; LayerPanel; <select in FramesAssembly",
  },
  {
    module: "Score",
    path: "app/_phases/score",
    files: 5,
    needs: ["SideList", "SideItem", "StatusGlyph", "Meridian", "Dock", "Count", "Field", "Segmented", "Callout", "Player"],
    missing: [],
    evidence: "<audio in ScoreSpotting; <select in SpotList",
  },
  {
    module: "Cut",
    path: "app/_phases/cut",
    files: 1,
    needs: ["Dock", "Meridian", "StatusStrip", "Report", "OpenLink", "Timeline", "Player", "Transport"],
    missing: [],
    evidence: "one file; <video in CutTimeline",
  },
  {
    module: "Shared phase parts",
    path: "app/_phases/_shared",
    files: 19,
    needs: ["Doc", "DocSection", "DefList", "Chip", "Loading", "ErrorBox", "Tally", "Callout"],
    missing: [],
    evidence: "notebook/EvidenceLog quotes sources",
  },
  {
    module: "Projects and wizard",
    path: "app/projects, app/_projects",
    files: 8,
    needs: ["Card", "CardGrid", "ConfirmDialog", "Ghost", "Tally", "StatusPill", "PageHead", "Field", "Segmented", "Deck", "DeckStage", "DeckCard", "StageRail", "Table", "NotificationBell", "UserMenu"],
    missing: [],
    evidence: "Deck in ProjectsView, CreateWizard; Field in ProjectDialog; .sort in ProjectsMatrix",
  },
  {
    module: "Library",
    path: "app/library, app/_library",
    files: 23,
    needs: ["Card", "CardGrid", "Thumb", "Sheet", "Dropzone", "KeyRow", "SideList", "SideItem", "Ghost", "Plate", "Field", "Segmented", "ContextMenu", "FolderTree", "useRoving", "Pager", "useWindow", "Table"],
    missing: [],
    evidence: "ContextMenu, FolderTree, MoveDialog; Keycaps in AssetLightbox; role=tab in LibraryView",
  },
  {
    module: "Playground",
    path: "app/playground",
    files: 2,
    needs: ["TextField", "NumberField", "Button", "StatusStrip", "Plate", "Loading", "ErrorBox", "Ghost", "Field", "Segmented", "Player"],
    missing: [],
    evidence: "<input, <textarea, <select and <audio in PlaygroundView",
  },
];
