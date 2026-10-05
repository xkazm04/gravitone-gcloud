// THE FOUNDRY FS PORT — server only.
//
// Every disk effect the three foundry COMMITS make (lib/foundry/store.ts
// commitRun, lib/foundry/extract/store.ts commitExtractRun,
// lib/foundry/training/store.ts commitCycle) goes through this one object, and
// so do their reads of the versioned indices in pipeline/foundry/. By default
// it IS node:fs — `realFsPort` below delegates to the same runStore kernel and
// node:fs/promises calls the stores used to make directly, so production
// behaviour does not change by a byte.
//
// Why a seam exists at all: a commit is a multi-effect sequence over shared,
// git-tracked indices (ledger, styles, unlinks, manifest), and the only way to
// prove what happens when it stops after effect k — or when two commits
// overlap between a read and a write of the same index — is to stand between
// the commit and the disk. tests/golden-path/_effects.ts records every call,
// can throw at effect k, and can hold a call at an index boundary while
// another commit runs. Without a port the probes could only hand-pick one
// failure (foundry-commit-indices' `rewindToDone`) and simulate it.
//
// PROBE-ONLY SETTER, the same posture as FOUNDRY_DIR: nothing in the app calls
// `__setFoundryFsPort`; a probe installs a port in a test and puts the real one
// back after it (pass null). The stores read the port at call time, never at
// import, so a swap takes effect on the next effect.

import { copyFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";

import { readJson as kernelReadJson, writeJsonAtomic as kernelWriteJsonAtomic } from "./runStore";

export interface FsPort {
  /** Parse a JSON file; `fallback` when it does not exist. */
  readJson<T>(file: string, fallback: T): Promise<T>;
  /** Write-then-rename (runStore's kernel): never a torn file, but NOT a lock. */
  writeJsonAtomic(file: string, data: unknown): Promise<void>;
  unlink(file: string): Promise<void>;
  copyFile(src: string, dst: string): Promise<void>;
  writeFile(file: string, data: string): Promise<void>;
  /** Always recursive. */
  mkdir(dir: string): Promise<void>;
  stat(file: string): Promise<{ size: number }>;
}

export const realFsPort: FsPort = {
  readJson: (file, fallback) => kernelReadJson(file, fallback),
  writeJsonAtomic: (file, data) => kernelWriteJsonAtomic(file, data),
  unlink: (file) => unlink(file),
  copyFile: (src, dst) => copyFile(src, dst),
  writeFile: (file, data) => writeFile(file, data, "utf8"),
  mkdir: async (dir) => {
    await mkdir(dir, { recursive: true });
  },
  stat: async (file) => {
    const s = await stat(file);
    return { size: s.size };
  },
};

let current: FsPort = realFsPort;

/** The port the stores use right now. */
export function foundryFs(): FsPort {
  return current;
}

/** PROBE ONLY. Install a port; null restores the real one. */
export function __setFoundryFsPort(port: FsPort | null): void {
  current = port ?? realFsPort;
}
