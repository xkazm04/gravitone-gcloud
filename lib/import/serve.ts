import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import type { Store } from "@gt/kernel/store";

import { kernel } from "@/lib/kernelStore";
import { blobRootOf, LIVE_GATES, openReadyGates } from "@/lib/parts/gates";

import { readArchive, type Archive, type ArchiveCaps, ARCHIVE_CAPS } from "./archive.ts";
import { commitImport, type Committed } from "./commit.ts";
import { exportProjects } from "./export.ts";
import { planImport, type ProjectPreview } from "./project.ts";
import type { Loss } from "./steps.ts";

// THE IMPORT'S SERVER VERBS (Phase 4 wave D, L42) - what POST/GET /api/import answer, over the
// process's kernel and its blob root (the same root /api/blob serves, so a plate the import
// lands draws on the Plan at once). The route parses HTTP; these read the archive, stage it,
// confirm it on its token, and write the re-export. Every verb takes its store explicitly so a
// test runs it over a temp universe; the `*Live` binders use the process's.

export type Preview = {
  readonly token: string;
  readonly header: { readonly from: string; readonly exportedAt: number; readonly scope: "account" | "project" };
  readonly counts: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly projects: readonly ProjectPreview[];
  readonly losses: readonly Loss[];
};

export type Universe = { readonly store: Store; readonly blobs: BlobStore };

function liveUniverse(): Result<Universe> {
  const k = kernel();
  return k.ok ? ok({ store: k.value.store, blobs: blobStore(blobRootOf(k.value.store)) }) : k;
}

function previewOf(u: Universe, a: Archive): Result<Preview> {
  const p = u.store.read((r) => planImport(r, a));
  if (!p.ok) return p;
  return ok({
    token: p.value.token,
    header: { from: a.header.from, exportedAt: a.header.exportedAt, scope: a.header.scope },
    counts: a.manifest.counts,
    bytes: a.bytes,
    projects: p.value.projects.map((x) => x.preview),
    losses: p.value.losses,
  });
}

/** What importing these bytes would create, written nowhere. */
export function previewImport(u: Universe, bytes: Uint8Array, caps: ArchiveCaps = ARCHIVE_CAPS): Result<Preview> {
  const a = readArchive(bytes, caps);
  return a.ok ? previewOf(u, a.value) : a;
}

/**
 * Confirm the preview whose token is `token`. A stale token answers the fresh preview with
 * `conflict` (detail `stale-preview`), the receipt's 409 shape (COMMON decision 3).
 */
export async function confirmImport(
  u: Universe,
  bytes: Uint8Array,
  token: string,
  actor: Actor,
  afterLanded?: (projectId: string) => Promise<void>,
): Promise<Result<Committed>> {
  const a = readArchive(bytes);
  if (!a.ok) return a;
  return commitImport({ ...u, actor, ...(afterLanded === undefined ? {} : { afterLanded }) }, a.value, token);
}

export function previewLive(bytes: Uint8Array): Result<Preview> {
  const u = liveUniverse();
  return u.ok ? previewImport(u.value, bytes) : u;
}

export async function confirmLive(bytes: Uint8Array, token: string, actor: Actor): Promise<Result<Committed>> {
  const u = liveUniverse();
  if (!u.ok) return u;
  // A launched import's READY parts owe their gates' packets now, as an editor write would open
  // them (lib/parts/gates.ts openReadyGates; idempotent, re-kicked on the next part write).
  const gates = async (projectId: string): Promise<void> => {
    const o = await openReadyGates(LIVE_GATES, projectId, { by: "operator", surface: "import", who: actor.id });
    if (!o.ok) console.log(`[import] ${projectId}: its gates did not open now (${o.error.message}); the next part write opens them`);
  };
  return confirmImport(u.value, bytes, token, actor, gates);
}

export async function exportLive(ids: readonly string[], uid: string): Promise<Result<Uint8Array>> {
  if (ids.length === 0) return err("invalid", "an export names at least one project");
  const u = liveUniverse();
  return u.ok ? exportProjects(u.value.store, u.value.blobs, { ids, uid, now: Date.now() }) : u;
}
