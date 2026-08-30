"use client";

// THE ASSET RECORD — the library's third module, and its CRUD.
//
// An asset is anything reusable that a project might reach for: a plate, a
// cutout, a reference. It is deliberately a POINTER, not a payload — `src` is a
// URL, and the bytes live wherever they already live. Themes hold their proofs
// as base64 because a proof only exists inside its theme; an asset is a shelf
// entry, and putting megabytes in IndexedDB to describe a file already on disk
// would be paying twice for one picture.
//
// FOLDERS ARE DERIVED, NEVER STORED. Each asset carries a `path` and the tree
// is built from the paths present. That means there is exactly one source of
// truth for "does this folder exist" — an empty folder cannot linger after its
// last asset is removed, and a folder cannot go missing while assets still
// claim it. The cost is that you cannot make an empty folder, which for a shelf
// of generated work is the right trade.

import type { Provenance } from "@/app/_studio/types";

import {
  getByIndex,
  getRecord,
  openDb,
  runTx,
  ASSETS_STORE,
  BY_UID,
  UPLOADS_STORE,
} from "./studioDb";
import type { Proof, StyleBlock, Theme } from "./themes";

export type AssetKind = "image";

export interface Asset {
  id: string;
  uid: string;
  /** Folder chain, outermost first: ["styles", "presets", "signal-ledger"]. */
  path: string[];
  name: string;
  /** Where the bytes are. A public URL, not a payload. */
  src: string;
  kind: AssetKind;
  /** Whatever the producer knew. Free-form on purpose — a plate from the trial
   *  grid carries its grade; a future upload will carry something else. */
  meta?: Record<string, unknown>;
  createdAt: number;
}

export const pathKey = (path: string[]) => path.join("/");

/* ── Promoted proofs ──────────────────────────────────────────────────────── */
//
// A proof the user approved is a plate they paid for and liked enough to lock a
// style on. Until now it terminated inside `Theme.proofs[]` and could never
// reach the shelf, which meant the only writer to this store was the trial
// seed.
//
// It arrives here as a POINTER, keeping the promise at the top of this file:
// `src` is `proof:<themeId>/<proofId>` and the bytes stay where they already
// live, inside the theme. Nothing is copied, so promoting a sheet of fourteen
// costs a few hundred bytes rather than a second copy of several megabytes,
// and a proof cannot go stale against its asset. The pointer is dereferenced at
// READ time (see hydrateProofSrcs) — the store never holds an image.

const PROOF_SCHEME = "proof:";

export const proofPointer = (themeId: string, proofId: string) =>
  `${PROOF_SCHEME}${themeId}/${proofId}`;

/** The two ids inside a pointer, or null for any other kind of `src`. */
export function readProofPointer(src: string): { themeId: string; proofId: string } | null {
  if (!src.startsWith(PROOF_SCHEME)) return null;
  const [themeId, proofId] = src.slice(PROOF_SCHEME.length).split("/");
  return themeId && proofId ? { themeId, proofId } : null;
}

/**
 * The ONE id a promoted proof can have.
 *
 * Content-addressed, exactly as the trial seed is and for the same measured
 * reason (useAssets: React 19 double-invokes effects, and random ids put sixty
 * assets on a thirty-plate shelf). A second promotion of the same proof — a
 * double click, a re-render, a user who forgot — is then an overwrite of the
 * same row rather than a second tile of the same picture.
 */
export const promotedId = (themeId: string, proofId: string) => `as-proof-${themeId}-${proofId}`;

/** Folder segment for a style. Its NAME, not its id: the tree is what the user
 *  reads, and `th-m4x8k2-9f1a` tells them nothing. */
const styleFolder = (t: Theme) =>
  t.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || t.id;

/** What a promoted proof carries. `provenance` is the studio's own Provenance
 *  shape (app/_studio/types.ts) — the one the lineage UI already walks — rather
 *  than a third description of the same fact. */
export type PromotedMeta = {
  provenance: Provenance;
  /** The gallery tile's caption reads this. */
  styleName: string;
  themeId: string;
  proofId: string;
  /** The four slots that produced THESE pixels. Copied rather than referenced
   *  because a theme's block can be edited afterwards, and the asset is
   *  evidence of what the plate was rendered from, not of what the style says
   *  today. */
  block: StyleBlock;
  /** The vendor. Absent on proofs kept before it was recorded — absence, not
   *  a guess. */
  provider?: string;
  costUsd?: number;
  promotedAt: number;
  /** Set at READ time when the theme holding the bytes is gone. */
  unresolved?: boolean;
};

/** A shelf entry for one approved proof. Pure — the caller writes it. */
export function assetFromProof(uid: string, theme: Theme, proof: Proof): Asset {
  const meta: PromotedMeta = {
    provenance: {
      source: "generated",
      model: proof.model,
      // The compiled prompt is not kept on a proof, so it is absent here rather
      // than reconstructed from the label — which is a truncated subject, not
      // what the model was sent.
      //
      // The parent is the THEME: the lineage of a promoted plate is
      // style → proof → asset, and the style is the only ancestor that exists
      // as a record. No agent run made it, so runId/stepId stay absent.
      parentIds: [theme.id],
    },
    styleName: theme.name,
    themeId: theme.id,
    proofId: proof.id,
    block: theme.block,
    provider: proof.provider,
    costUsd: proof.costUsd,
    promotedAt: Date.now(),
  };
  return {
    id: promotedId(theme.id, proof.id),
    uid,
    // <discipline> › styles › proofs › <style>. The root is the theme's
    // discipline, or "shared" for an untagged style. Rows written before the
    // root existed keep their old `["styles", ...]` path, so `buildTree` shows
    // both roots side by side — which is what is actually on the shelf.
    path: [theme.discipline ?? "shared", "styles", "proofs", styleFolder(theme)],
    name: proof.label || proof.id,
    src: proofPointer(theme.id, proof.id),
    kind: "image",
    meta,
    createdAt: proof.createdAt,
  };
}

/** Every shelf entry promoted out of one theme.
 *
 *  Matched on `meta.themeId` rather than on the pointer in `src`, because a row
 *  that has been through hydrateProofSrcs carries the bytes there instead — and
 *  a filter that quietly stopped matching after a read would be the worst kind
 *  of bug to put behind a delete confirmation. */
export const promotedFrom = (assets: Asset[], themeId: string): Asset[] =>
  assets.filter((a) => (a.meta as PromotedMeta | undefined)?.themeId === themeId);

/** A 1×1 fully transparent PNG. It stands in for a promoted proof whose bytes
 *  are gone: the tile draws as an empty frame and the NAME says why. It is not
 *  a colour and not an illustration of a failure — there is nothing in it. */
const NO_BYTES =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

/**
 * Dereference every `proof:` pointer against the themes that hold the bytes.
 * Returns rows a gallery can draw — the STORED rows are untouched.
 *
 * A pointer that no longer resolves is not dropped and not silently blanked:
 * the row stays, marked, and renames itself so the shelf says what happened.
 * Deleting a style takes its promoted plates with it (LibraryAtelier), so this
 * is the residual case — a second tab, or a style deleted before that did.
 */
export function hydrateProofSrcs(assets: Asset[], themes: Theme[]): Asset[] {
  const byId = new Map(themes.map((t) => [t.id, t]));
  return assets.map((a) => {
    const ref = readProofPointer(a.src);
    if (!ref) return a;
    const proof = byId.get(ref.themeId)?.proofs.find((p) => p.id === ref.proofId);
    return proof
      ? { ...a, src: `data:${proof.mime};base64,${proof.base64}` }
      : {
          ...a,
          src: NO_BYTES,
          name: `${a.name} — source deleted`,
          meta: { ...(a.meta ?? {}), unresolved: true },
        };
  });
}

/* ── Uploads ──────────────────────────────────────────────────────────────── */
//
// THE ONE CASE WHERE THIS SHELF OWNS BYTES.
//
// Everything above is a pointer at bytes that exist anyway — a file on disk, a
// proof inside a theme. An uploaded reference has no such home: the user handed
// us the only copy, so somebody has to keep it.
//
// The doctrine bends in shape, not in principle. The bytes go to their own
// store (studioDb#UPLOADS_STORE) and the asset keeps a `upload:<id>` pointer,
// exactly as a promoted proof keeps `proof:<themeId>/<proofId>`. `listAssets`
// reads and sorts every row to build the folder tree, so putting a picture in
// that row would drag it through IndexedDB every time the rail is drawn. Here
// it is read only for what is actually on screen, and one paragraph of this
// file is the only place that knows the difference.

const UPLOAD_SCHEME = "upload:";

export const uploadPointer = (uploadId: string) => `${UPLOAD_SCHEME}${uploadId}`;

/** The upload id inside a pointer, or null for any other kind of `src`. */
export function readUploadPointer(src: string): string | null {
  if (!src.startsWith(UPLOAD_SCHEME)) return null;
  return src.slice(UPLOAD_SCHEME.length) || null;
}

/** What an upload is stored as. The Blob itself, not base64 — IndexedDB stores
 *  binary natively, and encoding would cost a third more space to hold the same
 *  picture less usefully. */
export interface UploadRecord {
  id: string;
  blob: Blob;
  mime: string;
  bytes: number;
}

/** A shelf entry for a file the user handed us, plus the byte record that goes
 *  with it. Pure — the caller writes both, in one transaction. */
export function assetFromUpload(
  uid: string,
  file: File,
  path: string[],
): { asset: Asset; upload: UploadRecord } {
  const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    asset: {
      id: `as-${id}`,
      uid,
      path,
      // The filename minus its extension. It is what the user called the file,
      // which is a better name than anything this code could invent, and the
      // extension is already said by the mime.
      name: file.name.replace(/\.[^.]+$/, "") || file.name,
      src: uploadPointer(id),
      kind: "image",
      meta: { upload: true, uploadId: id, mime: file.type, bytes: file.size, fileName: file.name },
      createdAt: Date.now(),
    },
    upload: { id, blob: file, mime: file.type, bytes: file.size },
  };
}

/** Write the rows and their bytes together. ONE transaction over both stores,
 *  so an upload cannot commit as a shelf entry pointing at bytes that were
 *  never written — which would draw as a broken tile with no way to explain
 *  itself. */
export async function putUploads(pairs: { asset: Asset; upload: UploadRecord }[]): Promise<void> {
  if (!pairs.length) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, [ASSETS_STORE, UPLOADS_STORE], "readwrite", (assets, tx) => {
      const uploads = tx.objectStore(UPLOADS_STORE);
      for (const p of pairs) {
        assets.put(p.asset);
        uploads.put(p.upload);
      }
    });
  } finally {
    db?.close();
  }
}

/** The bytes behind a set of upload ids. Missing ids are simply absent from the
 *  map — the caller renders that as a row whose source is gone, the same way a
 *  dangling proof pointer is handled. */
export async function getUploadBlobs(ids: string[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  if (!ids.length) return out;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    for (const id of ids) {
      const rec = await getRecord<UploadRecord>(db, UPLOADS_STORE, id);
      if (rec?.blob) out.set(id, rec.blob);
    }
    return out;
  } finally {
    db?.close();
  }
}

/**
 * Swap `upload:` pointers for URLs the CALLER has minted.
 *
 * The minting is deliberately not done here. An object URL is owned by whoever
 * created it and leaks until revoked — the rule this repo already wrote down
 * once (app/playground/PlaygroundView.tsx, "the blob urls this page owns") — and
 * a pure function that quietly allocated them would put the allocation
 * somewhere no component could see to release.
 */
export function hydrateUploadSrcs(assets: Asset[], urls: Map<string, string>): Asset[] {
  return assets.map((a) => {
    const id = readUploadPointer(a.src);
    if (!id) return a;
    const url = urls.get(id);
    return url
      ? { ...a, src: url }
      : {
          ...a,
          src: NO_BYTES,
          name: `${a.name} — file missing`,
          meta: { ...(a.meta ?? {}), unresolved: true },
        };
  });
}

/* ── The derived tree ─────────────────────────────────────────────────────── */

export interface FolderNode {
  /** Full path to this node. */
  path: string[];
  name: string;
  children: FolderNode[];
  /** Assets sitting directly in this folder. */
  count: number;
  /** Assets here and everywhere below. */
  total: number;
}

/** Build the folder tree implied by a set of assets. */
export function buildTree(assets: Asset[]): FolderNode[] {
  const roots: FolderNode[] = [];

  const find = (level: FolderNode[], path: string[], name: string): FolderNode => {
    let node = level.find((n) => n.name === name);
    if (!node) {
      node = { path, name, children: [], count: 0, total: 0 };
      level.push(node);
    }
    return node;
  };

  for (const a of assets) {
    let level = roots;
    for (let i = 0; i < a.path.length; i++) {
      const node = find(level, a.path.slice(0, i + 1), a.path[i]);
      node.total++;
      if (i === a.path.length - 1) node.count++;
      level = node.children;
    }
  }

  const sort = (ns: FolderNode[]) => {
    ns.sort((x, y) => x.name.localeCompare(y.name) || pathKey(x.path).localeCompare(pathKey(y.path)));
    ns.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Assets in a folder — including everything below it, so clicking a parent
 *  shows the whole subtree rather than an empty room. */
export function assetsUnder(assets: Asset[], path: string[]): Asset[] {
  if (!path.length) return assets;
  const prefix = pathKey(path);
  return assets.filter((a) => {
    const k = pathKey(a.path);
    return k === prefix || k.startsWith(`${prefix}/`);
  });
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

export async function listAssets(uid: string): Promise<Asset[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const rows = await getByIndex<Asset>(db, ASSETS_STORE, BY_UID, uid);
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  } finally {
    db?.close();
  }
}

/** Write many in one transaction, so a partial seed cannot commit. */
export async function putAssets(rows: Asset[]): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, ASSETS_STORE, "readwrite", (store) => rows.forEach((r) => store.put(r)));
  } finally {
    db?.close();
  }
}

/**
 * Remove a shelf entry — AND the bytes it owns, when it owns any.
 *
 * A promoted proof points into a theme and a seeded plate points at a file on
 * disk, so removing either has always been just the row. An upload is the one
 * kind whose bytes exist only because this row does: deleting the row alone
 * would leave a multi-megabyte blob in a store nothing indexes and nothing can
 * ever name again, and the shelf would look emptied while the quota stayed
 * spent.
 *
 * Both stores in ONE transaction, so a row can never survive its own bytes.
 */
export async function deleteAsset(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const row = await getRecord<Asset>(db, ASSETS_STORE, id);
    const uploadId = row ? readUploadPointer(row.src) : null;
    await runTx(db, [ASSETS_STORE, UPLOADS_STORE], "readwrite", (assets, tx) => {
      assets.delete(id);
      if (uploadId) tx.objectStore(UPLOADS_STORE).delete(uploadId);
    });
  } finally {
    db?.close();
  }
}

/** Read one stored row. The STORED one — `src` is whatever was written, so a
 *  promoted proof comes back as a pointer, not as the bytes a gallery is
 *  currently holding for it. */
export async function getAsset(id: string): Promise<Asset | undefined> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    return await getRecord<Asset>(db, ASSETS_STORE, id);
  } finally {
    db?.close();
  }
}

/**
 * Refile rows under a new folder chain.
 *
 * The whole point of the tree is that folders are DERIVED from the paths assets
 * claim (top of this file), which made the shelf file itself once and then
 * freeze: nothing could change a `path`, so nothing could change the tree. This
 * is the other half of that design — moving into a path is also how a folder
 * comes into existence, since an empty one cannot be made and does not need to
 * be.
 *
 * Read-modify-write INSIDE one transaction, which is load-bearing rather than
 * ceremony. The rows a gallery holds have been through `hydrateProofSrcs`, so
 * their `src` is megabytes of base64 where the stored row holds a `proof:`
 * pointer; writing a caller-supplied row back would inflate the store by the
 * size of every picture it has ever displayed, and would do it silently. The
 * only thing that crosses this boundary is the path. One transaction also means
 * a multi-row move cannot half-commit and scatter a selection across two
 * folders.
 *
 * A missing id is skipped rather than thrown on: the shelf can be refiled from
 * one tab while another deletes, and losing a row is not a reason to abandon
 * moving the rest.
 */
export async function moveAssets(ids: string[], path: string[]): Promise<void> {
  return refileAssets(ids.map((id) => ({ id, path })));
}

/**
 * Give each named row its own new path, in one transaction.
 *
 * The primitive under both refiling acts, because a folder RENAME cannot be
 * expressed as "these ids, that path": every asset below the renamed folder
 * keeps its own tail, so each row needs a different destination. One shared
 * transaction is what makes a rename all-or-nothing — a half-committed rename
 * leaves the tree with the folder under both names and the plates split between
 * them.
 */
export async function refileAssets(entries: { id: string; path: string[] }[]): Promise<void> {
  if (!entries.length) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, ASSETS_STORE, "readwrite", (store) => {
      for (const { id, path } of entries) {
        const req = store.get(id);
        // Issued from the read's own success handler, which is what keeps the
        // transaction alive across the round trip — the same idiom
        // studioDb#deleteByIndex documents.
        req.onsuccess = () => {
          const row = req.result as Asset | undefined;
          if (row) store.put({ ...row, path });
        };
      }
    });
  } finally {
    db?.close();
  }
}

/** Rename one row. The NAME only — same read-modify-write discipline as a
 *  refile, so a hydrated `src` cannot be written back over the pointer. */
export async function renameAsset(id: string, name: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, ASSETS_STORE, "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as Asset | undefined;
        if (row) store.put({ ...row, name });
      };
    });
  } finally {
    db?.close();
  }
}

/**
 * The refile a folder rename amounts to: every asset at or below `path` keeps
 * its own tail and swaps the one segment being renamed.
 *
 * Pure, and returns entries rather than performing them, so the caller can see
 * the blast radius — how many plates a rename touches — before committing to
 * it. Renaming onto a name a sibling already has MERGES the two folders, which
 * is not a bug to guard against down here: folders exist only because assets
 * claim them, so two folders with one name are one folder. The surface warns;
 * the store just does what it is told.
 */
export function folderRenameEntries(
  assets: Asset[],
  path: string[],
  name: string,
): { id: string; path: string[] }[] {
  if (!path.length) return [];
  const depth = path.length - 1;
  const prefix = pathKey(path);
  return assets
    .filter((a) => {
      const k = pathKey(a.path);
      return k === prefix || k.startsWith(`${prefix}/`);
    })
    .map((a) => ({ id: a.id, path: a.path.map((seg, i) => (i === depth ? name : seg)) }));
}
