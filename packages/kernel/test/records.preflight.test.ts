import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { loadJob, putJob } from "../src/job.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { launchProject, planReceipt } from "../src/records/launch.ts";
import { compose, releaseHeld } from "../src/records/write.ts";
import type { Reader, Store } from "../src/store.ts";
import { must, steppingClock } from "./helpers.ts";

// L45 (Phase 4 exit, L44 exit-roundtrip): a part whose act waits on a HUMAN act (a trailer script
// with no composed spine) is held `planned` by its producer's preflight - at the launch and at
// every release - instead of being released into a failure the worker then paints red.

const OP: Actor = { kind: "operator", id: "op" };
const NOW = Date.parse("2026-10-16T09:00:00Z");
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
function store(): Store {
  const k = must(openKernel(":memory:", { clock: steppingClock("2026-10-16T08:00:00.000Z") }));
  open.push(k);
  return k.store;
}
const state = (s: Store, key: string): string => must(s.read((r) => loadJob(r, `job:part:p1/${key}`))).job.state;

/** A preflight that holds the named parts with the script's own sentence, and counts its reads. */
function holding(...keys: string[]): { fn: (job: Job, r: Reader) => string | undefined; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    fn: (job) => {
      asked.push(job.id);
      return keys.some((k) => job.of.id === `p1/${k}`) ? "compose cut needs a composed spine" : undefined;
    },
  };
}

function launched(s: Store, preflightOf?: (job: Job, r: Reader) => string | undefined): void {
  if (!compose(s, { recipe: "film/trailer" }, OP, { id: "p1" }).ok) throw new Error("compose");
  const receipt = must(planReceipt(s, "p1", { mode: "dry" }, { now: NOW }));
  const l = launchProject(s, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, OP, { now: NOW, dryOnly: true, ...(preflightOf === undefined ? {} : { preflightOf }) });
  if (!l.ok) throw l.error;
}

describe("a producer's preflight holds a part that waits on a human act", () => {
  it("at the release: the upstream finished, the held part stays planned; without a preflight it is released (control)", () => {
    const s = store();
    launched(s);
    expect([state(s, "research"), state(s, "script")]).toEqual(["queued", "planned"]);
    must(s.tx((t) => putJob(t, { ...loadJob(t, "job:part:p1/research").job, state: "done" })));
    const pre = holding("script");
    expect(must(releaseHeld(s, "p1", OP, { now: NOW, preflightOf: pre.fn }))).toEqual([]);
    expect(pre.asked).toContain("job:part:p1/script");
    expect(state(s, "script")).toBe("planned");
    expect(must(releaseHeld(s, "p1", OP, { now: NOW }))).toEqual(["job:part:p1/script"]);
    expect(state(s, "script")).toBe("queued");
  });

  it("at the launch: a root part whose act waits is enqueued planned and not released; the others queue as before", () => {
    const s = store();
    launched(s, holding("research").fn);
    expect([state(s, "research"), state(s, "script")]).toEqual(["planned", "planned"]);
    const t = store();
    launched(t, holding("script").fn);
    expect(state(t, "research")).toBe("queued");
  });
});
