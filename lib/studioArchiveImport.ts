"use client";

// Importing an archive: verified in full by studioArchiveRead, then written in
// ONE transaction. The collision rules are documented in lib/studioArchive.ts.

import { promotedId, proofPointer, readProofPointer, readUploadPointer, uploadPointer } from "@/lib/shelfPointers";
import {
  ASSETS_STORE,
  BY_PROJECT,
  PROJECTS_STORE,
  STEPS_STORE,
  THEMES_STORE,
  UPLOADS_STORE,
  openDb,
} from "@/lib/studioDb";
import {
  ArchiveRefused,
  fromB64,
  isObj,
  type ArchiveSection,
  type CollisionPolicy,
  type ImportReport,
  type Row,
} from "@/lib/studioArchiveFormat";
import { parseArchive, type ArchiveSource } from "@/lib/studioArchiveRead";

type Decision = "new" | "skip" | "replace" | "remint";

const PREFIX: Record<"projects" | "themes" | "assets" | "uploads", string> = {
  projects: "p",
  themes: "th",
  assets: "as",
  uploads: "up",
};

/**
 * Bring an archive's work into `uid`'s shelf. Verified in full first, then
 * written in ONE transaction — see the header for the collision rules. Rejects
 * with `ArchiveRefused` (nothing written) or with the storage error that aborted
 * the transaction (nothing written either).
 */
export async function importArchive(
  src: ArchiveSource,
  uid: string,
  opts: { onCollision: CollisionPolicy },
): Promise<ImportReport> {
  if (!uid) throw new Error("archive: no account to import into");
  const policy = opts.onCollision;
  const db = await openDb();
  try {
    const { rows } = await parseArchive(src, db.version);
    // Bytes decoded before the transaction opens: nothing awaited may sit
    // between a transaction's requests, or it commits half-way.
    const blobs = new Map<string, Row>();
    for (const u of rows.uploads) {
      const { blob, ...rest } = u as { blob: { type: string; b64: string } } & Row;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = fromB64(blob.b64);
      } catch {
        throw new ArchiveRefused("malformed", `upload ${u.id} is not valid base64`);
      }
      blobs.set(u.id as string, { ...rest, blob: new Blob([bytes], { type: blob.type }) });
    }
    return await writeArchive(db, rows, blobs, uid, policy);
  } finally {
    db.close();
  }
}

function writeArchive(
  db: IDBDatabase,
  rows: Record<ArchiveSection, Row[]>,
  blobs: Map<string, Row>,
  uid: string,
  policy: CollisionPolicy,
): Promise<ImportReport> {
  const report: ImportReport = {
    uid,
    projects: 0,
    steps: 0,
    themes: 0,
    assets: 0,
    uploads: 0,
    skipped: 0,
    replaced: 0,
    reminted: 0,
    remap: {},
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE], "readwrite");
    // The request's own error, caught before the transaction loses it — the
    // same capture studioDb#runTx does, for the same measured reason.
    let cause: unknown = null;
    tx.addEventListener(
      "error",
      (e) => {
        const target = e.target as IDBRequest | null;
        if (!cause && target && "error" in target) cause = target.error;
      },
      true,
    );
    tx.oncomplete = () => resolve(report);
    tx.onerror = () => reject(cause ?? tx.error ?? new Error("archive: import failed"));
    tx.onabort = () => reject(cause ?? tx.error ?? new Error("archive: import aborted"));

    const store = {
      projects: tx.objectStore(PROJECTS_STORE),
      steps: tx.objectStore(STEPS_STORE),
      themes: tx.objectStore(THEMES_STORE),
      assets: tx.objectStore(ASSETS_STORE),
      uploads: tx.objectStore(UPLOADS_STORE),
    };

    // ── 1 · read what is resident under every archive id, inside this tx ──
    const owner = { projects: new Map<string, unknown>(), themes: new Map<string, unknown>() };
    const residentAssets = new Map<string, Row>();
    const residentUploads = new Set<string>();
    const residentSteps = new Map<string, IDBValidKey[]>();
    let pending = 0;
    const settle = () => {
      if (--pending > 0) return;
      try {
        write();
      } catch (e) {
        cause = cause ?? e;
        try {
          tx.abort();
        } catch {
          /* already finishing */
        }
        reject(e);
      }
    };
    const read = <T>(req: IDBRequest<T>, take: (v: T) => void) => {
      pending++;
      req.onsuccess = () => {
        take(req.result);
        settle();
      };
    };
    for (const p of rows.projects) {
      const id = p.id as string;
      read(store.projects.get(id), (r) => r && owner.projects.set(id, (r as Row).uid));
      read(store.steps.index(BY_PROJECT).getAllKeys(id), (k) => residentSteps.set(id, k ?? []));
    }
    for (const t of rows.themes) {
      const id = t.id as string;
      read(store.themes.get(id), (r) => r && owner.themes.set(id, (r as Row).uid));
    }
    for (const a of rows.assets) {
      const id = a.id as string;
      read(store.assets.get(id), (r) => r && residentAssets.set(id, r as Row));
    }
    for (const u of rows.uploads) {
      const id = u.id as string;
      read(store.uploads.count(id), (c) => c > 0 && residentUploads.add(id));
    }
    if (pending === 0) {
      pending = 1;
      settle();
    }

    // ── 2 · decide and write, synchronously, in the same transaction ──
    function write() {
      const minted = new Set<string>();
      const mint = (kind: keyof typeof PREFIX) => {
        let id: string;
        do {
          id = `${PREFIX[kind]}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        } while (minted.has(id));
        minted.add(id);
        return id;
      };
      const decide = (resident: boolean, residentUid: unknown): Decision => {
        if (!resident) return "new";
        if (residentUid !== uid) return "remint";
        return policy === "skip" ? "skip" : policy === "replace" ? "replace" : "remint";
      };
      const count = (d: Decision) => {
        if (d === "skip") report.skipped++;
        else if (d === "replace") report.replaced++;
        else if (d === "remint") report.reminted++;
      };

      // Themes first: projects and assets point at them.
      const themeId = new Map<string, string>();
      for (const t of rows.themes) {
        const id = t.id as string;
        const d = decide(owner.themes.has(id), owner.themes.get(id));
        count(d);
        if (d === "skip") continue;
        const to = d === "remint" ? mint("themes") : id;
        if (to !== id) {
          themeId.set(id, to);
          report.remap[id] = to;
        }
        const row = { ...t, id: to, uid };
        if (d === "replace") store.themes.put(row);
        else store.themes.add(row);
        report.themes++;
      }

      const stepsOf = new Map<string, Row[]>();
      for (const st of rows.steps) {
        const list = stepsOf.get(st.projectId as string) ?? [];
        list.push(st);
        stepsOf.set(st.projectId as string, list);
      }
      for (const p of rows.projects) {
        const id = p.id as string;
        const d = decide(owner.projects.has(id), owner.projects.get(id));
        count(d);
        if (d === "skip") continue;
        const to = d === "remint" ? mint("projects") : id;
        if (to !== id) report.remap[id] = to;
        const row: Row = { ...p, id: to, uid };
        if (typeof p.themeId === "string" && themeId.has(p.themeId)) row.themeId = themeId.get(p.themeId);
        if (d === "replace") store.projects.put(row);
        else store.projects.add(row);
        report.projects++;
        // The step set is the archive's. Under replace that drops resident
        // steps the archive does not hold; under "new" the only resident steps
        // are orphans of a project that no longer exists, and they go too.
        if (d !== "remint") for (const k of residentSteps.get(id) ?? []) store.steps.delete(k);
        for (const st of stepsOf.get(id) ?? []) {
          store.steps.put({ ...st, id: `${to}:${st.phase as string}`, projectId: to });
          report.steps++;
        }
      }

      // Assets, and the bytes behind them.
      const uploadTo = new Map<string, string>();
      for (const a of rows.assets) {
        const id = a.id as string;
        const resident = residentAssets.get(id);
        const d = decide(!!resident, resident?.uid);
        count(d);
        if (d === "skip") continue;
        const row: Row = { ...a, uid };
        const meta: Row | undefined = isObj(a.meta) ? { ...a.meta } : undefined;
        if (meta) row.meta = meta;
        let to = d === "remint" ? mint("assets") : id;

        const proof = readProofPointer(a.src as string);
        if (proof && themeId.has(proof.themeId)) {
          const th = themeId.get(proof.themeId)!;
          row.src = proofPointer(th, proof.proofId);
          // A promoted proof's id is content-addressed (assets#promotedId), so
          // it follows its theme rather than taking a random one.
          if (id === promotedId(proof.themeId, proof.proofId)) to = promotedId(th, proof.proofId);
        }
        if (meta && typeof meta.themeId === "string" && themeId.has(meta.themeId)) {
          meta.themeId = themeId.get(meta.themeId);
        }
        if (meta && isObj(meta.provenance) && Array.isArray(meta.provenance.parentIds)) {
          meta.provenance = {
            ...meta.provenance,
            parentIds: meta.provenance.parentIds.map((x: unknown) =>
              typeof x === "string" && themeId.has(x) ? themeId.get(x) : x,
            ),
          };
        }

        const up = readUploadPointer(a.src as string);
        if (up && blobs.has(up)) {
          let target = uploadTo.get(up);
          if (!target) {
            const residentUp = resident ? readUploadPointer(String(resident.src)) : null;
            const overwrite = d === "replace" && residentUp === up;
            target = residentUploads.has(up) && !overwrite ? mint("uploads") : up;
            uploadTo.set(up, target);
            const bytes = { ...blobs.get(up)!, id: target };
            if (overwrite) store.uploads.put(bytes);
            else store.uploads.add(bytes);
            report.uploads++;
            if (target !== up) {
              report.reminted++;
              report.remap[up] = target;
            }
          }
          row.src = uploadPointer(target);
          if (meta && meta.uploadId === up) meta.uploadId = target;
        }
        // A replaced row that pointed at OTHER bytes leaves them unreachable;
        // they go with it, as v1 lib/assets#deleteAsset took them.
        if (d === "replace" && resident) {
          const old = readUploadPointer(String(resident.src));
          if (old && old !== readUploadPointer(String(row.src))) store.uploads.delete(old);
        }

        if (to !== id) report.remap[id] = to;
        row.id = to;
        if (d === "replace") store.assets.put(row);
        else store.assets.add(row);
        report.assets++;
      }
    }
  });
}
