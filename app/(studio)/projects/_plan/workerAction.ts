"use server";

// The worker read (./workerRead.ts) for a client island that re-reads it: the Plan, which has no
// live feed, asks on its backstop - handed it by its page as a prop, never imported by a client
// module (tests/next-gates/client-closure.test.ts). Read-guarded through the one action core, as every produce
// read is.
import { z } from "zod";

import { ok } from "@gt/domain/errors";

import { runAction, type ActionResult } from "../../../_server/actionCore.ts";
import { principal } from "../../../_server/principal.ts";
import type { WorkerRead } from "./WorkerChip.tsx";
import { readWorker } from "./workerRead.ts";

export async function readWorkerAction(): Promise<ActionResult<WorkerRead>> {
  return runAction("worker", () => principal("read"), z.undefined(), () => ok(readWorker()), undefined);
}
