// The Board as a SHEET over whatever (studio) page is open - a soft navigation to
// /board/<packet> (the Floor's piles, its NEXT, the header) is intercepted here and drawn in the
// layout's `sheet` slot, so the page beneath stays mounted (plan §2.1, COMMON decision 10).
// A reload of the same URL is not intercepted and opens ../../board/[packet]/page.tsx.
//
// `(.)` counts route SEGMENTS, not folders: `@sheet` is a slot and `(studio)` a group, so this
// matches `board` at the root, the level every (studio) page navigates from.
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { Board } from "../../../board/_board/Board.tsx";
import { loadBoard } from "../../../board/_board/load.ts";
import { BOARD_PORT, BOARD_REDRIVE } from "../../../board/_port/wire.ts";

export default async function BoardSheet({ params }: { readonly params: Promise<{ readonly packet: string }> }) {
  const r = await loadBoard(params);
  if (!r.ok) return <ErrorLine message={`board · ${r.id}: ${r.error.error}`} live />;
  return <Board id={r.id} initial={r.packet} rail={r.rail} {...(r.railError === undefined ? {} : { railError: r.railError })} kind="sheet" port={BOARD_PORT} redrive={BOARD_REDRIVE} />;
}
