// v1's THEME AND SHELF ROWS, WRITTEN AS v1 WROTE THEM - for the probes of the code that still
// reads those IndexedDB stores after their writers retired (Phase 5, L55): the archive export
// (lib/studioArchive.ts), the sign-out eviction (lib/identityEviction.ts) and its dialog. The
// shapes are lib/themes.ts `newTheme` and lib/assets.ts `assetFromUpload` / `putUploads` /
// `getUploadBlobs` / `listAssets`, field for field; nothing here is the product's code.

import type { V1Asset, V1Theme } from "@/lib/fixtures/browserBundle";
import { uploadPointer } from "@/lib/shelfPointers";
import { ASSETS_STORE, BY_UID, THEMES_STORE, UPLOADS_STORE, getByIndex, getRecord, openDb, runTx } from "@/lib/studioDb";

export type V1Upload = { id: string; blob: Blob; mime: string; bytes: number };

let n = 0;
const mint = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;

/** v1 `newTheme`: a draft with an empty sheet. `block` is whatever the caller's test needs. */
export function v1Theme(uid: string, name: string, extra: Partial<V1Theme> = {}): V1Theme {
  const now = Date.now();
  return { id: mint("th"), uid, name, origin: "scratch", block: { technique: "", subject: "", palette: [], finish: "" }, elements: [], proofs: [], createdAt: now, updatedAt: now, ...extra };
}

/** v1 `assetFromUpload`: the shelf row and the byte record that go with it. */
export function v1Upload(uid: string, file: File, path: string[], kind: V1Asset["kind"] = "image"): { asset: V1Asset; upload: V1Upload } {
  const id = mint("up");
  return {
    asset: { id: `as-${id}`, uid, path, name: file.name.replace(/\.[^.]+$/, "") || file.name, src: uploadPointer(id), kind, meta: { upload: true, uploadId: id, mime: file.type, bytes: file.size, fileName: file.name }, createdAt: Date.now() },
    upload: { id, blob: file, mime: file.type, bytes: file.size },
  };
}

async function put(stores: string[], work: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, stores, "readwrite", (_s, tx) => work(tx));
  } finally {
    db.close();
  }
}

export const putV1Themes = (rows: readonly V1Theme[]): Promise<void> => put([THEMES_STORE], (tx) => rows.forEach((r) => tx.objectStore(THEMES_STORE).put(r)));
export const putV1Assets = (rows: readonly V1Asset[]): Promise<void> => put([ASSETS_STORE], (tx) => rows.forEach((r) => tx.objectStore(ASSETS_STORE).put(r)));
/** v1 `putUploads`: rows and bytes in one transaction. */
export const putV1Uploads = (pairs: readonly { asset: V1Asset; upload: V1Upload }[]): Promise<void> =>
  put([ASSETS_STORE, UPLOADS_STORE], (tx) => {
    for (const p of pairs) {
      tx.objectStore(ASSETS_STORE).put(p.asset);
      tx.objectStore(UPLOADS_STORE).put(p.upload);
    }
  });

/** v1 `getUploadBlobs`: the bytes behind upload ids; missing ids are absent from the map. */
export async function v1UploadBlobs(ids: readonly string[]): Promise<Map<string, Blob>> {
  const db = await openDb();
  try {
    const out = new Map<string, Blob>();
    for (const id of ids) {
      const r = await getRecord<V1Upload>(db, UPLOADS_STORE, id);
      if (r !== undefined) out.set(id, r.blob);
    }
    return out;
  } finally {
    db.close();
  }
}

/** v1 `listAssets`, without its sort: an account's shelf rows. */
export async function listV1Assets(uid: string): Promise<V1Asset[]> {
  const db = await openDb();
  try {
    return await getByIndex<V1Asset>(db, ASSETS_STORE, BY_UID, uid);
  } finally {
    db.close();
  }
}
