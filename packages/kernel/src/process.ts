import { mkdirSync } from "node:fs";
import path from "node:path";
import { err, ok, type Result } from "@gt/domain/errors";
import { openKernel, type Kernel } from "./kernel.ts";

// THE PROCESS'S ONE KERNEL - the handle every reader and writer in one process
// shares: Next's server (lib/kernelProcess.ts binds it; pages, actions and
// routes reach it through lib/kernelStore.ts), v1's money door (lib/principal.ts, judging a CLI token), and the
// operator's CLIs (pipeline/token.mts). Moved here from app/_server/kernel.ts
// (Phase 1) because two of those three may not import app/
// (tests/golden-path/no-app-imports.probe.spec.ts), and a second accessor would
// be a second connection to the same file - its own statement cache, its own
// WAL read mark - and a second copy of "where the store lives" to drift: the
// way a token gets minted into a store the server never opens.
//
// ONE PER PROCESS, AND IT SURVIVES HOT RELOAD. Next dev re-evaluates a module
// on every edit; a module-level `let` would open a second connection to the
// same file each time, and the old one would hold its statement cache and its
// WAL read mark until the process died. The handle therefore lives on
// globalThis, keyed by its location: the same file is opened once, a changed
// location (a probe pointing GRAVITONE_STORE_PATH at a temp file) closes the
// old handle before opening the new one, and two locations are never held at
// once.
//
// WHERE THE FILE LIVES follows v1's two universes (lib/fixtures/mode.ts): the
// caller passes the universe's directory (`foundry-out` or `fixtures-out`),
// because that switch is v1's to own and this package may not read lib/.
// GRAVITONE_STORE_PATH overrides it, the way FOUNDRY_DIR and the other *_DIR
// variables override v1's roots; a relative value is resolved against the
// working directory, ":memory:" is honoured for a throwaway process. The
// `_PATH` suffix is load-bearing: the node lane finds every store root to
// redirect by that suffix (tests/golden-path/_cells.ts storeRootVars), so a
// probe that drives a route can never write this store into the checkout.
//
// A FAILED OPEN IS NOT CACHED. A store held by another writer past the busy
// timeout is `unavailable` now and fine in a second; a standing migration
// failure mark refuses again on the next call without re-running anything
// (migrate.ts refuses before it snapshots), so retrying per call is cheap and
// never makes the store worse.

declare global {
  var __gravitoneKernel: { readonly location: string; readonly kernel: Kernel } | undefined;
}

export const STORE_FILE = "gravitone.sqlite";
export const STORE_PATH_VAR = "GRAVITONE_STORE_PATH";

/** The store: `override` (GRAVITONE_STORE_PATH), else `<cwd>/<outDirname>/gravitone.sqlite`. */
export function storeLocation(outDirname: string, override: string | undefined = process.env[STORE_PATH_VAR], cwd: string = process.cwd()): string {
  const v = override?.trim();
  if (v === undefined || v === "") return path.join(cwd, outDirname, STORE_FILE);
  return v === ":memory:" ? v : path.resolve(cwd, v);
}

/** The process's kernel at `location`, opened and migrated on first use. */
export function processKernel(location: string): Result<Kernel> {
  const held = globalThis.__gravitoneKernel;
  if (held !== undefined && held.location === location) return ok(held.kernel);
  if (held !== undefined) closeProcessKernel();
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

/** Close the process's kernel, if open: graceful shutdown, a CLI's last act, and a
 *  test harness that must delete the store's directory (Windows refuses to while it is open). */
export function closeProcessKernel(): void {
  globalThis.__gravitoneKernel?.kernel.close();
  globalThis.__gravitoneKernel = undefined;
}
