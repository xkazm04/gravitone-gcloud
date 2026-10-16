import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { ModelOption } from "@gt/domain/produce";
import { cancel, loadJob } from "../src/job.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import { launchRun, readRunIn, recordRunIn, rerouteOptions, runReceipt } from "../src/records/launch.ts";
import { modelOptions } from "../src/records/options.ts";
import { loadRun, quotedSecondsOf } from "../src/records/schema.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock } from "./helpers.ts";

// A PRODUCER'S OWN LAUNCH WRITES A RUN (Phase 4 wave B, item 5). Extract, Suno and the music
// video used to enqueue a job serving a run nobody recorded: the queue priced it at 0 s, Runs had
// no row for it and a re-route preview answered "serves no part or run".

const OP: Actor = { kind: "operator", id: "op" };
const NOW = Date.parse("2026-10-16T09:00:00Z");
const ctx = { now: NOW };
const lctx = { now: NOW, dryOnly: true };
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
const ok = <T>(o: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!o.ok) throw new Error(o.error.message);
  return o.value;
};
const events = (s: Store, type: string) => must(s.read((r) => r.all("SELECT data FROM events WHERE type = ? ORDER BY seq", type)));

const gallery = { producer: "extract", slug: "harbour", sources: 3, folder: "C:/galleries/harbour", rounds: 2 };
/** Extract's worst case, priced by the producer (lib/producers/extract.ts `extractLine`). */
function worstCase(usd: number): ModelOption {
  const base = modelOptions("extract", "2026-10-16")[0];
  if (base === undefined) throw new Error("no extract option");
  return { ...base, label: `${base.label} · worst case`, usdPerUnit: usd, secondsPerUnit: 140, src: "model" };
}

describe("a producer's own launch", () => {
  it("writes the Run beside its job: the producer's terms verbatim, its own quote, its units", () => {
    const s = store();
    const quote = { key: "extract:new:abc", label: "extract · 3 source(s)", option: worstCase(0.3) };
    const receipt = must(runReceipt(s, gallery, { mode: "dry", quote }, ctx));
    expect(receipt.subject).toEqual({ kind: "run", lane: "image" });
    expect(receipt.lines[0]).toMatchObject({ key: "extract:new:abc", lane: "cloud.google", units: 3, usd: 0.9, seconds: 420 });
    const r = ok(launchRun(s, { input: gallery, token: receipt.token, mode: "dry", quote }, OP, { ...lctx, id: "2026-10-16-harbour" }));
    expect(r.jobId).toBe("job:run:2026-10-16-harbour");
    const { run } = must(s.read((x) => loadRun(x, "2026-10-16-harbour")));
    expect(run).toMatchObject({ lane: "image", producer: "extract", recipe: "style/extract", input: gallery, units: 3, estimate: { seconds: 420, usd: 0.9 } });
    expect(must(s.read((x) => loadJob(x, r.jobId))).job).toMatchObject({ producer: "extract", lane: "cloud.google", of: { kind: "run", id: "2026-10-16-harbour" }, correlation: { runId: "2026-10-16-harbour" } });
    // The queue now prices it from its quote, so the next launch on the lane waits behind 420 s of it.
    expect(must(s.read((x) => quotedSecondsOf(x, r.jobId)))).toBe(420);
    const next = must(runReceipt(s, { ...gallery, slug: "dock" }, { mode: "dry", quote: { ...quote, key: "extract:new:def" } }, ctx));
    expect(next.queuePos).toBe(2);
  });

  it("binds the token to what the quote is for: another gallery's key is a stale receipt", () => {
    const s = store();
    const a = must(runReceipt(s, gallery, { mode: "dry", quote: { key: "extract:new:a", option: worstCase(0.3) } }, ctx));
    const swapped = launchRun(s, { input: gallery, token: a.token, mode: "dry", quote: { key: "extract:new:b", option: worstCase(0.3) } }, OP, { ...lctx, id: "x1" });
    expect(swapped.ok ? "" : swapped.error.detail).toBe("stale-receipt");
  });

  it("runs under the launching producer: Suno's track is quoted and re-routed only among Suno's options", () => {
    const s = store();
    const input = { producer: "suno", proposal: "p-2026-10-16-rain" };
    const receipt = must(runReceipt(s, input, { mode: "dry", units: 1 }, ctx));
    expect(receipt.lines[0]).toMatchObject({ provider: "suno", lane: "box.chrome", units: 1, usd: null });
    ok(launchRun(s, { input, token: receipt.token, mode: "dry", units: 1 }, OP, { ...lctx, id: "suno.p1" }));
    expect(must(s.read((x) => loadJob(x, "job:run:suno.p1"))).job.producer).toBe("suno");
    // A composer's audio run may move to ElevenLabs (another producer); a Suno launch may not.
    expect(must(rerouteOptions(s, "job:run:suno.p1", ctx)).map((o) => [o.option.provider, o.current])).toEqual([["suno", true]]);
  });

  it("maps every producer's own launch to the recipe whose work part it makes", () => {
    const s = store();
    const cases: [unknown, string, string, string][] = [
      [{ producer: "article", subject: "software-engineering/background-jobs", angle: "the sweep" }, "article", "article/post", "seat.text"],
      [{ producer: "article", topic: "why receipts come first" }, "article", "article/post", "seat.text"],
      [{ producer: "mv", track: "album-a/03-tide" }, "video", "album-video", "box.render"],
      [{ producer: "strips", lane: "stat", only: ["S06"] }, "video", "strips/stat", "seat.text"],
      [{ producer: "forge", plan: "sweep-01" }, "image", "style/forge-sweep", "gpu.local"],
      [{ producer: "dojo", cycle: "2026-10-16-c1" }, "image", "style/dojo-cycle", "cloud.google"],
    ];
    cases.forEach(([input, media, recipe, lane], i) => {
      const receipt = must(runReceipt(s, input, { mode: "dry" }, ctx));
      expect(receipt.subject, recipe).toEqual({ kind: "run", lane: media });
      expect(receipt.lines[0]?.lane, recipe).toBe(lane);
      const r = ok(launchRun(s, { input, token: receipt.token, mode: "dry" }, OP, { ...lctx, id: `n${i}` }));
      expect(must(s.read((x) => loadRun(x, r.runId))).run.recipe).toBe(recipe);
      expect(must(rerouteOptions(s, r.jobId, ctx)).some((o) => o.current), recipe).toBe(true);
    });
  });

  it("refuses a quote on a lane the producer does not make that kind on", () => {
    const s = store();
    const offLane = { ...worstCase(0.3), lane: "gpu.local" as const };
    const r = runReceipt(s, gallery, { mode: "dry", quote: { option: offLane } }, ctx);
    expect(r.ok ? "" : r.error.message).toMatch(/made on cloud.google, not gpu.local/);
  });

  it("keeps one row per run: a second launch waits for the first job, then moves the row to its own", () => {
    const s = store();
    const launch = (jobId?: string) => {
      const receipt = must(runReceipt(s, gallery, { mode: "dry" }, ctx));
      return launchRun(s, { input: gallery, token: receipt.token, mode: "dry" }, OP, { ...lctx, id: "rr", ...(jobId === undefined ? {} : { jobId }) });
    };
    ok(launch());
    const busy = launch("job:run:rr~2");
    expect(busy.ok ? "" : busy.error.message).toMatch(/served by job job:run:rr \(queued\)/);
    must(cancel(s, jobIdSchema.parse("job:run:rr"), OP));
    expect(ok(launch("job:run:rr~2")).jobId).toBe("job:run:rr~2");
    expect(must(s.read((x) => loadRun(x, "rr"))).jobId).toBe("job:run:rr~2");
    const moved = events(s, "run.relaunched").map((e) => String(e["data"]));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/"from":"job:run:rr".*"to":"job:run:rr~2"/);
    const foreign = launch("job:run:other");
    expect(foreign.ok ? "" : foreign.error.message).toMatch(/does not name run rr/);
  });

  it("lets a batch launcher record each run inside its own transaction", () => {
    const s = store();
    const tracks = ["t1", "t2"];
    must(
      s.tx((t) => {
        for (const id of tracks) {
          const read = readRunIn(t, { producer: "mv", track: id }, { mode: "dry" }, ctx);
          recordRunIn(t, read, `mv.${id}`, `job:run:mv.${id}`, OP);
        }
      }),
    );
    expect(tracks.map((id) => must(s.read((x) => loadRun(x, `mv.${id}`))).run.producer)).toEqual(["mv", "mv"]);
  });

  it("launches a receipt over its ceiling - the ceiling is where the job stops - and says so on the launch", () => {
    const s = store();
    const quote = { option: worstCase(5) };
    const receipt = must(runReceipt(s, gallery, { mode: "dry", ceilingUsd: 1, quote }, ctx));
    expect(receipt.overCeiling).toBe(true);
    const r = ok(launchRun(s, { input: gallery, token: receipt.token, mode: "dry", ceilingUsd: 1, quote }, OP, { ...lctx, id: "capped" }));
    expect(must(s.read((x) => loadJob(x, r.jobId))).job.ceilingUsd).toBe(1);
    expect(String(events(s, "run.launched")[0]?.["data"])).toContain('"overCeiling":true');
  });
});
