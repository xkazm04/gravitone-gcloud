// THE REAL SIDE DRAWS AN EXPLAINER'S STRIPS (spark explainer-real-article-strips WP-B, step 6),
// through the editor's port (app/(studio)/projects/[id]/_part/real.ts) over a kernel store:
//   - a whole-part `draw-strips` is ONE receipt - the sum of every undrawn section's card - and its
//     ONE confirm fans out to one targeted job per section, each under `strip-cards` on seat.text;
//   - a targeted `draw-strips` (a section id) is one job for that card;
//   - an article adopted again leaves STRIPS with cards of sections it no longer has: the next
//     draw plans only the current sections and its landing DROPS the stale cards.
// GRAVITONE_DRY_ONLY=1 for the whole file: every receipt reads dry and every job stands in, so no
// seat and no capture can be entered here whatever the code does (the live path is
// producer-strip-cards.test.ts, on fakes).

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DIR = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-strips-real-"));
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  process.env["STRIPS_STORE_DIR"] = p.join(dir, "strips");
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["SPEND_STORE"] = "memory";
  return dir;
});

import { createHash } from "node:crypto";

import { ok, type Result } from "@gt/domain/errors";
import type { AdoptSource } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { list } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { makeRealPart } from "../../app/(studio)/projects/[id]/_part/real.ts";

afterAll(() => rmSync(DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});

const NOW = Date.parse("2026-10-24T09:00:00Z");
const ID = "ex-real";
async function must<T>(p: Result<T> | Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

const POSTS: Record<string, string> = {
  a: "# Post A\n\n## Why scarcity\n\nBitcoin is scarce by design.\n\n## How supply falls\n\nEvery four years the reward halves.\n\n## What price needs\n\nScarcity alone does not make a price.\n",
  b: "# Post B\n\n## How aqueducts work\n\nGravity carries the water.\n\n## Why the bridge\n\nThe valley is in the way.\n",
};
const articles = {
  list: async () => Object.keys(POSTS).map((id) => ({ source: "publication" as const, id, title: `Post ${id.toUpperCase()}`, sections: 0, words: 0 })),
  read: async (_source: AdoptSource, id: string) => {
    const markdown = POSTS[id];
    if (markdown === undefined) throw new Error(`no post ${id}`);
    return { title: `Post ${id.toUpperCase()}`, markdown, sha: createHash("sha256").update(markdown).digest("hex") };
  },
};

function universe(): { store: Store; port: ReturnType<typeof makeRealPart> } {
  const dir = mkdtempSync(path.join(DIR, "w-"));
  const k = openKernel(path.join(dir, "k.sqlite"));
  if (!k.ok) throw k.error;
  open.push(k.value);
  const store = k.value.store;
  const c = compose(store, { recipe: "explainer", title: "Why bitcoin" }, { kind: "operator", id: "op" }, { id: ID });
  if (!c.ok) throw c.error;
  const gates = { store: () => ok(store), blobs: () => blobStore(path.join(dir, "blobs")), now: () => NOW };
  return { store, port: makeRealPart({ store: () => ok(store), now: () => NOW, gates, articles, actWaitMs: 10_000 }) };
}

async function adopt(port: ReturnType<typeof makeRealPart>, id: string): Promise<void> {
  const view = await must(port.loadPart({ projectId: ID, key: "article" }));
  const r = await must(port.opPart({ projectId: ID, key: "article", baseRev: view.rev, op: { op: "article-adopt", source: "publication", id } }));
  if (r.kind !== "applied") throw new Error("conflict");
}

const sectionsOf = async (s: Store) => ((await must(readPart(s, { projectId: ID, partId: `${ID}/article` }))).records.get("article")?.["sections"] ?? []) as { id: string }[];
const cardsOf = async (s: Store) => ((await must(readPart(s, { projectId: ID, partId: `${ID}/strips` }))).records.get("strips")?.["cards"] ?? []) as { id: string; section: string; state: string }[];

describe("draw-strips on the real side", () => {
  it("one receipt, the sum of every card's; one confirm, one targeted strip-cards job per section", async () => {
    const { store, port } = universe();
    await adopt(port, "a");
    const sections = (await sectionsOf(store)).map((s) => s.id);
    expect(sections.length).toBe(3);
    const whole = await must(port.actReceipt({ projectId: ID, key: "strips", act: "draw-strips" }));
    expect(whole.mode).toBe("dry");
    const per = await Promise.all(sections.map((target) => must(port.actReceipt({ projectId: ID, key: "strips", act: "draw-strips", target }))));
    expect(whole.lines[0]?.usd).toBeCloseTo(per.reduce((n, r) => n + (r.lines[0]?.usd ?? 0), 0), 6);
    expect(whole.lines[0]?.usd).toBeCloseTo(3 * 2 * 3.2, 6);
    const launched = await must(port.act({ projectId: ID, key: "strips", act: "draw-strips", token: whole.token }));
    expect(launched.kind).toBe("launched");
    const jobs = await must(list(store));
    expect(jobs.map((j) => [j.producer, j.lane, j.mode.kind])).toEqual(sections.map(() => ["strip-cards", "seat.text", "dry"]));
    expect(jobs.map((j) => j.id.split(":").pop()).sort()).toEqual([...sections].sort());
    expect(jobs.every((j) => j.state === "done")).toBe(true);
    const cards = await cardsOf(store);
    expect(cards.map((c) => [c.id, c.state])).toEqual(sections.map((s) => [`card-${s}`, "pending"]));
    // A targeted draw is one job, for that card.
    const one = await must(port.actReceipt({ projectId: ID, key: "strips", act: "draw-strips", target: sections[1] }));
    await must(port.act({ projectId: ID, key: "strips", act: "draw-strips", token: one.token, target: sections[1] }));
    expect((await must(list(store))).length).toBe(4);
  });

  it("an article adopted again: the next draw plans only its sections, and its landing drops the stale cards", async () => {
    const { store, port } = universe();
    await adopt(port, "a");
    const a = (await sectionsOf(store)).map((s) => s.id);
    const first = await must(port.actReceipt({ projectId: ID, key: "strips", act: "draw-strips" }));
    await must(port.act({ projectId: ID, key: "strips", act: "draw-strips", token: first.token }));
    expect((await cardsOf(store)).map((c) => c.section)).toEqual(a);
    await adopt(port, "b");
    const b = (await sectionsOf(store)).map((s) => s.id);
    expect(b.some((s) => a.includes(s))).toBe(false);
    const second = await must(port.actReceipt({ projectId: ID, key: "strips", act: "draw-strips" }));
    expect(second.lines[0]?.label).toBe(`draw-strips · ${b.length * 4} units`);
    await must(port.act({ projectId: ID, key: "strips", act: "draw-strips", token: second.token }));
    expect((await cardsOf(store)).map((c) => c.section)).toEqual(b);
  });
});
