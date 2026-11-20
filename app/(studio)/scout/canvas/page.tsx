// /scout/canvas - the scout's decision graph as a map (docs/scout-canvas-port.md; contest scout-canvas-v2-r2 A/1,
// "Watershed · Weirs"), the alternative to /scout's stage columns until the owner promotes it. The studio as one
// continent: the three content families are basins, every genre and channel a river from the seed highlands to the
// publishing coast, and every point that waits on the operator a weir that opens what clears it.
//
// A Server Component: the view is built here, where the stores are (./_port, the fixture or the real side), and handed
// to one client island (./_canvas/ui/Canvas.tsx) with the Server Actions that write. A read that fails renders the
// store's own sentence.
//
// The production basin (spark character-cores S1) is read here too: the productions and the cores a production can
// cast. A link can arrive on a production's street (`?street=<id>&v=a|b|c`, `&tray=1` for the cores, `&swap=<core>`
// for a swap's preview, asked here so the street opens on it).
import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { scoutHeaderFacts } from "../../_shell/headerFacts.ts";
import { serverBoard } from "../../board/_port/port.ts";
import s from "../_scout/scout.module.css";
import { isScoutPacket, ScoutHead } from "../_scout/ScoutHead.tsx";
import { serverCanvas } from "./_port/port.ts";
import { CANVAS_PORT } from "./_port/wire.ts";
import { Canvas, type CanvasProds } from "./_canvas/ui/Canvas.tsx";
import { isVariant } from "./_canvas/production/model.ts";

export const metadata: Metadata = { title: "Gravitone · Scout canvas" };

type Search = Readonly<Record<string, string | string[] | undefined>>;
const one = (raw: Search, k: string): string | undefined => {
  const v = raw[k];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
};

/** The basin's read, and the street a link arrives on. A refused read draws no basin; a refused preview opens the
 *  street with the side's sentence. */
async function prodsOf(raw: Search): Promise<CanvasProds> {
  const side = serverCanvas();
  const [ps, cs] = await Promise.all([side.productions(), side.cores()]);
  const productions = ps.ok ? ps.value.productions : [];
  const cores = cs.ok ? cs.value.cores : [];
  const street = one(raw, "street");
  if (street === undefined || !productions.some((p) => p.id === street)) return { productions, cores };
  const v = one(raw, "v");
  const swap = one(raw, "swap");
  const pv = swap === undefined ? null : await side.swapPreview({ production: street, core: swap });
  return {
    productions,
    cores,
    open: { production: street, variant: isVariant(v) ? v : "a", tray: one(raw, "tray") === "1", preview: pv !== null && pv.ok ? pv.value : null, error: pv !== null && !pv.ok ? pv.error.message : null },
  };
}

export default async function ScoutCanvasPage({ searchParams }: { readonly searchParams: Promise<Search> }) {
  await connection();
  const [view, packets, facts, prod] = await Promise.all([serverCanvas().view(), serverBoard().listPackets(), scoutHeaderFacts(), searchParams.then(prodsOf)]);
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
      <Canvas view={view.value} port={CANVAS_PORT} prod={prod} />
    </div>
  );
}
