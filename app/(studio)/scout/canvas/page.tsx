// /scout/canvas - the scout's decision graph as a map (docs/scout-canvas-port.md; contest scout-canvas-v2-r2 A/1,
// "Watershed · Weirs"), the alternative to /scout's stage columns until the owner promotes it. The studio as one
// continent: the three content families are basins, every genre and channel a river from the seed highlands to the
// publishing coast, and every point that waits on the operator a weir that opens what clears it.
//
// A Server Component: the view is built here, where the stores are (./_port, the fixture or the real side), and handed
// to one client island (./_canvas/ui/Canvas.tsx) with the Server Actions that write. A read that fails renders the
// store's own sentence.
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import s from "../_scout/scout.module.css";
import { isScoutPacket, ScoutHead } from "../_scout/ScoutHead.tsx";
import { serverCanvas } from "./_port/port.ts";
import { CANVAS_PORT } from "./_port/wire.ts";
import { Canvas } from "./_canvas/ui/Canvas.tsx";

export const metadata: Metadata = { title: "Gravitone · Scout canvas" };

export default async function ScoutCanvasPage() {
  await connection();
  const [view, packets, facts] = await Promise.all([serverCanvas().view(), serverBoard().listPackets(), scoutHeaderFacts()]);
  const undecided = packets.ok ? packets.value.packets.filter((p) => isScoutPacket(p) && p.state === "open").length : 0;
  const head = <ScoutHead current="canvas" undecided={undecided} facts={facts} />;
  if (!view.ok) {
    return (
      <div className={s.page}>
        {head}
        <ErrorLine message={`scout canvas: ${view.error.message}`} live />
      </div>
    );
  }
  return (
    <div className={s.page}>
      {head}
      <Canvas view={view.value} port={CANVAS_PORT} />
    </div>
  );
}
