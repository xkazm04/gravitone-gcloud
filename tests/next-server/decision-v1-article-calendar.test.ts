// APPROVE -> CALENDAR FOR AN ARTICLE (Phase 6, owner ruling 4; lib/decision/v1/sources/articleSlot.ts):
// the kept post's schedule rides on its decision's note, the commit's apply puts the run's blog
// slot on the kernel calendar BEFORE v1's approve starts the landing, and the landing's pull
// request publishes that slot through publishByAct. The engine runs on the stub agent and `gh` is
// the stub (tests/golden-path/_articles.ts): nothing spends, no real pull request is opened.
//
// Pinned: the preview names the slot and its hour; a schedule changed after the preview makes the
// commit stale; the slot exists when the landing is launched; a redelivery makes no second slot
// and launches nothing twice; the PR is the publication (its number, its url); a slot the sweep
// read missed while the landing was late still ends published; a calendar line that does not read
// is refused at the preview, never taken as "no schedule".

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import path from "node:path";

import { err, ok } from "@gt/domain/errors";
import { commit } from "@gt/kernel/decision/commit";
import { getSlot, listSlots, publicationOfIn } from "@gt/kernel/slots/read";
import { sweep } from "@gt/kernel/slots/sweep";
import { createSlot } from "@gt/kernel/slots/write";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { encodeSchedule } from "@gt/ui/components/review/schedule.ts";

import { blogScheduleOf, blogSlotId, ensureBlogSlot, landBlogSlot, prNumberOf } from "../../lib/decision/v1/sources/articleSlot.ts";
import { makeArticleAdapter } from "../../lib/decision/v1/sources/article.ts";
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
let current: Store | undefined;
/** What the launch saw: the run, and whether its blog slot was already on the calendar. */
const launched: { id: string; slotted: boolean }[] = [];
const adapter = makeArticleAdapter({
  engine: deps,
  store: () => (current === undefined ? err("unavailable", "no store yet") : ok(current)),
  launch: (id) => {
    launched.push({ id, slotted: current !== undefined && getSlot(current, blogSlotId(id)).ok });
  },
});
const blobDir = () => path.join(box.dir, "blobs");
const machine = { kind: "machine", id: "test" } as const;

async function atGate(text: string): Promise<ArticleRun> {
  const run = await createRun({ topic: { kind: "free", text } }, deps());
  const r = await driveRun(run.id, deps());
  expect(r.status, r.error).toBe("awaiting-approval");
  return r;
}

describe("pure", () => {
  it("a post with no calendar line is proposed the day after its COMMIT at 08:00 UTC; a line that does not read is refused", () => {
    expect(must(blogScheduleOf(undefined, "2026-10-17T21:40:00.000Z"))).toEqual({ channel: "blog", publishAt: "2026-10-18T08:00:00.000Z" });
    expect(must(blogScheduleOf(encodeSchedule({ channel: "blog", publishAt: "2026-10-20T09:30:00.000Z", notes: "§2 remove: x" }), "2026-10-17T21:40:00.000Z"))).toEqual({ channel: "blog", publishAt: "2026-10-20T09:30:00.000Z", notes: "§2 remove: x" });
    const yt = blogScheduleOf(encodeSchedule({ channel: "youtube", publishAt: "2026-10-20T09:30:00.000Z" }), "2026-10-17T21:40:00.000Z");
    expect(yt.ok ? "ok" : yt.error.message).toBe("an article goes out by its pull request on blog, not on youtube");
    const bad = blogScheduleOf("calendar: blog tomorrow", "2026-10-17T21:40:00.000Z");
    expect(bad.ok ? "ok" : `${bad.error.code}: ${bad.error.message}`).toBe('invalid: calendar: "tomorrow" is not an ISO instant');
  });

  it("the pull request's number is its platform id", () => {
    expect(prNumberOf("https://example.invalid/xkazm04/ai-registry/pull/17")).toBe("17");
    expect(prNumberOf("https://example.invalid/xkazm04/ai-registry/pull/17/files")).toBe("17");
    expect(prNumberOf("https://example.invalid/xkazm04/ai-registry/pulls")).toBeUndefined();
  });
});

describe("an approved article on the calendar", () => {
  it("is slotted before its landing starts, once, and published by the pull request even after the sweep read it missed", { timeout: 240_000 }, async () => {
    const run = await atGate("the calendar tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    current = flow.store;
    const at = "2026-10-20T09:30:00.000Z";
    flow.patch([
      { candidate: "post", verdict: "keep", note: encodeSchedule({ channel: "blog", publishAt: at }) },
      { candidate: "patch/p1", verdict: "reject" },
      { candidate: "patch/p2", verdict: "reject" },
    ]);
    const c = must(flow.preview()).consequence;
    expect(c.writes[0]).toMatchObject({ kind: "index-row", target: "calendar · blog · 20 Oct 09:30 UTC", candidate: "post", detail: `slot article:${run.id}, out with the pull request` });
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    // The slot was on the calendar when the landing was handed over.
    expect(launched.filter((l) => l.id === run.id)).toEqual([{ id: run.id, slotted: true }]);
    const slot = must(getSlot(flow.store, blogSlotId(run.id))).slot;
    expect(slot).toMatchObject({ libraryItemId: `article:${run.id}`, channel: "blog", at, state: "scheduled", description: "ai-registry PR · free topic", tags: [] });
    // Redelivered before the landing: the same slot. v1's adapter enqueues the landing again
    // while the run still waits on it (idempotent by job id in the app), and the slot was there.
    must(await adapter.apply(claim));
    expect(must(listSlots(flow.store)).length).toBe(1);
    expect(launched.filter((l) => l.id === run.id)).toEqual([{ id: run.id, slotted: true }, { id: run.id, slotted: true }]);
    // Nothing published it before the PR exists.
    expect(must(landBlogSlot(flow.store, await readRun(run.id), machine, Date.now()))).toEqual({ kind: "waiting" });

    // The worker was down past the window: the sweep reads the slot missed.
    must(sweep(flow.store, { now: Date.parse(at) + 2 * 3_600_000, windowMs: 3_600_000, wired: new Set(["blog"]), itemExists: () => true }, { claim: false }));
    expect(must(getSlot(flow.store, blogSlotId(run.id))).slot.state).toBe("missed");

    const landed = await driveRun(run.id, deps());
    expect(landed.status, landed.error).toBe("landed");
    const out = must(landBlogSlot(flow.store, landed, machine, Date.now()));
    expect(out.kind).toBe("published");
    const after = must(getSlot(flow.store, blogSlotId(run.id))).slot;
    expect(after.state).toBe("published");
    const pub = must(flow.store.read((r) => publicationOfIn(r, after.id)));
    expect(pub).toMatchObject({ channel: "blog", platformId: "1", url: "https://example.invalid/xkazm04/ai-registry/pull/1", dry: false });
    expect(pub?.visibility).toBeUndefined();
    // Landing again and redelivering the apply both find the publication; nothing is launched.
    expect(must(landBlogSlot(flow.store, landed, machine, Date.now()))).toEqual(out);
    must(await adapter.apply(claim));
    expect(must(listSlots(flow.store)).map((r) => r.slot.state)).toEqual(["published"]);
    expect(launched.filter((l) => l.id === run.id)).toHaveLength(2);
  });

  it("a schedule changed after the preview makes the commit stale; a calendar line that does not read is refused at the preview", { timeout: 120_000 }, async () => {
    const run = await atGate("the stale tax");
    const flow = await openFlow(adapter, run.id, blobDir());
    current = flow.store;
    const rest = [
      { candidate: "patch/p1", verdict: "reject" as const },
      { candidate: "patch/p2", verdict: "reject" as const },
    ];
    flow.patch([{ candidate: "post", verdict: "keep", note: "calendar: blog soon" }, ...rest]);
    const bad = flow.preview();
    expect(bad.ok ? "ok" : `${bad.error.code}: ${bad.error.message}`).toBe('invalid: calendar: "soon" is not an ISO instant');
    flow.patch([{ candidate: "post", verdict: "keep", note: encodeSchedule({ channel: "blog", publishAt: "2026-10-21T08:00:00.000Z" }) }]);
    const seen = must(flow.preview());
    flow.patch([{ candidate: "post", verdict: "keep", note: encodeSchedule({ channel: "blog", publishAt: "2026-10-22T08:00:00.000Z" }) }]);
    const stale = must(flow.store.tx((t) => commit(t, { ...operator, packetId: flow.plan.packet.id, ticket: "ticket-stale", token: seen.consequence.token, v1Digest: seen.v1Digest })));
    expect(stale.ok ? "ok" : `${stale.error.code}/${stale.error.detail ?? ""}`).toBe("conflict/stale-preview");
    expect(must(listSlots(flow.store))).toEqual([]);
  });
});

describe("the blog slot's identity", () => {
  const input = (runId: string) => ({ runId, title: "t", description: "d", tags: [], schedule: { channel: "blog" as const, publishAt: "2026-10-20T09:30:00.000Z" } });

  it("a second ensure finds the first slot; a slot of that id holding another item is a conflict, never 'already done'", () => {
    const store = must(openKernel(":memory:")).store;
    const a = must(ensureBlogSlot(store, input("r-1"), machine));
    expect(must(ensureBlogSlot(store, input("r-1"), machine)).slot.id).toBe(a.slot.id);
    expect(must(listSlots(store))).toHaveLength(1);
    must(createSlot(store, { id: blogSlotId("r-2"), libraryItemId: "article:someone-else", channel: "blog", at: "2026-10-20T09:30:00.000Z", title: "t", description: "", tags: [] }, machine));
    const clash = ensureBlogSlot(store, input("r-2"), machine);
    expect(clash.ok ? "ok" : `${clash.error.code}: ${clash.error.message}`).toBe("conflict: slot sl-art-r-2 holds article:someone-else on blog, not article r-2 on blog");
  });
});
