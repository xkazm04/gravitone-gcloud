import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { AppError } from "@gt/domain/errors";
import { openStore } from "@gt/kernel/store";

// THE ROOT CAUSE OF THREE RED SAME-JOB PROOFS (L44, Phase 4 exit; tests/live/exit-same-job.live.spec.ts).
//
// A kernel Store outlives the module graph that opened it: the server caches one per process
// (lib/kernelStore.ts) and a route's graph is not the page's that opened it; a tsx CLI opens it
// in its static graph and reaches the producers through pipeline/lib-hooks.mts, a second graph.
// Each graph carries its own copy of @gt/domain/errors, so an AppError thrown inside a read by
// one copy is not `instanceof` the other's - and packages/kernel/src/store.ts `classify`
// re-labels it `internal` ("store: no job ..."). Every caller that branches on `not-found` then
// takes the wrong branch: measured on the running server and the CLIs, 2026-10-16 -
//   POST /api/foundry/strips (a NEW run's confirm)       -> 500 "store: no job job:run:l44-ui"
//   POST /api/foundry/extract/<id>/step (the confirm)     -> 500 "store: no job job:run:<id>"
//   extract.mts <folder> --slug ... --dry --detach        -> exit 1 "store: no job job:run:<id>"
// (lib/producers/strips.ts and extract.ts `jobOf` read `r.error.code === "not-found"` to find a
// free job id). In process, with one graph, every producer test is green - which is why the
// defect survived its lots.
//
// The second copy is made the way a bundler or a loader makes one: the same file under another
// module id (a query suffix), so its class is a different constructor with the same name.

const dir = mkdtempSync(path.join(tmpdir(), "gt-l44-classify-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("a store's error classification across module instances", () => {
  it("control: an AppError from the store's own copy keeps its code", () => {
    const s = openStore(path.join(dir, "own.sqlite"));
    if (!s.ok) throw s.error;
    const r = s.value.read(() => {
      throw new AppError("not-found", "no job job:run:x");
    });
    s.value.close();
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
  });

  it("an AppError from ANOTHER copy of @gt/domain/errors keeps its code (not-found stays not-found)", async () => {
    // A computed specifier: the query is the module id a type checker has no file for.
    const second = "../../packages/domain/src/errors.ts?second-graph";
    const other = (await import(/* @vite-ignore */ second)) as typeof import("@gt/domain/errors");
    expect(other.AppError, "the test really holds a second class").not.toBe(AppError);
    const s = openStore(path.join(dir, "foreign.sqlite"));
    if (!s.ok) throw s.error;
    const r = s.value.read(() => {
      throw new other.AppError("not-found", "no job job:run:x");
    });
    s.value.close();
    expect(r.ok ? "ok" : `${r.error.code}: ${r.error.message}`).toBe("not-found: no job job:run:x");
  });
});
