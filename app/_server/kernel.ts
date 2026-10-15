import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { OUT_DIRNAME } from "../../lib/fixtures/mode.ts";

// THE PROCESS'S ONE KERNEL - what Server Components, Server Actions and route
// handlers read and write through.
//
// ONE PER PROCESS, AND IT SURVIVES HOT RELOAD. Next dev re-evaluates a module
// on every edit; a module-level `let` would open a second connection to the
// same file each time, and the old one would hold its statement cache and its
// WAL read mark until the process died. The handle therefore lives on
// globalThis, keyed by its location: the same file is opened once, a changed
// GRAVITONE_STORE_PATH (a probe pointing at a temp file) closes the old handle
// before opening the new one, and two locations are never held at once.
//
// WHERE THE FILE LIVES follows v1's two universes (lib/fixtures/mode.ts): the
// real store under foundry-out/, the fixture universe under fixtures-out/,
// switched by the same NEXT_PUBLIC_GRAVITONE_DATA the browser half reads, so
// the page and the store can never disagree about which world they are in
// (plan §3.2: "a second SQLite file"). GRAVITONE_STORE_PATH overrides both, the way
// FOUNDRY_DIR and the other *_DIR variables override v1's roots; a relative
// value is resolved against the working directory, ":memory:" is honoured for
// a throwaway process. The `_PATH` suffix is load-bearing: the node lane finds
// every store root to redirect by that suffix (tests/golden-path/_cells.ts
// storeRootVars), so a probe that drives a route can never write this store
// into the checkout.
//
// A FAILED OPEN IS NOT CACHED. A store held by another writer past the busy
// timeout is `unavailable` now and fine in a second; a standing migration
// failure mark refuses again on the next call without re-running anything
// (migrate.ts refuses before it snapshots), so retrying per request is cheap
// and never makes the store worse.

declare global {
  var __gravitoneKernel: { readonly location: string; readonly kernel: Kernel } | undefined;
}

export const STORE_FILE = "gravitone.sqlite";

/** The store the app opens: GRAVITONE_STORE_PATH, else `<cwd>/<foundry-out|fixtures-out>/gravitone.sqlite`. */
export function storeLocation(override: string | undefined = process.env["GRAVITONE_STORE_PATH"], cwd: string = process.cwd()): string {
  const v = override?.trim();
  if (v === undefined || v === "") return path.join(cwd, OUT_DIRNAME, STORE_FILE);
  return v === ":memory:" ? v : path.resolve(cwd, v);
}

/** The process's kernel, opened and migrated on first use. */
export function kernel(): Result<Kernel> {
  const location = storeLocation();
  const held = globalThis.__gravitoneKernel;
  if (held !== undefined && held.location === location) return ok(held.kernel);
  if (held !== undefined) closeKernel();
  if (location !== ":memory:") {
    try {
      mkdirSync(path.dirname(location), { recursive: true });
    } catch (cause) {
      return err("unavailable", `kernel: cannot create the store directory for ${location}`, { cause });
    }
  }
  const opened = openKernel(location);
  if (!opened.ok) return opened;
  globalThis.__gravitoneKernel = { location, kernel: opened.value };
  return opened;
}

/** Close the process's kernel, if open: graceful shutdown, and a test harness
 *  that must delete the store's directory (Windows refuses to while it is open). */
export function closeKernel(): void {
  globalThis.__gravitoneKernel?.kernel.close();
  globalThis.__gravitoneKernel = undefined;
}
