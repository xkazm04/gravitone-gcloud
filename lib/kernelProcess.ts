// THE PROCESS'S KERNEL HANDLE, with no `server-only` mark (Phase 5). lib/kernelStore.ts is the
// door pages and routes import, and it keeps the mark so a client bundle can never pull the
// store in. The v1 foundry modules (catalogue, extract, adopt) also run under the operator's
// CLIs (`npx tsx pipeline/foundry/extract.mts`, the strips CLI), where `server-only` throws by
// design; since styles moved onto the store they need the handle too, so they import it here.

import type { Result } from "@gt/domain/errors";
import type { Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { closeProcessKernel, processKernel, storeLocation as locate } from "@gt/kernel/process";

import path from "node:path";

import { OUT_DIRNAME } from "./fixtures/mode.ts";

// THE APP'S KERNEL (lib/, so pages, v1 doors, the ledger projection and CLIs share it) - what Server Components, Server Actions and route handlers
// read and write through: the process's one handle (@gt/kernel/process, which
// says why it is one and why it survives hot reload), bound to the universe
// the page is in.
//
// WHERE THE FILE LIVES follows v1's two universes (lib/fixtures/mode.ts): the
// real store under foundry-out/, the fixture universe under fixtures-out/,
// switched by the same NEXT_PUBLIC_GRAVITONE_DATA the browser half reads, so
// the page and the store can never disagree about which world they are in
// (plan §3.2: "a second SQLite file"). GRAVITONE_STORE_PATH overrides both.
// The same binding is made by v1's money door (lib/principal.ts, for CLI
// tokens) and by pipeline/token.mts, each from the same OUT_DIRNAME: the
// location rule itself lives once, in the package.

/** The store the app opens: GRAVITONE_STORE_PATH, else `<cwd>/<foundry-out|fixtures-out>/gravitone.sqlite`. */
export function storeLocation(override?: string, cwd?: string): string {
  return locate(OUT_DIRNAME, override ?? process.env["GRAVITONE_STORE_PATH"], cwd ?? process.cwd());
}

/** The process's kernel, opened and migrated on first use. */
export function kernel(): Result<Kernel> {
  return processKernel(storeLocation());
}

/** Close the process's kernel, if open: graceful shutdown, and a test harness
 *  that must delete the store's directory (Windows refuses to while it is open). */
export function closeKernel(): void {
  closeProcessKernel();
}

/** Where a store's blobs live: beside its file (an in-memory store uses the fixtures' out dir). */
export const blobRootOf = (store: Pick<Store, "location">): string => (store.location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(store.location), "blobs"));
