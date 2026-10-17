// /floor - the studio's hub (plan §2.1; Phase 3, lot 20): four media lanes, each flowing from
// the Foundry (running work) through the Weir (piles waiting on the operator) to the Library /
// Projects column, and the Calendar rail at the right edge, which opens into the month.
//
// A Server Component: the data is read here, where the stores are (./_floor/load.ts), and handed
// to one client island. The focused lane and the open month arrive in the search params, so a
// link can carry them (`/floor?lane=audio`, `/floor?cal=1&day=2026-10-15`), and the island keeps
// them there afterwards without asking the server again. So does an open slot's record
// (`/floor?cal=1&slot=<id>`, Phase 6): the level over the Floor that the rail and the month open;
// and the schedule sheet (`/floor?cal=1&new=1[&item=<id>]`, wave B), which reads its exports when
// it opens. On the real side every slot is the kernel's (./_calendar/real.ts).
//
// Phase 4 (L28): the Foundry cells carry the composers, over the produce port (../projects/_port);
// their choices are read here with the rest. A pile is still a door to its packet's Board, which
// is where a decision is made.

import type { Metadata } from "next";

import { publicError } from "../../_server/http.ts";
import { serverProduce } from "../projects/_port/port.ts";
import { PRODUCE_PORT } from "../projects/_port/wire.ts";
import { serverCalendar } from "./_calendar/port.ts";
import { CALENDAR_PORT } from "./_calendar/wire.ts";
import { Floor } from "./_floor/Floor.tsx";
import { loadFloor } from "./_floor/load.ts";
import { parseFloorUrl } from "./_floor/model.ts";

export const metadata: Metadata = { title: "Gravitone · Floor" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function FloorPage({ searchParams }: { readonly searchParams: Search }) {
  const [q, data] = await Promise.all([searchParams, loadFloor()]);
  const url = parseFloorUrl(q);
  const choices = serverProduce().composerChoices();
  // A slot opened by its URL (a reload, a pasted link, a new tab) is read with the page, so
  // the level rises with its record rather than with a wait.
  const read = url.slot === null ? null : serverCalendar().detail(url.slot, data.now);
  const slot = url.slot === null || read === null ? null : { id: url.slot, r: read.ok ? { ok: true as const, value: read.value } : { ok: false as const, error: publicError(read.error, "calendar detail") } };
  return <Floor data={data} initial={url} produce={PRODUCE_PORT} calendar={CALENDAR_PORT} slot={slot} choices={choices.ok ? choices : { ok: false, error: choices.error.message }} />;
}
