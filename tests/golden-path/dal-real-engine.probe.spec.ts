// LANE — REPO-TESTING AGAINST A REAL ENGINE (dynamic).
//
// Registry: data-access / repo-testing.
//
// WHAT WAS MISSING. Every one of this repo's probes was Node-context and not one
// of them opened a database. lib/studioDb.ts is the whole persistence layer —
// four stores, three indexes, an upgrade path, a versionchange handler and a
// hand-written error classifier — and its round-trip fidelity was asserted
// nowhere. So was the load-bearing STRING COUPLING between studioDb's own
// rejection text and stepStore's `classify()`, which is the only thing that turns
// a two-tab version mismatch into the `blocked` kind the notification bell knows
// how to explain. A rename on either side would have broken it silently and no
// test anywhere would have noticed.
//
// `fake-indexeddb` is a real implementation of the IndexedDB specification, not a
// mock of this repo's calls: it runs the actual `openDb`, the actual upgrade
// callbacks, the actual index queries and the actual transaction semantics —
// including abort-on-error, which is what several of the guarantees below rest
// on. What it is NOT is Chrome: quota behaviour and the browser's own
// `QuotaExceededError` are out of reach here and stay so, and the probe says so
// rather than implying coverage it does not have.
//
// The import below has a SIDE EFFECT — it installs the engine on globalThis
// before any module under test reads `indexedDB` — so it must come first, and it
// must be the `auto` entry point.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";
import {
  ASSETS_STORE,
  BY_PROJECT,
  BY_UID,
  PROJECTS_STORE,
  STEPS_STORE,
  THEMES_STORE,
  deleteByIndex,
  getByIndex,
  getKeysByIndex,
  getRecord,
  openDb,
  runTx,
} from "@/lib/studioDb";
import {
  loadStep,
  readStep,
  saveStep,
  __resetSaveSlots,
} from "@/app/_phases/_shared/stepStore";
import { evictIdentity } from "@/lib/identityEviction";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Wipe every store between tests, through the real engine, so one probe's rows
 *  are never another's fixture. */
async function clearAll() {
  const db = await openDb();
  await runTx(db, [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE], "readwrite", (_s, tx) => {
    for (const name of [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE])
      tx.objectStore(name).clear();
  });
}

const project = (id: string, uid: string) => ({ id, uid, title: `Project ${id}`, updatedAt: 1 });

test.beforeEach(async () => {
  __resetSaveSlots();
  await clearAll();
});

// ── The instrument itself ───────────────────────────────────────────────────

test("engine: the database really opens, with every store and index the code declares", async () => {
  const db = await openDb();
  const stores = [...db.objectStoreNames].sort();
  console.log(`[dal] stores=${stores.join(",")}`);
  expect(stores).toEqual([ASSETS_STORE, PROJECTS_STORE, STEPS_STORE, THEMES_STORE].sort());

  // The indexes are the reason the by-uid and by-project reads are set-shaped
  // rather than per-id loops, so their existence is part of the contract.
  const tx = db.transaction([...db.objectStoreNames], "readonly");
  expect([...tx.objectStore(PROJECTS_STORE).indexNames]).toContain(BY_UID);
  expect([...tx.objectStore(THEMES_STORE).indexNames]).toContain(BY_UID);
  expect([...tx.objectStore(ASSETS_STORE).indexNames]).toContain(BY_UID);
  expect([...tx.objectStore(STEPS_STORE).indexNames]).toContain(BY_PROJECT);
  tx.abort();
});

// ── Round-trip fidelity ─────────────────────────────────────────────────────

test("round-trip: what goes in comes back out, through the real store", async () => {
  const data = {
    topic: "Why Bitcoin price does not rise",
    researched: true,
    nested: { a: [1, 2, 3], b: { c: "deep" } },
    when: new Date(1_700_000_000_000),
  };
  const save = await saveStep("p1", "research", data);
  expect(save.ok).toBe(true);

  const read = await readStep<typeof data & { savedAt: number }>("p1", "research");
  expect(read.ok).toBe(true);
  if (!read.ok) return;
  console.log(`[dal] round-trip savedAt=${typeof read.data?.savedAt}`);
  expect(read.data?.topic).toBe(data.topic);
  // Structured clone, not JSON: nesting survives, and so does a Date as a Date.
  expect(read.data?.nested).toEqual(data.nested);
  expect(read.data?.when instanceof Date).toBe(true);
  expect(read.data?.savedAt).toBeGreaterThan(0);
});

test("round-trip: a never-written key is told apart from a failed read", async () => {
  // These used to be the same `undefined`, and they mean opposite things: a new
  // project, versus a project whose work is on disk and out of reach.
  const r = await readStep("p-never", "script");
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.data).toBe(undefined);
  expect(await loadStep("p-never", "script")).toBe(undefined);
});

// ── The by-uid / by-project predicates ──────────────────────────────────────

test("predicates: by-uid returns THIS account's rows and no others", async () => {
  const db = await openDb();
  await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
    store.put(project("a1", "uid-a"));
    store.put(project("a2", "uid-a"));
    store.put(project("b1", "uid-b"));
  });

  const mine = await getByIndex<{ id: string }>(db, PROJECTS_STORE, BY_UID, "uid-a");
  console.log(`[dal] by-uid uid-a -> ${mine.map((p) => p.id).join(",")}`);
  expect(mine.map((p) => p.id).sort()).toEqual(["a1", "a2"]);
  expect(await getByIndex(db, PROJECTS_STORE, BY_UID, "uid-b")).toHaveLength(1);
  // An account with nothing gets an empty list, NOT everything.
  expect(await getByIndex(db, PROJECTS_STORE, BY_UID, "uid-nobody")).toEqual([]);
});

test("predicates: by-project matches the FIELD, so a prefix id cannot catch its neighbour", async () => {
  // This is the property the delete path depends on, and the stated reason the
  // query goes through the index rather than an IDBKeyRange over the
  // `${projectId}:${phase}` key. `p1` is a prefix of `p10`.
  await saveStep("p1", "research", { topic: "one" });
  await saveStep("p1", "script", { topic: "one" });
  await saveStep("p10", "research", { topic: "ten" });

  const db = await openDb();
  const p1 = await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "p1");
  const p10 = await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "p10");
  console.log(`[dal] by-project p1 -> ${p1.join(",")} | p10 -> ${p10.join(",")}`);
  expect(p1.sort()).toEqual(["p1:research", "p1:script"]);
  expect(p10).toEqual(["p10:research"]);
});

test("predicates: deleteByIndex removes exactly the keys it reported", async () => {
  await saveStep("p1", "research", { topic: "one" });
  await saveStep("p1", "script", { topic: "one" });
  await saveStep("p10", "research", { topic: "ten" });

  const db = await openDb();
  let reported: IDBValidKey[] = [];
  await runTx(db, STEPS_STORE, "readwrite", (store) => {
    deleteByIndex(store, BY_PROJECT, "p1", (keys) => {
      reported = keys;
    });
  });
  console.log(`[dal] deleteByIndex reported ${reported.length}`);
  expect(reported.sort()).toEqual(["p1:research", "p1:script"]);
  // The number a caller reports is the number the transaction acted on, not an
  // estimate from a separate read.
  expect(await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "p1")).toEqual([]);
  expect(await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "p10")).toEqual(["p10:research"]);
});

// ── Transactions are all-or-nothing ─────────────────────────────────────────

test("transactions: a multi-store write that fails commits NOTHING", async () => {
  const db = await openDb();
  await runTx(db, PROJECTS_STORE, "readwrite", (store) => store.put(project("keep", "uid-a")));

  // `add` on an id that already exists raises ConstraintError, which aborts the
  // whole transaction — so the theme written beside it must not survive either.
  let threw = false;
  try {
    await runTx(db, [PROJECTS_STORE, THEMES_STORE], "readwrite", (projects, tx) => {
      tx.objectStore(THEMES_STORE).put({ id: "t1", uid: "uid-a", name: "should not survive" });
      projects.add(project("keep", "uid-a")); // duplicate id
    });
  } catch {
    threw = true;
  }
  console.log(`[dal] aborted tx threw=${threw}`);
  expect(threw).toBe(true);
  expect(await getRecord(db, THEMES_STORE, "t1")).toBe(undefined);
});

// ── The string coupling stepStore.classify() depends on ─────────────────────

test("coupling: studioDb's own rejection text still reaches the `blocked` kind", async () => {
  // THE COUPLING. studioDb rejects a VersionError with a sentence containing
  // "another tab", and stepStore's `classify()` matches that substring to reach
  // `blocked` — the one kind the notification bell explains as a two-tab version
  // mismatch. It is the only source of those words, the match is on prose, and
  // nothing checked it. A reword on either side breaks the bell's best message
  // and degrades it silently to the generic `failed`.
  // Take EVERY sentence studioDb rejects with — not only the ones that happen to
  // contain the magic words. Searching for the words would make this probe agree
  // with itself: a reword on the studioDb side simply drops out of the match, the
  // remaining literals still classify, and the check passes while the coupling is
  // broken. (Measured: that is exactly what the first version of this test did.)
  const src = readFileSync(resolve(__dirname, "../../lib/studioDb.ts"), "utf8");
  const rejections = [...src.matchAll(/new Error\(\s*"([^"]+)"/g)].map((m) => m[1]);
  console.log(`[dal] studioDb rejects with ${rejections.length} distinct sentence(s)`);
  // Instrument assertion: a regex that stopped matching would make every claim
  // below vacuously true.
  expect(rejections.length).toBeGreaterThanOrEqual(4);

  const { reportStorageTrouble } = await import("@/app/_phases/_shared/stepStore");
  const kinds = rejections.map((s) => {
    const kind = reportStorageTrouble("write", "p1", "research", new Error(s)).kind;
    console.log(`[dal] "${s.slice(0, 44)}…" -> ${kind}`);
    return kind;
  });

  // At least one of studioDb's own sentences must still reach `blocked`, and at
  // least one `unavailable`. Those are the two kinds the bell can actually
  // EXPLAIN — "close the other tab", "this session cannot store anything" — and
  // they exist only because these sentences say what they say. Reword either and
  // the failure silently degrades to the generic `failed`, which tells the user
  // nothing and suggests nothing.
  expect(kinds).toContain("blocked");
  expect(kinds).toContain("unavailable");
  // The generic fallbacks ("write failed", "read failed", "could not open
  // storage") are SUPPOSED to be `failed` — they are the catch-alls, and this
  // probe does not demand a kind they never carried.
});

// ── The two guards added on 2026-08-24, now driven end to end ───────────────

test("latest-wins: through the REAL store, the newer keystroke is what lands", async () => {
  // The unit-level ordering rule is pinned elsewhere; this is the end-to-end
  // claim it exists for — two overlapping saves, and the one that reaches disk is
  // the later one, regardless of which finishes first.
  const slow = saveStep("p1", "script", { topic: "OLD — issued first" });
  const fast = saveStep("p1", "script", { topic: "NEW — issued second" });
  const [a, b] = await Promise.all([slow, fast]);

  const read = await readStep<{ topic: string }>("p1", "script");
  expect(read.ok).toBe(true);
  if (!read.ok) return;
  console.log(`[dal] latest-wins landed: "${read.data?.topic}" (first superseded=${"superseded" in a && a.superseded})`);
  expect(read.data?.topic).toBe("NEW — issued second");
  // The abandoned write is a SUCCESS, not a failure — nothing went wrong.
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
  expect("superseded" in a && a.superseded).toBe(true);
});

test("eviction: through the REAL store, one account's rows go and the other's stay", async () => {
  const db = await openDb();
  await runTx(db, [PROJECTS_STORE, THEMES_STORE, ASSETS_STORE], "readwrite", (projects, tx) => {
    projects.put(project("a1", "uid-a"));
    projects.put(project("a2", "uid-a"));
    projects.put(project("b1", "uid-b"));
    tx.objectStore(THEMES_STORE).put({ id: "t-a", uid: "uid-a" });
    tx.objectStore(THEMES_STORE).put({ id: "t-b", uid: "uid-b" });
    tx.objectStore(ASSETS_STORE).put({ id: "s-a", uid: "uid-a" });
  });
  await saveStep("a1", "research", { topic: "a1 research" });
  await saveStep("a2", "script", { topic: "a2 script" });
  await saveStep("b1", "research", { topic: "b1 research" });

  const report = await evictIdentity("uid-a", "signed-out");
  console.log(
    `[dal] evicted projects=${report.projects} steps=${report.steps} themes=${report.themes} assets=${report.assets}`,
  );
  expect(report.failed).toBe(false);
  expect(report.projects).toBe(2);
  // The steps half is the one that is easy to get wrong: steps are indexed by
  // PROJECT, not by uid, so they are only reachable through the project rows
  // being deleted in the same transaction.
  expect(report.steps).toBe(2);
  expect(report.themes).toBe(1);
  expect(report.assets).toBe(1);

  expect(await getByIndex(db, PROJECTS_STORE, BY_UID, "uid-a")).toEqual([]);
  expect(await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "a1")).toEqual([]);
  expect(await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "a2")).toEqual([]);
  // The other account is untouched — rows, steps and all.
  expect(await getByIndex(db, PROJECTS_STORE, BY_UID, "uid-b")).toHaveLength(1);
  expect(await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, "b1")).toEqual(["b1:research"]);
  expect(await getRecord(db, THEMES_STORE, "t-b")).not.toBe(undefined);
});

test("eviction: no orphans — nothing survives that nothing can reach", async () => {
  // The specific way a half-committed wipe hurts: an account's steps left behind
  // with no project row to find them by. No surface lists them and no future
  // eviction finds them, because the by-uid rows they were reachable through are
  // gone. So after a wipe, every remaining step must belong to a project that
  // still exists.
  const db = await openDb();
  await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
    store.put(project("a1", "uid-a"));
    store.put(project("b1", "uid-b"));
  });
  await saveStep("a1", "research", { topic: "a" });
  await saveStep("b1", "research", { topic: "b" });

  await evictIdentity("uid-a", "account-switched");

  const remainingProjects = new Set(
    (await getByIndex<{ id: string }>(db, PROJECTS_STORE, BY_UID, "uid-b")).map((p) => p.id),
  );
  const allSteps = await new Promise<{ projectId: string }[]>((resolve, reject) => {
    const req = db.transaction(STEPS_STORE, "readonly").objectStore(STEPS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as { projectId: string }[]);
    req.onerror = () => reject(req.error);
  });
  console.log(`[dal] after eviction: ${allSteps.length} step(s), ${remainingProjects.size} project(s)`);
  for (const s of allSteps) expect(remainingProjects.has(s.projectId)).toBe(true);
});
