// The studio's view (spark audio-agent-studio S2: canvas layout drawn with desk's components), and,
// for spark suno-advisor stage S1, three compositions of the Suno pieces behind `&v=`: thread (that
// view, the Suno pieces inside each card), sheet (../_sheet: one living prompt pinned) and board
// (../_board: one row per generation). The S1 gate keeps one and retires this table.
import { View as BoardView } from "../_board/View.tsx";
import { View as SheetView } from "../_sheet/View.tsx";
import { View } from "../_view/View.tsx";
import type { StudioView } from "../url.ts";
import type { Variant } from "./types.ts";

export const STUDIO_VIEW: Variant = View;

export const STUDIO_VIEWS_BY: Readonly<Record<StudioView, Variant>> = { thread: View, sheet: SheetView, board: BoardView };
