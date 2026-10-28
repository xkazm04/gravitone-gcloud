// THE OPERATOR'S DOOR TO A REFUSED STORE - pipeline/kernel.mts, run as the operator runs it
// (plain node, GRAVITONE_STORE_PATH at a temp file; the app's store is never opened). A
// migration failure mark refuses every open until cleared; before this CLI the only remedy was
// hand-written SQL against the live store.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { migrate, type ModuleMigrations } from "../../packages/kernel/src/migrate.ts";
import { openStore } from "../../packages/kernel/src/store.ts";

const dir = mkdtempSync(path.join(tmpdir(), "gt-kernel-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const good: ModuleMigrations = { module: "probe", steps: [{ version: 1, sql: "CREATE TABLE a (x);" }, { version: 2, sql: "CREATE TABLE b (y);" }] };
const broken: ModuleMigrations = { module: "probe", steps: [good.steps[0]!, { version: 2, sql: "INSERT INTO no_such_table VALUES (1);" }] };

function seededStore(name: string): string {
  const file = path.join(dir, name);
  const s = openStore(file);
  if (!s.ok) throw s.error;
  expect(migrate(s.value, [broken]).ok).toBe(false);
  expect(migrate(s.value, [good]).ok, "the mark stands and refuses").toBe(false);
  s.value.close();
  return file;
}

const run = (file: string, ...args: string[]) =>
  spawnSync(process.execPath, ["pipeline/kernel.mts", ...args], { encoding: "utf8", windowsHide: true, env: { ...process.env, GRAVITONE_STORE_PATH: file, GRAVITONE_DRY_ONLY: "1" } });

describe("pipeline/kernel.mts migrations", () => {
  // Spawns the kernel CLI: under the pre-push gate's parallel load (and a box drawing at night) it runs past vitest's 5 s default.
  it("status names the standing mark and its error; clear lifts it and migrate then runs", () => {
    const file = seededStore("refused.sqlite");
    const status = run(file, "migrations", "status");
    expect(status.status).toBe(0);
    expect(status.stdout).toMatch(/probe v2 failed at .*no_such_table/);

    const cleared = run(file, "migrations", "clear", "probe");
    expect(cleared.status).toBe(0);
    expect(run(file, "migrations", "status").stdout).toMatch(/no migration failure mark stands/);

    const s = openStore(file);
    if (!s.ok) throw s.error;
    const again = migrate(s.value, [good]);
    s.value.close();
    expect(again.ok && again.value.applied.map((a) => a.version)).toEqual([2]);
  }, 60_000);

  // Spawns child processes: under the pre-push gate's parallel load (and a box drawing at night) it runs past vitest's 5 s default.
  it("clear of a module with no mark exits 1 and changes nothing; a missing store exits 2", () => {
    const file = seededStore("other.sqlite");
    expect(run(file, "migrations", "clear", "elsewhere").status).toBe(1);
    expect(run(file, "migrations", "status").stdout).toMatch(/probe v2 failed/);
    expect(run(path.join(dir, "absent.sqlite"), "migrations", "status").status).toBe(2);
  }, 60_000);

  it("usage errors exit 2", () => {
    const out = spawnSync(process.execPath, ["pipeline/kernel.mts", "migrations"], { encoding: "utf8", windowsHide: true });
    expect(out.status).toBe(2);
  });
});
