// Wire types for the Board — the one decision inbox (platform-consolidation
// spark, 2026-10-04). Every human gate in the app is read through a
// `BoardSource` adapter and decided in one vocabulary; the adapter writes the
// verdict back through the source's own existing writer.

export type BoardSourceId =
  | "cull"
  | "extract"
  | "dojo"
  | "proof"
  | "adoption"
  | "alternative"
  | "triage"
  | "publish"
  | "articles";

/** `null` = undecided. */
export type BoardVerdict = "approve" | "reject" | null;

export interface BoardMedia {
  kind: "image" | "video" | "audio" | "text";
  src?: string;
  text?: string;
}

export interface BoardItem {
  /** `${source}:${key}` */
  id: string;
  source: BoardSourceId;
  title: string;
  projectId: string | null;
  /** A run, cycle, theme or project the item belongs to; null when it stands alone. */
  group: string | null;
  media: BoardMedia[];
  /** The machine's own answer, hidden by the surface until the human has decided. */
  machinePick: string | null;
  verdict: BoardVerdict;
  reasons: string[];
  note: string | null;
  createdAt: string;
}

export interface BoardSource {
  id: BoardSourceId;
  label: string;
  /** Named reject axes, e.g. ["style", "subject"]; empty when a reject is one thing. */
  reasonAxes: string[];
  load(): Promise<BoardItem[]>;
  decide(itemId: string, verdict: BoardVerdict, reasons?: string[], note?: string): Promise<void>;
}
