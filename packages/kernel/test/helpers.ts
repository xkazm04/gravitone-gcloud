import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Result } from "@gt/domain/errors";
import { migrate, type ModuleMigrations } from "../src/migrate.ts";
import { openStore, type Store, type StoreOptions } from "../src/store.ts";

/** The value of an ok Result; a test that meets an err fails with its message. */
export function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

/** A scratch directory under the OS temp dir; nothing lands in the repo. */
export function scratch(label: string): { dir: string; dispose(): void } {
  const dir = mkdtempSync(path.join(tmpdir(), `gt-kernel-${label}-`));
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The Python 3 the cross-language suites spawn (packages/kernel/py): `python`, `python3`, then the
 *  Windows `py` launcher; undefined when none answers, and each suite skips with its own warning. */
export function findPython(): string | undefined {
  for (const bin of ["python", "python3", "py"]) {
    const r = spawnSync(bin, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "3") return bin;
  }
  return undefined;
}

export const fixedClock = (iso = "2026-10-15T12:00:00.000Z") => () => new Date(iso);

/** A clock that advances one second per reading, for tests that need distinct instants. */
export function steppingClock(startIso = "2026-10-15T00:00:00.000Z", stepMs = 1000): () => Date {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

/**
 * Template-copy fixtures (plan §9.2; test-harness: fixture-economics). The
 * template is migrated ONCE per test file and closed, so no -wal sidecar is
 * left beside it; each test copies the one file and opens the copy. A copy is
 * probed before it is handed out, so a broken template fails loudly at setup
 * and not as a confusing assertion later.
 */
export function templateStores(modules: readonly ModuleMigrations[], opts: StoreOptions = {}) {
  const tmp = scratch("tpl");
  const template = path.join(tmp.dir, "template.sqlite");
  const t0 = performance.now();
  const builder = must(openStore(template, opts));
  must(migrate(builder, modules, { snapshotDir: tmp.dir }));
  builder.close();
  if (existsSync(`${template}-wal`)) throw new Error("template left a -wal sidecar after close; copies would miss its pages");
  const buildMs = performance.now() - t0;
  let n = 0;
  const open: Store[] = [];
  const setupMs: number[] = [];
  return {
    /** What one migrated-from-empty store costs: the price a copy avoids. */
    buildMs,
    setupMs,
    fresh(): Store {
      const t0 = performance.now();
      const file = path.join(tmp.dir, `copy-${++n}.sqlite`);
      copyFileSync(template, file);
      const s = must(openStore(file, opts));
      must(s.read((r) => r.get("SELECT count(*) AS n FROM _migrations")));
      setupMs.push(performance.now() - t0);
      open.push(s);
      return s;
    },
    dispose(): void {
      for (const s of open) s.close();
      tmp.dispose();
    },
  };
}
