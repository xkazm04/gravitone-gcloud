// THE MIGRATION MAP — declared intent only: which kit parts each module of the app
// is meant to use. Everything measured (file counts, kit and signal imports, the
// parts a module already uses, hand-rolled suspects, parts nobody uses) is in
// app/kit/census.json, which pipeline/kit-census.mts generates from the tree and
// the catalog probe recomputes on every `npm test`.
//
// Until 2026-10-05 this file also carried the facts — file counts and an
// "evidence" column, measured by hand on 2026-09-29 — and they rotted inside a
// week: Cut 1 file → 18, Playground 2 → 35, and an empty gap list while neither
// imported anything from the kit. A fact typed by hand has no recomputation path;
// a `needs` list is a decision, and a decision is the one thing a census cannot
// measure. So the decision stays here and the measurement moved out.

import type { Census, SuspectKind } from "@/pipeline/kit-census.mjs";

import type { PartName } from "./catalog";

export interface Module {
  module: string;
  /** Census modules (pipeline/kit-census.mts moduleOf) this row covers. */
  paths: readonly string[];
  /** Kit parts the module's surfaces are meant to use. */
  needs: readonly PartName[];
}

export const MODULES: readonly Module[] = [
  {
    module: "Studio shell",
    paths: ["app/studio", "app/_studio"],
    needs: ["Bar", "Crumbs", "TabRail", "Tally", "SideList", "SideItem", "StatusGlyph", "Sheet", "Ghost", "Field", "Segmented", "ToastTray", "NotificationBell", "UserMenu", "Steps"],
  },
  {
    module: "Research",
    paths: ["app/_phases/research"],
    needs: ["Entry", "Chip", "Chips", "StatusPill", "Tally", "Hint", "Sheet", "Ghost", "ErrorBox", "Loading", "Field", "Segmented", "Callout", "Deck", "DeckStage", "DeckCard"],
  },
  {
    module: "Script",
    paths: ["app/_phases/script"],
    needs: ["TabRail", "Matrix", "Scene", "Entry", "ScoreChip", "Chips", "Duo", "StackBar", "ConfirmDialog", "KeyRow", "Field", "Segmented", "Callout", "Table", "useRoving", "Select"],
  },
  {
    module: "Frames",
    paths: ["app/_phases/frames"],
    needs: ["Tile", "Plate", "VerdictKeys", "Sheet", "Figures", "StatusGlyph", "SideList", "SideItem", "Field", "Segmented", "LayerList", "useRoving", "Select"],
  },
  {
    module: "Score",
    paths: ["app/_phases/score"],
    needs: ["SideList", "SideItem", "StatusGlyph", "Meridian", "Dock", "Count", "Field", "Segmented", "Callout", "Player", "Select"],
  },
  {
    module: "Cut",
    paths: ["app/_phases/cut"],
    needs: ["Dock", "Meridian", "StatusStrip", "Report", "OpenLink", "Timeline", "Player", "Transport"],
  },
  {
    module: "Shared phase parts",
    paths: ["app/_phases/_shared"],
    needs: ["Doc", "DocSection", "DefList", "Chip", "Loading", "ErrorBox", "Tally", "Callout"],
  },
  {
    module: "Projects and wizard",
    paths: ["app/projects", "app/_projects"],
    needs: ["Card", "CardGrid", "ConfirmDialog", "Ghost", "Tally", "StatusPill", "PageHead", "Field", "Segmented", "Deck", "DeckStage", "DeckCard", "StageRail", "Table", "NotificationBell", "UserMenu"],
  },
  {
    module: "Library",
    paths: ["app/library", "app/_library"],
    needs: ["Card", "CardGrid", "Thumb", "Sheet", "Dropzone", "KeyRow", "SideList", "SideItem", "Ghost", "Plate", "Field", "Segmented", "ContextMenu", "FolderTree", "useRoving", "Pager", "useWindow", "Table", "TabRail"],
  },
  {
    module: "Playground",
    paths: ["app/playground"],
    needs: ["TextField", "NumberField", "Button", "StatusStrip", "Plate", "Loading", "ErrorBox", "Ghost", "Field", "Segmented", "Select", "Player"],
  },
];

/** The kit part that is the answer to each hand-rolled suspect. `typing` has none yet. */
export const ANSWERS: Record<SuspectKind, PartName | null> = {
  tab: "TabRail",
  select: "Select",
  media: "Player",
  title: "Hint",
  typing: null,
};

export interface MigrationGap {
  module: string;
  part: PartName;
  kind: SuspectKind;
  /** Suspects of that kind across the module's paths. */
  suspects: number;
}

/** Census modules a row covers, summed: what the module measures today. */
export function measured(row: Module, census: Census) {
  const ms = row.paths.map((p) => census.modules[p]).filter((m) => m !== undefined);
  const suspects = { tab: 0, select: 0, media: 0, title: 0, typing: 0 } as Record<SuspectKind, number>;
  for (const m of ms) for (const k of Object.keys(suspects) as SuspectKind[]) suspects[k] += m.suspects[k] ?? 0;
  return {
    files: ms.reduce((n, m) => n + m.files, 0),
    kitImports: ms.reduce((n, m) => n + m.kitImports, 0),
    signalImports: ms.reduce((n, m) => n + m.signalImports, 0),
    parts: new Set(ms.flatMap((m) => m.parts)),
    suspects,
  };
}

/** A gap: a part the row needs, which the module does not use, while a hand-rolled copy of it is present. */
export function migrationGaps(census: Census): MigrationGap[] {
  const out: MigrationGap[] = [];
  for (const row of MODULES) {
    const m = measured(row, census);
    for (const [kind, part] of Object.entries(ANSWERS) as [SuspectKind, PartName | null][]) {
      if (!part || !row.needs.includes(part) || m.parts.has(part) || m.suspects[kind] === 0) continue;
      out.push({ module: row.module, part, kind, suspects: m.suspects[kind] });
    }
  }
  return out;
}
