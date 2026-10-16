// V1'S LEASE DIRECTORY, AFTER THE MOVE (Phase 4, L27). The GPU lease left these files
// for the kernel's slot gpu.local#1 (lib/gpu/lease.ts says why); what stays here is
// where the old root is - its queue.jsonl is frozen history the ledger's gpu source
// still projects - and the MIGRATED marker that says where the lease went (plan §5.3),
// written once by whichever tenant opens the store first. pipeline/gpu/lease.py
// writes the same marker with the same words.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { outPath } from "../fixtures/roots";

/** v1's lease directory (GPU_LEASE_DIR, else foundry-out/gpu): now history and the MIGRATED marker. */
export function gpuRoot(): string {
  const env = process.env.GPU_LEASE_DIR?.trim();
  return env ? path.resolve(env) : outPath("gpu");
}

const marked = new Set<string>();
/** Leave the marker once per root per process: written by whichever tenant opens the store first. */
export function markMigrated(root: string): void {
  if (marked.has(root)) return;
  marked.add(root);
  if (!existsSync(root)) return;
  const text =
    "MIGRATED 2026-10-16 (Phase 4, L27). The GPU lease is the kernel lease on gpu.local#1 in the store\n" +
    "(GRAVITONE_STORE_PATH, else <foundry-out|fixtures-out>/gravitone.sqlite): lib/gpu/lease.ts and pipeline/gpu/lease.py.\n" +
    "lease.json and lock here are no longer read or written; queue.jsonl is frozen history the ledger's gpu source projects.\n";
  try {
    writeFileSync(path.join(root, "MIGRATED"), text, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") console.warn(`  lease: could not mark ${root} MIGRATED: ${(e as Error).message}`);
  }
}
