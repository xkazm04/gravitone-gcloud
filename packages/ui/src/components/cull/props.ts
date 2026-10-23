// What every view of the matrix cull takes (the rows desk and the mosaic alike) - its own module so
// the views import it without importing each other.
import type { BoardVerdict } from "../../board/boardGate.ts";
import type { BoardPacket } from "../../board/port.ts";

export type MatrixCullProps = {
  readonly packet: BoardPacket;
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly undo: () => void;
  readonly onCommit: () => void;
  readonly busy?: boolean;
  /** Say it aloud (the shell's polite region). */
  readonly announce?: (message: string) => void;
  /** Off on a /kit specimen, whose keys are not the page's. */
  readonly keys?: boolean;
};
