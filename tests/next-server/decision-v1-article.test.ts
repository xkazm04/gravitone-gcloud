// THE ARTICLE DECISION ADAPTER (lib/decision/v1/sources/article.ts) over a REAL
// run at the gate: the article engine drives a run to `awaiting-approval` with
// the stub agent v1's own probes use (tests/golden-path/_articles.ts: a
// throwaway registry clone with a bare origin, `gh` a stub that logs), so the
// approve case lands for real - a branch pushed to the THROWAWAY origin and a PR
// requested of the stub - and nothing leaves this machine.
//
// What is pinned: the packet is the post and its patches; the preview names the
// outward acts before the commit; approve lands exactly the kept patches; a
// reject writes v1's note; a return renders the edit plan as reworkRun's note;
// every apply is idempotent on run.json, and v1 holding another outcome is
// refused.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { returnPacket } from "@gt/kernel/decision/commit";
import type { PacketId } from "@gt/domain/ids";

import { makeArticleAdapter, reworkNote, sectionsOf } from "../../lib/decision/v1/sources/article.ts";
import { createRun, defaultDeps, driveRun } from "../../lib/articles/engine.ts";
import { readRun } from "../../lib/articles/store.ts";
import type { ArticleRun } from "../../lib/articles/types.ts";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "../golden-path/_articles.ts";
import { must, openFlow, operator } from "./decision-v1-harness.ts";

const saved = new Map(ARTICLE_ENV.map((k) => [k, process.env[k]]));
let box: ArticleSandbox;
beforeAll(() => {
  box = articleSandbox();
});
afterAll(() => {
  box.cleanup();
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const deps = () => defaultDeps({ render: false });
const drives: Promise<ArticleRun>[] = [];
const launched: string[] = [];
const adapter = makeArticleAdapter({
  engine: deps,
  launch: (id) => {
    launched.push(id);
    drives.push(driveRun(id, deps()));
  },
});
const blobDir = () => path.join(box.dir, "blobs");

async function atGate(text: string): Promise<ArticleRun> {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  const r = await driveRun(run.id, deps());
  expect(r.status, r.error).toBe("awaiting-approval");
  return r;
}

describe("pure", () => {
  it("cuts post.md at its ## headings; a heading is its section's id, repeats are told apart", () => {
    expect(sectionsOf("# Title\n\nAn opening.\n\n## Why\nbecause\n\n## Why\nagain\n## Sources\n1. x")).toEqual([
      { id: "Opening", heading: "Opening", text: "An opening." },
      { id: "Why", heading: "Why", text: "because" },
      { id: "Why (2)", heading: "Why", text: "again" },
      { id: "Sources", heading: "Sources", text: "1. x" },
    ]);
  });

  it("an edit plan renders as reworkRun's one note, and a note over v1's bound is refused, never cut", () => {
    expect(must(reworkNote([{ section: "Why", directive: "more_weight", text: "the bill" }, { section: "Opening", directive: "free_text", text: "start cold" }]))).toBe('In "Why" - give it more weight: the bill\n\nIn "Opening": start cold');
    const long = reworkNote([{ section: "Why", directive: "remove", text: "x".repeat(1990) }]);
    expect(long.ok ? "ok" : long.error.message).toMatch(/^a rework note is at most 2000 characters; this one is \d+$/);
  });
});

describe("a run at the gate", () => {
  it("is the post and each registry patch, with the check, the reviewers and the sections the desk draws", { timeout: 120_000 }, async () => {
    const run = await atGate("the packet tax");
    const plan = must(adapter.packet(must(await adapter.read({ runId: run.id }))));
    expect(plan.packet).toMatchObject({ id: `pkt:article:${run.id}`, source: "article", lane: "article", mode: "packet-review", runId: run.id });
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([["post", "post"], ["patch/p1", "patches"], ["patch/p2", "patches"]]);
    expect(plan.initial).toEqual([]);
    expect(plan.losses).toEqual([]);
    const review = plan.present.review;
    expect(review?.sections.length).toBeGreaterThan(1);
    expect(review?.checks.length).toBeGreaterThan(0);
    expect(review?.reviewers.map((r) => r.who).sort()).toHaveLength(4);
    expect(review?.turn).toBe(1);
    expect(plan.present.oracle?.summary).toMatch(/^check: \d+ fail · \d+ not measured · \d+ pass$/);
    expect(plan.urls["post"]).toBe(`/api/articles/${run.id}/file/post/index.html`);
    expect(plan.urls["patch/p1"]).toBe(`/api/articles/${run.id}/file/patches/p1.patch`);
  });

  it("approve: the preview names the push and the PR; the apply lands the kept patch only, once", { timeout: 180_000 }, async () => {
    process.env["STUB_GH_LOG"] = path.join(box.dir, "gh.log");
    const run = await atGate("the token tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    flow.patch([
      { candidate: "post", verdict: "keep" },
      { candidate: "patch/p1", verdict: "keep" },
    ]);
    // A commit refuses while a patch is undecided: nothing is declined unseen.
    const early = flow.commit();
    expect(early.ok ? "ok" : early.error.message).toMatch(/undecided/);
    flow.patch([{ candidate: "patch/p2", verdict: "reject" }]);
    const c = must(flow.preview()).consequence;
    expect(c.outward.map((o) => o.kind)).toEqual(["push", "pull-request"]);
    expect(c.outward[0]?.sentence).toMatch(/^push branch article\/[a-z0-9-]+ to ai-registry's origin/);
    expect(c.writes.map((w) => w.candidate)).toEqual(["post", "post", "patch/p1"]);
    must(flow.commit());
    const before = launched.length;
    const claim = flow.claim();
    must(await adapter.apply(claim));
    expect(launched.length).toBe(before + 1);
    const landed = await drives[drives.length - 1];
    expect(landed?.status, landed?.error).toBe("landed");
    expect(landed?.approval?.patches).toEqual(["p1"]);
    const branch = landed?.landing?.branch ?? "";
    expect(execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: box.origin, encoding: "utf8" }).trim()).toMatch(/^[0-9a-f]{40}$/);
    expect(readFileSync(path.join(box.dir, "gh.log"), "utf8")).toMatch(/"pr","create"/);
    // Redelivered after the landing: v1 holds this very approval, so nothing is written or launched again.
    must(await adapter.apply(claim));
    expect(launched.length).toBe(before + 1);
  });

  it("reject: v1's note carries the reasons line; a redelivery is a no-op; an approval v1 holds is refused", { timeout: 120_000 }, async () => {
    const run = await atGate("the reject tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    flow.patch([
      { candidate: "post", verdict: "reject", reasons: ["depth", "truth"], note: "thin on numbers" },
      { candidate: "patch/p1", verdict: "reject" },
      { candidate: "patch/p2", verdict: "reject" },
    ]);
    expect(must(flow.preview()).consequence.outward).toEqual([]);
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    const after = await readRun(run.id);
    expect(after.status).toBe("rejected");
    expect(after.rejection?.note).toBe("reasons: depth, truth\nthin on numbers");
    const bytes = readFileSync(path.join(box.store, run.id, "run.json"), "utf8");
    must(await adapter.apply(claim));
    expect(readFileSync(path.join(box.store, run.id, "run.json"), "utf8")).toBe(bytes);
  });

  it("a reject with neither reason nor note is refused at the preview, before any commit", { timeout: 120_000 }, async () => {
    const run = await atGate("the silent tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    flow.patch([
      { candidate: "post", verdict: "reject" },
      { candidate: "patch/p1", verdict: "reject" },
      { candidate: "patch/p2", verdict: "reject" },
    ]);
    const p = flow.preview();
    expect(p.ok ? "ok" : `${p.error.code}: ${p.error.message}`).toBe("invalid: a rejection needs a reason or a note");
  });

  it("v1 deciding the run on its page first: the apply is refused, never overwrites", { timeout: 120_000 }, async () => {
    const run = await atGate("the raced tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    flow.patch([
      { candidate: "post", verdict: "keep" },
      { candidate: "patch/p1", verdict: "reject" },
      { candidate: "patch/p2", verdict: "reject" },
    ]);
    must(flow.commit());
    const { rejectRun } = await import("../../lib/articles/engine.ts");
    await rejectRun(run.id, "decided on the page", deps());
    const r = await adapter.apply(flow.claim());
    expect(r.ok ? "ok" : r.error.code).toBe("refused");
    expect((await readRun(run.id)).status).toBe("rejected");
  });

  it("return: the edit plan becomes reworkRun's note and the drive restarts; a redelivery reworks nothing twice", { timeout: 180_000 }, async () => {
    const run = await atGate("the rework tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    const plan = [{ section: "Opening", directive: "less_weight" as const, text: "shorter" }];
    const rev = must(flow.store.read((r) => r.get("SELECT rev FROM packets WHERE id = ?", flow.plan.packet.id)))?.["rev"];
    must(flow.store.tx((t) => returnPacket(t, { ...operator, packetId: flow.plan.packet.id as PacketId, baseRev: Number(rev), ticket: "return-1", plan })));
    const claim = flow.claim();
    const before = launched.length;
    must(await adapter.apply(claim));
    expect(launched.length).toBe(before + 1);
    const back = await drives[drives.length - 1];
    expect(back?.status).toBe("awaiting-approval");
    expect(back?.rework).toMatchObject({ count: 1, note: 'In "Opening" - give it less weight: shorter' });
    must(await adapter.apply(claim));
    expect((await readRun(run.id)).rework?.count).toBe(1);
    expect(launched.length).toBe(before + 1);
    expect(existsSync(path.join(box.store, run.id, "rework", "1", "before"))).toBe(true);
  });
});
