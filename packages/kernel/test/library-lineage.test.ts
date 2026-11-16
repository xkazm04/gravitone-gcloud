import { afterEach, describe, expect, it } from "vitest";
import { libraryItemSchema, type LibraryItemInput } from "@gt/domain/libraryItem";
import { facetsOf, LINEAGE_GROUPS, narrowsKinds, type IndexContext, type LibraryEntry } from "../src/library/core.ts";
import { libraryDetail, resolveLineage } from "../src/library/detail.ts";
import { countMadeBy, queryLibrary } from "../src/library/query.ts";
import { upsertItems } from "../src/library/write.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { Store } from "../src/store.ts";
import { must } from "./helpers.ts";

// Lineage both ways (spark fable-ten, package D): an item names the kernel job that made it, the
// detail links that job only while the kernel holds it, and the index answers "what job X made"
// as a facet - filtered, counted, and narrowing the kind counts as a shared group does.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});
function store(): Store {
  const k = must(openKernel(":memory:"));
  open.push(k);
  return k.store;
}
const CTX: IndexContext = { styleOf: () => undefined };
const SHA = (c: string): string => c.repeat(64);
const JOB = "job:part:harbor:cut";

function made(id: string, kind: "image" | "video", jobs: readonly string[], sha: string): LibraryEntry {
  const shared = {
    id,
    title: `Made ${id}`,
    state: "unjudged",
    collections: [],
    origin: "studio",
    rights: { use: "publishable" },
    source: "real",
    lineage: [...jobs.map((j) => ({ kind: "job" as const, id: j })), { kind: "project" as const, id: "harbor" }],
    media: { sha256: sha, bytes: 10, mime: kind === "video" ? "video/mp4" : "image/png" },
    at: "2026-11-01T00:00:00.000Z",
  };
  const item = kind === "video" ? { ...shared, kind, vocabulary: { format: "film", captions: "none" } } : { ...shared, kind, vocabulary: { set: "cut", styles: [] } };
  return { item: item as LibraryItemInput, meta: "cut", extras: {}, feed: "test" };
}

/** A job row as the kernel holds it: only its id is what the lineage door asks about. */
function holdJob(s: Store, id: string): void {
  must(s.tx((t) => t.run("INSERT INTO jobs (id, lane, state, record) VALUES (?, 'cpu', 'done', '{}')", id)));
}

const runsOf = (id: string): string => `/projects/runs?job=${encodeURIComponent(`kernel:${id}`)}`;

describe("a job in an item's lineage", () => {
  it("is a door to Runs while the kernel holds the job, and text when it does not", () => {
    const s = store();
    holdJob(s, JOB);
    must(upsertItems(s, [made("v1", "video", [JOB, "job:gone"], SHA("a"))], CTX));
    const nodes = must(libraryDetail(s, "v1", { job: runsOf })).lineage;
    expect(nodes.map((n) => [n.role, n.ref.id, n.href ?? null])).toEqual([
      ["job", JOB, runsOf(JOB)],
      ["job", "job:gone", null],
      ["this", "v1", null],
      ["used by", "harbor", null],
    ]);
  });
  it("is text when the caller names no page for a job", () => {
    const s = store();
    holdJob(s, JOB);
    must(upsertItems(s, [made("v1", "video", [JOB], SHA("a"))], CTX));
    expect(must(libraryDetail(s, "v1")).lineage[0]?.href).toBeUndefined();
  });
  it("resolves the same way on the pure path the fixture uses", () => {
    const item = libraryItemSchema.parse({ ...made("v1", "video", [JOB], SHA("a")).item, lineage: [{ kind: "job", id: JOB }] });
    expect(resolveLineage(item, () => undefined, (id) => (id === JOB ? "/runs-here" : undefined))[0]?.href).toBe("/runs-here");
    expect(resolveLineage(item, () => undefined, () => undefined)[0]?.href).toBeUndefined();
  });
});

describe("what a job made, as a facet", () => {
  it("is a lineage group the index files from the lineage, never a rail group", () => {
    expect(LINEAGE_GROUPS).toEqual(["job"]);
    expect(narrowsKinds("job") && narrowsKinds("run") && !narrowsKinds("mood")).toBe(true);
    const rows = facetsOf(libraryItemSchema.parse(made("v1", "video", [JOB], SHA("a")).item), CTX);
    expect(rows.filter((f) => f.grp === "job")).toEqual([{ grp: "job", value: JOB, label: JOB }]);
  });
  it("filters to the job's items, counts them, and narrows the kind counts", () => {
    const s = store();
    must(upsertItems(s, [made("v1", "video", [JOB], SHA("a")), made("i1", "image", [JOB], SHA("b")), made("i2", "image", ["job:other"], SHA("c"))], CTX));
    const page = must(queryLibrary(s, { facets: { job: [JOB] }, limit: 10 }));
    expect(page.items.map((r) => r.id).sort()).toEqual(["i1", "v1"]);
    expect(page.total).toBe(2);
    expect([page.kindCounts.all, page.kindCounts.image, page.kindCounts.video]).toEqual([2, 1, 1]);
    // No rail group is drawn for it: an address, not a vocabulary.
    expect(page.groups.some((g) => g.key === "job")).toBe(false);
    // Under a kind, with the search text too.
    expect(must(queryLibrary(s, { kind: "image", q: "made", facets: { job: [JOB] }, limit: 10 })).items.map((r) => r.id)).toEqual(["i1"]);
    expect(must(countMadeBy(s, "job", JOB))).toBe(2);
    expect(must(countMadeBy(s, "job", "job:nothing"))).toBe(0);
  });
  it("is refused as a filter of a group the index does not hold", () => {
    const s = store();
    const r = queryLibrary(s, { facets: { jobs: ["x"] }, limit: 1 });
    expect(r.ok).toBe(false);
  });
});
