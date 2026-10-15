// POST /board/fixture - the fixture universe's controls, for the live lane only: start every
// pile over (`{}`), or move v1's side of one pile under an unchanged decision map
// (`{"drift": "<packet id>"}`) so its next commit meets a stale preview. Refused unless the
// Board answers from the fixture (./_port/port.ts SIDE) in a development server; L24 deletes it
// with the fixture.

import { z } from "zod";

import { err, ok } from "@gt/domain/errors";

import { route } from "../../../_server/route.ts";
import { driftFixture, resetFixture } from "../_port/fixture.ts";
import { SIDE } from "../_port/port.ts";

export const maxDuration = 10;

const input = z.object({ drift: z.string().min(1).max(400).optional() });

export const POST = route({ guard: "access", bodyCap: 4_000, maxDuration, input }, async ({ input: body }) => {
  if (SIDE !== "fixture" || process.env.NODE_ENV === "production") return err("refused", "board fixture: only a development server answering from the fixture has one");
  if (body.drift !== undefined) return driftFixture(body.drift) ? ok({ done: `drifted ${body.drift}` }) : err("not-found", `board fixture: no packet ${body.drift}`);
  resetFixture();
  return ok({ done: "reset" });
});
