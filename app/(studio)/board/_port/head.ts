"use server";

// WHERE THE BOARD'S LIVE FEED STARTS - the ledger's newest seq, asked by the island once it is
// mounted (_board/live.ts, handed this on the port: ./wire.ts). The Floor and Runs carry the seq
// they rendered at as a prop; the Board's pages pass no such prop yet, so the island asks. An event
// landing between the render and this answer is caught by the 20 s backstop, not the stream -
// the Director's `head={r.head}` on each page (loadBoard already returns it) closes that gap.

import { z } from "zod";

import { runAction, type ActionResult } from "../../../_server/actionCore.ts";
import { principal } from "../../../_server/principal.ts";
import { ledgerHead } from "../../../../lib/library/head.ts";

export async function boardHead(): Promise<ActionResult<number>> {
  return runAction("board head", () => principal("read"), z.undefined(), () => ledgerHead(), undefined);
}
