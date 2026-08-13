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

import { getByIndex, getRecord, openDb, runTx, ASSETS_STORE, BY_UID } from "./studioDb";

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
    ns.sort((x, y) => x.name.localeCompare(y.name));
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
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    db?.close();
  }
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    return await getRecord<Asset>(db, ASSETS_STORE, id);
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

export async function deleteAsset(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, ASSETS_STORE, "readwrite", (store) => store.delete(id));
  } finally {
    db?.close();
  }
}
