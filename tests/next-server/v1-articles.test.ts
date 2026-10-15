import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectArticles, readArticles, type ArticlesSnapshot } from "../../lib/ledger/v1/sources/articles.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The article adapter over literal run.json records (lib/articles/types.ts
// ArticleRun), and its reader over a temp store with a `.driver` lease.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
type Run = ArticlesSnapshot["runs"][number]["run"];
type Step = Run["steps"][number];
const step = (name: Step["name"], startedAt: string, endedAt?: string, costUsd?: number): Step => ({
  name,
  status: endedAt === undefined ? "running" : "done",
  startedAt,
  ...(endedAt === undefined ? {} : { endedAt }),
  ...(costUsd === undefined ? {} : { costUsd }),
});
const run = (over: Partial<Run> = {}): Run => ({
  id: "2026-10-14-two-clock-records",
  status: "drafting",
  topic: { kind: "subject", bundle: "software-engineering", subject: "two-clock-records" },
  model: "claude-opus-5",
  steps: [step("research", "2026-10-14T10:00:00.000Z", "2026-10-14T10:09:00.000Z", 0.4), step("outline", "2026-10-14T10:09:00.000Z", "2026-10-14T10:12:00.000Z"), step("draft", "2026-10-14T10:12:00.000Z")],
  createdAt: "2026-10-14T10:00:00.000Z",
  ...over,
});
const snap = (runs: ArticlesSnapshot["runs"]): ArticlesSnapshot => ({ runs, skipped: [] });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("articles projection", () => {
  it("counts the facts it projects; a landed run's landing is `land`, not a status line", () => {
    const landed = run({ id: "landed", status: "landed", approval: { at: "2026-10-14T12:00:00.000Z", patches: [] }, landedAt: "2026-10-14T12:20:00.000Z", landing: { slug: "s", branch: "b" } });
    const p = projectArticles(snap([{ run: run(), driving: true }, { run: landed, driving: false }]), ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "run.start": 2, "step.start": 6, "step.end": 4, "run.status": 1, "verdict.approve": 1, land: 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
  });

  it("a reworked draft is a second fact, not the first one's duplicate: steps key by name AND start", () => {
    const first = projectArticles(snap([{ run: run(), driving: true }]), ctx()).events.filter((e) => e.type === "step.start");
    const reworked = run({ steps: [...run().steps.slice(0, 2), step("draft", "2026-10-14T15:00:00.000Z")], rework: { at: "2026-10-14T14:59:00.000Z", note: "lead with the failure", count: 1 } });
    const second = projectArticles(snap([{ run: reworked, driving: true }]), ctx()).events;
    const drafts = [...first, ...second.filter((e) => e.type === "step.start")].filter((e) => e.data["step"] === "draft").map((e) => e.key);
    expect(new Set(drafts).size).toBe(2);
    expect(second.find((e) => e.type === "rework")).toMatchObject({ key: "articles:2026-10-14-two-clock-records:rework.1", atSrc: "recorded", occurredAt: "2026-10-14T14:59:00.000Z" });
  });

  it("never projects updatedAt: re-projecting later moves only the observed status", () => {
    const a = projectArticles(snap([{ run: run(), driving: true }]), ctx()).events;
    const b = projectArticles(snap([{ run: run(), driving: true }]), ctx("2026-10-16T00:00:00.000Z")).events;
    expect(b.map((e) => e.key)).toEqual(a.map((e) => e.key));
    expect(b.filter((e, i) => e.occurredAt !== a[i]?.occurredAt).map((e) => e.type)).toEqual(["run.status"]);
  });

  it("a working status with a live driver runs; without one it is /articles' `stalled`, here interrupted", () => {
    const p = projectArticles(snap([{ run: run({ id: "driven" }), driving: true }, { run: run({ id: "dead", status: "researching" }), driving: false }, { run: run({ id: "done", status: "rejected" }), driving: false }]), ctx());
    expect(p.live.map((j) => [j.id, j.state, j.lane, j.media, j.progress?.done, j.progress?.stage])).toEqual([
      ["driven", "running", "seat.text", "article", 2, "draft"],
      ["dead", "interrupted", "seat.text", "article", 2, "draft"],
    ]);
    expect(p.live[1]?.error).toMatch(/^stalled: /);
  });

  it("a run awaiting approval is a gate pile since its last step ended", () => {
    const gate = run({ status: "awaiting-approval", steps: [step("research", "2026-10-14T10:00:00.000Z", "2026-10-14T10:09:00.000Z"), step("check", "2026-10-14T11:00:00.000Z", "2026-10-14T11:01:00+00:00")] });
    expect(projectArticles(snap([{ run: gate, driving: false }]), ctx()).weir).toEqual([
      { source: "articles", id: "2026-10-14-two-clock-records", title: "article two-clock-records", media: "article", kind: "gate", since: "2026-10-14T11:01:00.000Z", decided: 0, pending: 1, href: "/articles" },
    ]);
  });
});

describe("articles reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-articles-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const put = (id: string, file: string, body: string) => {
    mkdirSync(path.join(root, id), { recursive: true });
    writeFileSync(path.join(root, id, file), body);
  };

  it("reads each run and its driver at the given root; a drifted run is skipped with the door's words", async () => {
    put("a-driven", "run.json", JSON.stringify({ ...run({ id: "a-driven" }), updatedAt: "x", effort: "high" }));
    put("a-driven", ".driver", JSON.stringify({ pid: process.pid, at: "2026-10-14T10:00:00.000Z" }));
    put("b-dead", "run.json", JSON.stringify(run({ id: "b-dead" })));
    put("b-dead", ".driver", JSON.stringify({ pid: 2 ** 22 + 17 }));
    put("c-bad", "run.json", JSON.stringify({ ...run({ id: "c-bad" }), status: "exploded" }));
    put("Not_An_Id", "run.json", "{}");
    const r = await readArticles(root);
    if (!r.ok) throw r.error;
    expect(r.value.runs.map((x) => [x.run.id, x.driving]).sort()).toEqual([
      ["a-driven", true],
      ["b-dead", false],
    ]);
    expect(r.value.skipped).toEqual([{ id: "c-bad", reason: expect.stringMatching(/^article run c-bad: status: /) }]);
  });
});
