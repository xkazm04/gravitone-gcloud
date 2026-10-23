import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import type { Store } from "@gt/kernel/store";

import { ensureStyles, exportStyles } from "@/lib/foundry/catalogue";
import { kernel } from "@/lib/kernelStore";
import { blobRootOf, LIVE_GATES, openReadyGates } from "@/lib/parts/gates";

import { readArchive, type Archive, type ArchiveCaps, ARCHIVE_CAPS } from "./archive.ts";
import { commitImport, type CommitDeps, type Committed } from "./commit.ts";
import { exportProjects } from "./export.ts";
import { planImport, type ProjectPreview } from "./project.ts";
import type { ItemPreview, ThemePreview } from "./shelf.ts";
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
  readonly themes: readonly ThemePreview[];
  readonly items: readonly ItemPreview[];
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
    themes: p.value.themes.map((x) => x.preview),
    items: p.value.items.map((x) => x.preview),
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
export async function confirmImport(u: Universe, bytes: Uint8Array, token: string, actor: Actor, hooks: Pick<CommitDeps, "afterLanded" | "afterStyles"> = {}): Promise<Result<Committed>> {
  const a = readArchive(bytes);
  if (!a.ok) return a;
  return commitImport({ ...u, actor, ...hooks }, a.value, token);
}

/** The live universe, its style table holding the repo's catalogue first: `ensureStyles`
 *  (lib/foundry/catalogue.ts) imports styles.json into an EMPTY table only, so a theme landed
 *  first would make the catalogue look imported when it never was. */
async function liveWithStyles(): Promise<Result<Universe>> {
  const u = liveUniverse();
  if (!u.ok) return u;
  try {
    await ensureStyles(u.value.store);
  } catch (e) {
    return err("unavailable", `the style store could not take the catalogue first: ${errorMessage(e)}`);
  }
  return u;
}

export async function previewLive(bytes: Uint8Array): Promise<Result<Preview>> {
  const u = await liveWithStyles();
  return u.ok ? previewImport(u.value, bytes) : u;
}

export async function confirmLive(bytes: Uint8Array, token: string, actor: Actor): Promise<Result<Committed>> {
  const u = await liveWithStyles();
  if (!u.ok) return u;
  // A launched import's READY parts owe their gates' packets now, as an editor write would open
  // them (lib/parts/gates.ts openReadyGates; idempotent, re-kicked on the next part write).
  const gates = async (projectId: string): Promise<void> => {
    const o = await openReadyGates(LIVE_GATES, projectId, { by: "operator", surface: "import", who: actor.id });
    if (!o.ok) console.log(`[import] ${projectId}: its gates did not open now (${o.error.message}); the next part write opens them`);
  };
  // styles.json is the store's export (Phase 5 decision 3): a landed theme is a style change.
  const store = u.value.store;
  const afterStyles = (): Result<unknown> => {
    try {
      return ok(exportStyles(store));
    } catch (e) {
      return err("unavailable", errorMessage(e));
    }
  };
  return confirmImport(u.value, bytes, token, actor, { afterLanded: gates, afterStyles });
}

export async function exportLive(ids: readonly string[], uid: string): Promise<Result<Uint8Array>> {
  if (ids.length === 0) return err("invalid", "an export names at least one project");
  const u = liveUniverse();
  return u.ok ? exportProjects(u.value.store, u.value.blobs, { ids, uid, now: Date.now() }) : u;
}
