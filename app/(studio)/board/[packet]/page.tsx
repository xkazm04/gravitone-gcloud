// /board/<packet> - the Board, full page: what a reload, a pasted link or a skill's address
// opens (plan §2.1: "deep-linkable"). The same island as the sheet over the Floor
// (../../@sheet/(.)board/[packet]/page.tsx), drawn in flow under the header; Escape goes to
// the Floor.
import type { Metadata } from "next";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { Board } from "../_board/Board.tsx";
import { loadBoard } from "../_board/load.ts";
import { BOARD_PORT } from "../_port/wire.ts";

export const metadata: Metadata = { title: "Gravitone · Board" };

export default async function BoardPage({ params }: { readonly params: Promise<{ readonly packet: string }> }) {
  const r = await loadBoard(params);
  if (!r.ok) return <ErrorLine message={`board · ${r.id}: ${r.error.error}`} live />;
  return <Board id={r.id} initial={r.packet} rail={r.rail} kind="full" port={BOARD_PORT} />;
}
