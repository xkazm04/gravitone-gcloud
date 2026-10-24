// /scout/runs/<packet> - one scout night's (or seed batch's) packet on the Board's own desk, with the rail narrowed
// to the scout's packets: every run on the left, the triage on the right. The same island as /board/<packet>
// (board/_board/Board.tsx); only its way out and its rail's addresses are this route's.
import type { Metadata } from "next";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { Board } from "../../../board/_board/Board.tsx";
import { loadBoard } from "../../../board/_board/load.ts";
import { BOARD_PORT, BOARD_REDRIVE } from "../../../board/_port/wire.ts";
import { isScoutPacket, ScoutHead } from "../../_scout/ScoutHead.tsx";
import s from "../../_scout/scout.module.css";

export const metadata: Metadata = { title: "Gravitone · Scout runs" };

const HOME = { label: "Scout", href: "/scout", railBase: "/scout/runs" } as const;

export default async function ScoutRun({ params }: { readonly params: Promise<{ readonly packet: string }> }) {
  const r = await loadBoard(params);
  const head = (undecided?: number) => <ScoutHead current="runs" {...(undecided === undefined ? {} : { undecided })} />;
  if (!r.ok) {
    return (
      <div className={s.page}>
        {head()}
        <ErrorLine message={`scout · ${r.id}: ${r.error.error}`} live />
      </div>
    );
  }
  const rail = r.rail.filter(isScoutPacket);
  return (
    <div className={s.page}>
      {head(rail.filter((p) => p.state === "open").length)}
      <Board id={r.id} initial={r.packet} rail={rail} kind="full" port={BOARD_PORT} redrive={BOARD_REDRIVE} home={HOME} />
    </div>
  );
}
