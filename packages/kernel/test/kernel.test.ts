import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations } from "../src/events.ts";
import { ingestMigrations } from "../src/ingest.ts";
import { kernelModules, openKernel, orderModules } from "../src/kernel.ts";
import { migrate, schemaOf, type ModuleMigrations } from "../src/migrate.ts";
import { openStore } from "../src/store.ts";
import { MODULES as DECISION_FIXTURE } from "./decision.fixtures.ts";
import { must, scratch, steppingClock } from "./helpers.ts";
import { KERNEL as JOB_FIXTURE } from "./job-fixture.ts";
import { receiptsMigrations } from "../src/pricing/receipts.ts";
import { partsMigrations } from "../src/parts/schema.ts";
import { recordsMigrations } from "../src/records/schema.ts";
import { slotsMigrations } from "../src/slots/schema.ts";
import { spendRequestMigrations } from "../src/spend-requests/schema.ts";
import { spendMigrations } from "../src/spend/ledger.ts";
import { stylesMigrations } from "../src/styles/schema.ts";
import { libraryMigrations } from "../src/library/schema.ts";
import { loadMigrations } from "../src/resources/load.ts";
import { resourcesMigrations } from "../src/resources/profiles.ts";
import { tokenMigrations } from "../src/token.ts";

const tmp = scratch("kernel");
afterAll(() => tmp.dispose());
let n = 0;
const file = (): string => path.join(tmp.dir, `k-${++n}.sqlite`);
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
  );
}

const isMigrations = (v: unknown): v is ModuleMigrations =>
  typeof v === "object" && v !== null && "module" in v && typeof v.module === "string" && "steps" in v && Array.isArray(v.steps);

/** Every ModuleMigrations value any src module exports, found by importing them all. */
async function exportedMigrations(): Promise<{ modules: Set<string>; files: number }> {
  const files = walk(SRC);
  const modules = new Set<string>();
  for (const f of files) {
    const mod: Record<string, unknown> = await import(pathToFileURL(f).href);
    for (const v of Object.values(mod)) if (isMigrations(v)) modules.add(v.module);
  }
  return { modules, files: files.length };
}

const kernelSchema = (): string[] => {
  const k = must(openKernel(file(), { clock: steppingClock() }));
  const s = must(schemaOf(k.store));
  k.close();
  return s;
};

describe("openKernel", () => {
  it("carries every module that exports migrations - forgetting one fails here", async () => {
    const found = await exportedMigrations();
    // A walk that imported nothing would agree with any list.
    expect(found.files).toBeGreaterThan(20);
    expect(found.modules.size).toBeGreaterThanOrEqual(7);
    const carried = new Set(must(kernelModules()).map((m) => m.module));
    expect([...carried].sort()).toEqual([...found.modules].sort());
  });

  it("a fresh store reaches the union of every per-module fixture's schema, and nothing else", () => {
    const fixtures: readonly (readonly ModuleMigrations[])[] = [JOB_FIXTURE, DECISION_FIXTURE, [eventsMigrations, ingestMigrations, receiptsMigrations, spendMigrations, tokenMigrations, recordsMigrations, partsMigrations, stylesMigrations, libraryMigrations, slotsMigrations, resourcesMigrations, loadMigrations, spendRequestMigrations]];
    const union = new Set<string>();
    for (const mods of fixtures) {
      const s = must(openStore(file()));
      must(migrate(s, mods, { snapshotDir: tmp.dir }));
      for (const line of must(schemaOf(s))) union.add(line);
      s.close();
    }
    expect(kernelSchema()).toEqual([...union].sort());
  });

  it("a store opened by older code (events v1 only) converges to the fresh schema", () => {
    const loc = file();
    const old = must(openStore(loc));
    must(migrate(old, [{ module: "events", steps: eventsMigrations.steps.slice(0, 1) }], { snapshotDir: tmp.dir }));
    old.close();
    const k = must(openKernel(loc, { snapshotDir: tmp.dir }));
    expect(k.migrated.applied[0]).toEqual({ module: "events", version: 2 });
    expect(k.migrated.snapshot).toBeDefined();
    expect(must(schemaOf(k.store))).toEqual(kernelSchema());
    k.close();
    const again = must(openKernel(loc, { snapshotDir: tmp.dir }));
    expect(again.migrated.applied).toEqual([]);
    again.close();
  });

  it("applies modules in dependency order: events first, decision before calibration", () => {
    const k = must(openKernel(":memory:"));
    const order = k.migrated.applied.filter((a) => a.version === 1).map((a) => a.module);
    k.close();
    expect(order[0]).toBe("events");
    expect(order.indexOf("decision")).toBeLessThan(order.indexOf("calibration"));
    expect(order.indexOf("lease")).toBeLessThan(order.indexOf("job"));
  });

  it("refuses an order where a module precedes what it runs after, or names a stranger", () => {
    const m = (module: string): ModuleMigrations => ({ module, steps: [] });
    const early = orderModules([{ migrations: m("decision"), after: ["events"] }, { migrations: m("events"), after: [] }]);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.message).toContain("declared before");
    const stranger = orderModules([{ migrations: m("events"), after: ["ghost"] }]);
    expect(stranger.ok).toBe(false);
  });

  it("never hands out a store whose migration failed", () => {
    const loc = file();
    const s = must(openStore(loc));
    // A table a kernel module is about to create, already there: its step fails.
    must(s.tx((t) => t.exec("CREATE TABLE leases (x INTEGER);")));
    s.close();
    const r = openKernel(loc, { snapshotDir: tmp.dir });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("lease v1 failed");
  });
});
