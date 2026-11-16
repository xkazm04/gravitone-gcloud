// THE READ-COST PROBE - counts what a loader asks of the disk and of SQLite, by wrapping the
// two doors every reader goes through rather than guessing from the code (tests/measure/read-cost.mts).
//
//   fs      the node:fs and node:fs/promises functions a store reader calls, patched on the
//           module objects and pushed into every ESM named binding (syncBuiltinESMExports), so
//           `import { readFile } from "node:fs/promises"` in lib/ is counted too. Each call's
//           path is kept, for the containment proof: the script must touch nothing outside its
//           own temp root.
//   sql     node:sqlite StatementSync.prototype get/all/run/iterate: one count per statement
//           EXECUTED. The kernel caches prepared statements (store.ts STATEMENT_CACHE), so
//           counting prepare() would undercount every warm read. Each database opened is
//           recorded by its location() for the same proof.
//
// Install once, before any measured call; `snapshot()` / `since()` turn the running totals
// into per-call deltas.

import fs from "node:fs";
import fsp from "node:fs/promises";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { StatementSync, DatabaseSync } from "node:sqlite";

export type Counts = { readonly fs: number; readonly stat: number; readonly read: number; readonly readdir: number; readonly sql: number };

const totals = { fs: 0, stat: 0, read: 0, readdir: 0, sql: 0 };
/** Every path any wrapped fs call named, absolute. */
export const touched = new Set<string>();
/** Every SQLite file a statement ran against. */
export const databases = new Set<string>();

const KIND: Readonly<Record<string, "stat" | "read" | "readdir" | "other">> = {
  stat: "stat",
  lstat: "stat",
  statSync: "stat",
  lstatSync: "stat",
  existsSync: "stat",
  access: "stat",
  accessSync: "stat",
  readFile: "read",
  readFileSync: "read",
  open: "read",
  openSync: "read",
  readdir: "readdir",
  readdirSync: "readdir",
  opendir: "readdir",
  writeFile: "other",
  writeFileSync: "other",
  mkdir: "other",
  mkdirSync: "other",
  rename: "other",
  renameSync: "other",
  rm: "other",
  rmSync: "other",
  unlink: "other",
  unlinkSync: "other",
  copyFile: "other",
  copyFileSync: "other",
};

let installed = false;

// The loader hooks (pipeline/lib-hooks.mts) resolve and compile modules with the same fs calls a
// store reader makes. A hook registered here runs first and brackets the chain, so a call made
// while a module is being resolved or loaded is counted as a module load, not as the read.
let loading = 0;
/** Paths the module loader named (source files and resolution probes), apart from the reads. */
export const modules = new Set<string>();

function note(name: string, arg: unknown): void {
  if (loading > 0) {
    if (typeof arg === "string") modules.add(path.resolve(arg));
    return;
  }
  totals.fs++;
  const k = KIND[name];
  if (k === "stat") totals.stat++;
  else if (k === "read") totals.read++;
  else if (k === "readdir") totals.readdir++;
  if (typeof arg === "string") touched.add(path.resolve(arg));
  else if (arg instanceof URL && arg.protocol === "file:") touched.add(path.resolve(decodeURIComponent(arg.pathname.replace(/^\/([A-Za-z]:)/, "$1"))));
  else if (Buffer.isBuffer(arg)) touched.add(path.resolve(arg.toString("utf8")));
}

function wrap(target: Record<string, unknown>, name: string): void {
  const orig = target[name];
  if (typeof orig !== "function") return;
  const fn = orig as (...a: unknown[]) => unknown;
  target[name] = function (this: unknown, ...a: unknown[]): unknown {
    note(name, a[0]);
    return fn.apply(this, a);
  };
}

export function install(): void {
  if (installed) return;
  installed = true;
  const sync = fs as unknown as Record<string, unknown>;
  const prom = fsp as unknown as Record<string, unknown>;
  const promOnFs = fs.promises as unknown as Record<string, unknown>;
  for (const name of Object.keys(KIND)) {
    if (name.endsWith("Sync")) wrap(sync, name);
    else {
      wrap(prom, name);
      if (promOnFs !== prom) wrap(promOnFs, name);
    }
  }
  // Callback-style fs.stat/readFile/readdir (rare in lib/, but a reader may use them).
  for (const name of ["stat", "lstat", "readFile", "readdir", "open", "access"]) wrap(sync, name);
  syncBuiltinESMExports();
  registerHooks({
    resolve(spec, ctx, next) {
      loading++;
      try {
        return next(spec, ctx);
      } finally {
        loading--;
      }
    },
    load(url, ctx, next) {
      loading++;
      try {
        return next(url, ctx);
      } finally {
        loading--;
      }
    },
  });

  const proto = StatementSync.prototype as unknown as Record<string, unknown>;
  for (const name of ["get", "all", "run", "iterate"]) {
    const orig = proto[name] as (...a: unknown[]) => unknown;
    proto[name] = function (this: unknown, ...a: unknown[]): unknown {
      totals.sql++;
      return orig.apply(this, a);
    };
  }
  const dbProto = DatabaseSync.prototype as unknown as Record<string, unknown>;
  const prepare = dbProto["prepare"] as (this: DatabaseSync, ...a: unknown[]) => unknown;
  dbProto["prepare"] = function (this: DatabaseSync, ...a: unknown[]): unknown {
    const where = this.location();
    if (where !== null && where !== "") databases.add(path.resolve(where));
    return prepare.apply(this, a);
  };
  const exec = dbProto["exec"] as (this: DatabaseSync, ...a: unknown[]) => unknown;
  dbProto["exec"] = function (this: DatabaseSync, ...a: unknown[]): unknown {
    totals.sql++;
    return exec.apply(this, a);
  };
}

export const snapshot = (): Counts => ({ ...totals });

export const since = (s: Counts): Counts => ({
  fs: totals.fs - s.fs,
  stat: totals.stat - s.stat,
  read: totals.read - s.read,
  readdir: totals.readdir - s.readdir,
  sql: totals.sql - s.sql,
});

/** True when `p` is `root` or inside it (case-insensitive on Windows, where paths are). */
export function within(root: string, p: string): boolean {
  const norm = (x: string): string => (process.platform === "win32" ? path.resolve(x).toLowerCase() : path.resolve(x));
  const r = norm(root);
  const q = norm(p);
  return q === r || q.startsWith(r + path.sep);
}
