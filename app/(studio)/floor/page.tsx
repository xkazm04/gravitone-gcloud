// /floor - the studio's hub (plan §2.1; Phase 3, lot 20): four media lanes, each flowing from
// the Foundry (running work) through the Weir (piles waiting on the operator) to the Library /
// Projects column, and the Calendar rail at the right edge, which opens into the month.
//
// A Server Component: the data is read here, where the stores are (./_floor/load.ts), and handed
// to one client island. The focused lane and the open month arrive in the search params, so a
// link can carry them (`/floor?lane=audio`, `/floor?cal=1&day=2026-10-15`), and the island keeps
// them there afterwards without asking the server again.
//
// READ-ONLY in this phase (COMMON decision 11): no composer and no Launch are drawn; a pile is a
// door to its packet's Board, which is where a decision is made.

import type { Metadata } from "next";

import { Floor } from "./_floor/Floor.tsx";
import { loadFloor } from "./_floor/load.ts";
import { parseFloorUrl } from "./_floor/model.ts";

export const metadata: Metadata = { title: "Gravitone · Floor" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function FloorPage({ searchParams }: { readonly searchParams: Search }) {
  const [q, data] = await Promise.all([searchParams, loadFloor()]);
  return <Floor data={data} initial={parseFloorUrl(q)} />;
}
