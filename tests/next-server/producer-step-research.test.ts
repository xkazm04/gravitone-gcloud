// THE RESEARCH AND SCRIPT PART ACTS AS KERNEL JOBS (Phase 4 wave C, L37), end to end through the
// real PartPort (app/(studio)/projects/[id]/_part/real.ts): a receipt, its confirm, the act's job
// enqueued and driven DRY on its own lane (every paid call answered by its stand-in, booked as a
// would-call), the output landed in the part's records as the job, and the verdict moved.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ok, type Result } from "@gt/domain/errors";
import type { PartView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { list } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-16T09:00:00Z");

export function universe(recipe: string, id: string): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-step-"));
  dirs.push(dir);
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe }, OP, { id });
  if (!c.ok) throw c.error;
  const port = makeRealPart({ store: () => ok(store), now: () => NOW, actWaitMs: 60_000, gates: { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW } });
  return { store, port };
}

async function must<T>(r: Result<T> | Promise<Result<T>>): Promise<T> {
  const x = await r;
  if (!x.ok) throw new Error(`${x.error.code}: ${x.error.message}`);
  return x.value;
}

async function applied(r: Result<{ kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView }> | Promise<Result<{ kind: "applied"; view: PartView } | { kind: "conflict"; current: PartView }>>): Promise<PartView> {
  const o = await must(r);
  if (o.kind !== "applied") throw new Error("expected applied, got conflict");
  return o.view;
}

async function confirm(port: ReturnType<typeof makeRealPart>, projectId: string, key: string, act: Parameters<ReturnType<typeof makeRealPart>["act"]>[0]["act"]): Promise<{ jobId: string; view: PartView }> {
  const receipt = await must(port.actReceipt({ projectId, key, act }));
  const out = await must(port.act({ projectId, key, act, token: receipt.token }));
  if (out.kind !== "launched") throw new Error("stale receipt");
  return out;
}

describe("research acts are jobs with receipts", () => {
  it("an ads ideas round: the job runs dry on the part's lane, lands the validated ideas as the job, and a pick makes it READY", async () => {
    const { store, port } = universe("film/ad-social-15", "ad1");
    let rev = 1;
    for (const [field, value] of [["product", "Rainshell — a packable rain jacket"], ["proposition", "This jacket keeps you dry in a downpour."], ["cta", "Pack one today"], ["audience", "city cyclists"]] as const) {
      rev = (await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: rev, op: { op: "set-brief", field, value } }))).rev;
    }
    const { jobId, view } = await confirm(port, "ad1", "research", "generate-ideas");
    expect(jobId).toBe(`job:part:ad1/research:generate-ideas:${rev}`);
    const job = (await must(list(store))).find((j) => j.id === jobId);
    expect(job?.error?.message).toBeUndefined();
    expect(job).toMatchObject({ state: "done", producer: "research", lane: "seat.text", mode: { kind: "dry" }, spend: { usd: 0 }, of: { kind: "part", id: "ad1/research" }, correlation: { projectId: "ad1" } });
    if (view.kind !== "research" || view.data.face !== "ads") throw new Error("not the ads face");
    expect(view.data.ideas.length).toBe(6);
    expect(view.running).toEqual([]);
    // The landing is the job's, so it is not on the operator's undo trail.
    expect(view.ops.map((o) => o.label)).not.toContain("generate-ideas");
    const picked = await applied(port.opPart({ projectId: "ad1", key: "research", baseRev: view.rev, op: { op: "pick-idea", ideaId: view.data.ideas[0]?.id ?? "" } }));
    expect(picked.verdict).toMatchObject({ state: "ready", codes: [{ code: "idea-picked" }] });

    const sc = await confirm(port, "ad1", "script", "generate-scenarios");
    if (sc.view.kind !== "script" || sc.view.data.face !== "ads") throw new Error("not the ads script");
    expect(sc.view.data.scenarios.length).toBe(3);
    const pick = await applied(port.opPart({ projectId: "ad1", key: "script", baseRev: sc.view.rev, op: { op: "pick-scenario", scenarioId: sc.view.data.scenarios[0]?.id ?? "" } }));
    expect(pick.verdict.state).toBe("ready");
  });

  it("a stale token launches nothing and answers the fresh receipt; a refused act (an empty brief) is the work's own sentence", async () => {
    const { store, port } = universe("film/ad-social-15", "ad2");
    const r = await port.actReceipt({ projectId: "ad2", key: "research", act: "generate-ideas" });
    expect(r.ok ? "" : r.error.message).toContain("needs product · proposition · cta");
    let rev = 1;
    for (const [field, value] of [["product", "Rainshell"], ["proposition", "Dry in a downpour."], ["cta", "Pack one"]] as const) rev = (await applied(port.opPart({ projectId: "ad2", key: "research", baseRev: rev, op: { op: "set-brief", field, value } }))).rev;
    const stale = await must(port.act({ projectId: "ad2", key: "research", act: "generate-ideas", token: "0123456789abcdef" }));
    expect(stale.kind).toBe("stale");
    expect(rev).toBe(4);
    expect((await must(list(store))).length).toBe(0);
  });

  it("a notebook run lands the project's own transcribed notebook (dry); a scope confirm makes it READY; compose then lands its candidates", async () => {
    const { store, port } = universe("film/short-educational-video", "why-bitcoin");
    const { view } = await confirm(port, "why-bitcoin", "research", "run-research");
    if (view.kind !== "research" || view.data.face !== "notebook") throw new Error("not the notebook face");
    expect(view.data.cards.length).toBeGreaterThan(20);
    const c = await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: view.rev, op: { op: "confirm-scope" } }));
    expect(c.verdict.state).toBe("ready");
    const s = await confirm(port, "why-bitcoin", "script", "compose-candidates");
    if (s.view.kind !== "script" || s.view.data.face !== "document") throw new Error("not the document face");
    expect(s.view.data.candidates.length).toBe(3);
    const jobs = await must(list(store));
    expect(jobs.map((j) => [j.producer, j.state])).toEqual([["research", "done"], ["script", "done"]]);
  });

  it("another topic's dry run lands no notebook - never Bitcoin's - and the job still ends done", async () => {
    const { port } = universe("film/short-educational-video", "glass-harbor");
    const { view } = await confirm(port, "glass-harbor", "research", "run-research");
    expect(view.verdict).toMatchObject({ state: "empty", codes: [{ code: "no-notebook" }] });
  });

  it("follow-ups are one turn each: a transcribed question returns its revision (dry), another stays unanswered", async () => {
    const { port } = universe("film/short-educational-video", "why-bitcoin");
    const { view } = await confirm(port, "why-bitcoin", "research", "run-research");
    let rev = view.rev;
    rev = (await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: rev, op: { op: "queue-follow-up", prompt: "who are the whale holders?" } }))).rev;
    await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: rev, op: { op: "queue-follow-up", prompt: "what does the weather do?" } }));
    const r = await confirm(port, "why-bitcoin", "research", "follow-up");
    if (r.view.kind !== "research" || r.view.data.face !== "notebook") throw new Error("not the notebook face");
    expect(r.view.data.followUps.map((q) => q.status)).toEqual(["returned", "unanswered"]);
  });

  it("recalibrate stages a version from the notes (dry: v1's own transform), and its guard refuses with no note", async () => {
    const { port } = universe("film/short-educational-video", "why-bitcoin");
    const run = await confirm(port, "why-bitcoin", "research", "run-research");
    const c = await applied(port.opPart({ projectId: "why-bitcoin", key: "research", baseRev: run.view.rev, op: { op: "confirm-scope" } }));
    expect(c.verdict.state).toBe("ready");
    const s = await confirm(port, "why-bitcoin", "script", "compose-candidates");
    const none = await port.actReceipt({ projectId: "why-bitcoin", key: "script", act: "recalibrate" });
    expect(none.ok ? "" : none.error.message).toBe("recalibrate needs a note");
    if (run.view.kind !== "research" || run.view.data.face !== "notebook") throw new Error("not the notebook face");
    const card = run.view.data.cards.find((x) => x.scope === "in")?.id ?? "";
    const noted = await applied(port.opPart({ projectId: "why-bitcoin", key: "script", baseRev: s.view.rev, op: { op: "note-add", cardId: card, kind: "more-focus" } }));
    expect(noted.rev).toBeGreaterThan(s.view.rev);
    const r = await confirm(port, "why-bitcoin", "script", "recalibrate");
    if (r.view.kind !== "script" || r.view.data.face !== "document") throw new Error("not the document face");
    expect(r.view.data.staged?.label).toMatch(/^Version \d+$/);
  });
});
