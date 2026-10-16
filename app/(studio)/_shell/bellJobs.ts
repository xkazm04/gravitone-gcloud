"use server";

// The bell's read (lib/jobs.tsx `JobsProvider`'s `read`): the server's jobs as the bell draws them
// (./bell.ts) and the ledger seq they were read at, so the provider's event stream resumes from
// exactly there. Read-guarded through the one action core, as every produce read is.
import { z } from "zod";

import { ok } from "@gt/domain/errors";
import { eventsAfter } from "@gt/kernel/events-query";

import type { BellRead } from "../../../lib/jobs.tsx";
import { kernel } from "../../../lib/kernelStore.ts";
import { runAction, type ActionResult } from "../../_server/actionCore.ts";
import { principal } from "../../_server/principal.ts";
import { serverProduce } from "../projects/_port/port.ts";
import { bellJobs } from "./bell.ts";

export async function readBellJobs(): Promise<ActionResult<BellRead>> {
  return runAction(
    "bell jobs",
    () => principal("read"),
    z.undefined(),
    () => {
      const k = kernel();
      if (!k.ok) return k;
      const page = eventsAfter(k.value.store, 0, 1);
      if (!page.ok) return page;
      const jobs = serverProduce().listJobs();
      if (!jobs.ok) return jobs;
      return ok({ jobs: bellJobs(jobs.value), head: page.value.head });
    },
    undefined,
  );
}
