"use server";

// WHAT A JOB OR A RUN MADE, COUNTED - the Library's door from the screens that hold the job
// (Runs' inspector) or the run (a decided Board packet). The door is drawn only when the count is
// above zero, so it never opens on an empty Library; its address is the Library's own facet
// grammar (`f=job:<id>`, `f=run:<id>`, _shell/links.ts `libraryFor`), not a parameter of its own.
//
// The Board receives it on its port (board/_port/wire.ts); Runs' inspector loads it when a job
// is opened (its page hands it no port), so no client module imports it statically and the
// client closure never walks into this file's zod door. Read with `read` key use, as the
// Library's own query is.

import { z } from "zod";

import { ok } from "@gt/domain/errors";

import { runAction, type ActionResult } from "../../../_server/actionCore.ts";
import { principal } from "../../../_server/principal.ts";
import { libraryFor } from "../../_shell/links.ts";
import { serverLibrary } from "./port.ts";

/** What the door draws: how many, and where it opens. */
export type Made = { readonly n: number; readonly href: string };

const input = z.object({ group: z.enum(["job", "run"]), value: z.string().min(1).max(400) });

export async function madeBy(raw: { readonly group: "job" | "run"; readonly value: string }): Promise<ActionResult<Made>> {
  return runAction(
    "library made",
    () => principal("read"),
    input,
    (i) => {
      const n = serverLibrary().madeBy(i.group, i.value);
      return n.ok ? ok({ n: n.value, href: libraryFor(i.group, i.value) }) : n;
    },
    raw,
  );
}
