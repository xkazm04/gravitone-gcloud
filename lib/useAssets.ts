"use client";

// Loading, seeding and removing the signed-in account's assets.
//
// The seed comes from the trial grid — `public/trials/index.json`, which
// pipeline/build-style-trials.mts writes. That is deliberate rather than
// convenient: those plates are the first genuinely reusable images this project
// has produced, and a shelf that starts empty teaches nothing about what a
// shelf is for.
//
// Seeded ONCE per account, marked in localStorage rather than IndexedDB —
// exactly as /projects does, and for the same reason: the mark has to survive
// the user deleting every seeded asset, or "remove" stops meaning remove and an
// emptied shelf silently refills on the next reload.

import { reportStorageTrouble } from "@/app/_phases/_shared/stepStore";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  assetFromProof,
  assetFromUpload,
  deleteAsset as dbDelete,
  folderRenameEntries,
  getAsset,
  getUploadBlobs,
  hydrateProofSrcs,
  hydrateUploadSrcs,
  EMPTY_PLATE,
  listAssets,
  moveAssets,
  putUploads,
  refileAssets,
  renameAsset,
  promotedFrom,
  putAssets,
  readProofPointer,
  readUploadPointer,
  type Asset,
} from "./assets";
import { getThemes, type Proof, type Theme } from "./themes";
import { presetById } from "@/app/library/presets";

const seededKey = (uid: string) => `gravitone.assets.seeded.${uid}`;

/**
 * The ceiling on one uploaded reference.
 *
 * Not a guess at what IndexedDB can hold — it is generous — but at what a
 * reference IS. These are things a style gets pointed at, and a 40 MB camera
 * original is a file the user meant to keep somewhere else. Refusing it by name
 * is kinder than accepting it and spending a browser quota the user cannot see
 * on a picture that will be downscaled before it is ever sent to a model.
 */
const MAX_UPLOAD_BYTES = 12_000_000;

function alreadySeeded(uid: string): boolean {
  try {
    return localStorage.getItem(seededKey(uid)) === "1";
  } catch {
    return true; // storage off: better a bare shelf than one that keeps reappearing
  }
}
function markSeeded(uid: string) {
  try {
    localStorage.setItem(seededKey(uid), "1");
  } catch {
    /* see above */
  }
}

interface TrialEntry {
  styleId: string;
  styleName: string;
  trialId: string;
  trialLabel: string;
  problem: string;
  beat: string;
  file: string;
  provider?: string;
  model?: string;
  grade?: unknown;
}

/**
 * Turn the trial index into shelf entries.
 *
 * Only the `google` grid is seeded. Both were rendered, but the graded
 * comparison put Leonardo at 23% usable against Nano Banana's 87%, and a shelf
 * of reusable work should not open with three-quarters unusable plates. The
 * Leonardo grid stays on disk for comparison; it is evidence, not inventory.
 */
async function seedFromTrials(uid: string): Promise<Asset[]> {
  const res = await fetch("/trials/index.json", { cache: "no-store" });
  if (!res.ok) return [];
  const doc = (await res.json()) as { entries?: TrialEntry[] };
  const now = Date.now();

  return (doc.entries ?? [])
    .filter((e) => (e.provider ?? "leonardo") === "google")
    .map((e, i) => ({
      // CONTENT-ADDRESSED, not time-or-index-addressed. React invokes effects
      // twice in development, so two seeds can run concurrently, both find an
      // empty shelf, and both write — which with random ids produced sixty
      // assets instead of thirty (measured, drive-assets.mjs). A deterministic
      // id makes the second write an overwrite of the first, so the seed is
      // idempotent by construction rather than by locking, and re-seeding after
      // a regenerated grid updates rows instead of duplicating them.
      id: `as-${e.provider ?? "leonardo"}-${e.styleId}-${e.trialId}`,
      uid,
      // <discipline> › styles › presets › <preset>. The folder chain the shelf
      // is browsed by; the root is the preset's discipline, or "shared" when
      // the trial names a preset the catalogue no longer has. Rows seeded
      // before the root existed keep `["styles", ...]`, and the tree shows
      // both — that is what is on the shelf, not a display bug.
      path: [presetById.get(e.styleId)?.discipline ?? "shared", "styles", "presets", e.styleId],
      name: e.trialLabel || e.trialId,
      src: e.file,
      kind: "image" as const,
      meta: {
        styleName: e.styleName,
        trialId: e.trialId,
        problem: e.problem,
        beat: e.beat,
        provider: e.provider,
        model: e.model,
        grade: e.grade,
      },
      createdAt: now + i,
    }));
}

/** Read the bytes a promoted proof points at. Only pays for the theme read when
 *  something on the shelf actually needs it — a sheet is base64 in the record,
 *  so listing every theme is not free — and then reads only the themes the
 *  pointers name (`getThemes`), not every style the account has. */
async function hydrateProofs(uid: string, rows: Asset[]): Promise<Asset[]> {
  const themeIds = rows.map((a) => readProofPointer(a.src)?.themeId).filter((id): id is string => Boolean(id));
  if (!themeIds.length) return rows;
  return hydrateProofSrcs(rows, await getThemes(uid, themeIds));
}

/** A storage failure is CLASSIFIED and published to the shared channel the bell
 *  reads (same five kinds as useProjects), and the raw sentence stays in `error`
 *  for the page's own banner. Without this a failed read of the assets came back
 *  as an empty list and was indistinguishable from "you have none". */
function failed(
  setError: (m: string) => void,
  op: "read" | "write",
  e: unknown,
  fallback: string,
): void {
  reportStorageTrouble(op, "", "assets", e);
  setError(e instanceof Error ? e.message : fallback);
}

/**
 * @param seed  Whether this mount may hand a first-time account the trial grid.
 *   The atelier passes false: it reads the shelf to know what is already on it
 *   and to promote onto it, and filling a shelf as a side effect of opening a
 *   different tab would be a surprise.
 */
export function useAssets(uid: string | null, { seed = true }: { seed?: boolean } = {}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UPLOADS STAY POINTERS HERE (Wave 4). This hook used to mint an object URL
  // for every uploaded plate on the shelf on every reload — the bytes of the
  // whole upload store read and held, for a gallery that draws two dozen tiles
  // at a time. The rows now keep their `upload:` pointer and the surface that
  // DRAWS them resolves only what it shows, through `useUploadSrcs` below,
  // which owns those URLs and releases them when the rows leave the screen.

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      let rows = await listAssets(uid);
      // Gated on the MARK alone, not on an empty shelf. A promoted proof is a
      // row, and an account that promoted one before ever opening Assets would
      // otherwise never be given the trial grid at all.
      if (seed && !alreadySeeded(uid)) {
        const seeded = await seedFromTrials(uid);
        if (seeded.length) {
          await putAssets(seeded);
          markSeeded(uid);
          rows = await listAssets(uid);
        }
      }
      // IMAGES ONLY. The audio shelf (app/library/audio) keeps its takes in the
      // same store with `kind: "audio"` and an empty `src`; counted here they
      // inflated the Assets tally by the 160-row audio seed and drew as blank
      // tiles. Audio is read by its own module, never by this hook.
      rows = rows.filter((a) => a.kind !== "audio");
      setAssets(await hydrateProofs(uid, rows));
      setError(null);
    } catch (e) {
      setAssets([]);
      failed(setError, "read", e, "could not read your assets");
    }
  }, [uid, seed]);

  useEffect(() => {
    if (!uid) {
      setAssets(null);
      return;
    }
    void reload();
  }, [uid, reload]);

  const remove = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setAssets((as) => (as ?? []).filter((a) => a.id !== id));
      setError(null);
    } catch (e) {
      failed(setError, "write", e, "could not remove the asset");
    }
  }, []);

  /**
   * Put an approved proof on the shelf.
   *
   * Idempotent by construction, not by checking: the id is content-addressed
   * (assets.ts#promotedId), so a second promotion overwrites the same row. The
   * local list is updated the same way — replace by id, never append — because
   * React 19 can run the caller twice.
   */
  const promote = useCallback(
    async (theme: Theme, proof: Proof): Promise<Asset | null> => {
      if (!uid) return null;
      try {
        const fresh = assetFromProof(uid, theme, proof);
        // A plate the user has since REFILED keeps where they put it. The id is
        // content-addressed, so a second promotion is an overwrite of the same
        // row (assets.ts#promotedId) — and `assetFromProof` recomputes the path
        // from the theme, so without this every reopened proof sheet would drag
        // the plate back out of the folder the user moved it to, silently and
        // on an action that reads as a no-op.
        const prior = await getAsset(fresh.id);
        // The NAME is preserved for the same reason as the path: both are the
        // user's edits to a shelf entry, and `assetFromProof` recomputes both
        // from the theme. A plate they renamed reverting to the proof's own
        // label the next time the sheet is opened is the same silent undo.
        const asset = prior ? { ...fresh, path: prior.path, name: prior.name } : fresh;
        await putAssets([asset]);
        // The stored row holds the pointer; the list holds what a gallery can
        // draw. Same record, dereferenced — see assets.ts.
        const [shown] = hydrateProofSrcs([asset], [theme]);
        setAssets((as) =>
          [...(as ?? []).filter((a) => a.id !== asset.id), shown].sort((a, b) =>
            a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          ),
        );
        setError(null);
        return asset;
      } catch (e) {
        failed(setError, "write", e, "could not put it on the shelf");
        return null;
      }
    },
    [uid],
  );

  /**
   * Refile rows under a new folder chain.
   *
   * Returns how many rows the store accepted, so a caller can say "moved 3
   * plates to presets" rather than announcing a number it assumed. Local state
   * is patched rather than reloaded: a reload would re-hydrate every promoted
   * proof on the shelf — re-reading the themes and rebuilding megabytes of
   * base64 — to reflect a change to one array of strings.
   */
  const move = useCallback(async (ids: string[], path: string[]): Promise<number> => {
    if (!ids.length) return 0;
    try {
      await moveAssets(ids, path);
      const moving = new Set(ids);
      setAssets((as) => (as ?? []).map((a) => (moving.has(a.id) ? { ...a, path } : a)));
      setError(null);
      return ids.length;
    } catch (e) {
      failed(setError, "write", e, "could not refile it");
      return 0;
    }
  }, []);

  /**
   * Put the user's own files on the shelf.
   *
   * Returns what was refused and why, rather than a boolean. Dropping a folder
   * of twelve files where three are PDFs and one is enormous is the ordinary
   * case, and "some files were not added" is not something a user can act on —
   * the caller names them.
   *
   * A local splice follows the write, not a reload. The reload was there so
   * hydration could mint each new row's object URL; rows keep their `upload:`
   * pointer now (the drawer resolves it), and a reload would re-read every
   * promoted proof's theme to show a file the user just handed over.
   */
  const addUploads = useCallback(
    async (files: File[], path: string[]): Promise<{ added: number; rejected: string[] }> => {
      if (!uid) return { added: 0, rejected: [] };
      const rejected: string[] = [];
      const pairs = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) {
          rejected.push(`${f.name} — not an image`);
          continue;
        }
        if (f.size > MAX_UPLOAD_BYTES) {
          rejected.push(`${f.name} — over ${Math.round(MAX_UPLOAD_BYTES / 1_000_000)} MB`);
          continue;
        }
        pairs.push(assetFromUpload(uid, f, path));
      }
      if (!pairs.length) return { added: 0, rejected };
      try {
        await putUploads(pairs);
        const fresh = new Map(pairs.map((p) => [p.asset.id, p.asset]));
        setAssets((as) =>
          [...(as ?? []).filter((a) => !fresh.has(a.id)), ...fresh.values()].sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          ),
        );
        setError(null);
        return { added: pairs.length, rejected };
      } catch (e) {
        failed(setError, "write", e, "could not add those files");
        return { added: 0, rejected };
      }
    },
    [uid],
  );

  /**
   * Rename one plate. An empty name is refused rather than stored: the shelf
   * reads `name` for the tile caption, the drawer heading and the removal
   * announcement, and a blank one would make a plate that cannot be referred
   * to by any of the three.
   */
  const rename = useCallback(async (id: string, raw: string): Promise<boolean> => {
    const name = raw.trim();
    if (!name) return false;
    try {
      await renameAsset(id, name);
      setAssets((as) => (as ?? []).map((a) => (a.id === id ? { ...a, name } : a)));
      setError(null);
      return true;
    } catch (e) {
      failed(setError, "write", e, "could not rename it");
      return false;
    }
  }, []);

  /**
   * Rename a folder — which, for a tree derived from paths, is a refile of
   * everything at or below it.
   *
   * Returns how many plates moved so the caller can say so. The entries are
   * computed from LOCAL state because that is what the user is looking at and
   * what the count they are about to be told refers to; the writes themselves
   * still go row by row through the store.
   */
  const renameFolder = useCallback(
    async (path: string[], raw: string): Promise<number> => {
      const name = raw.trim();
      if (!name || !path.length || name === path[path.length - 1]) return 0;
      const entries = folderRenameEntries(assets ?? [], path, name);
      if (!entries.length) return 0;
      try {
        await refileAssets(entries);
        const byId = new Map(entries.map((e) => [e.id, e.path]));
        setAssets((as) => (as ?? []).map((a) => (byId.has(a.id) ? { ...a, path: byId.get(a.id)! } : a)));
        setError(null);
        return entries.length;
      } catch (e) {
        failed(setError, "write", e, "could not rename the folder");
        return 0;
      }
    },
    [assets],
  );

  /** Drop every shelf entry promoted out of one theme — what deleting that
   *  theme has to do, since a promoted asset POINTS at bytes inside it and
   *  would otherwise be left pointing at nothing. */
  const removeFromTheme = useCallback(
    async (themeId: string) => {
      if (!uid) return;
      try {
        // From the STORE, not from local state: this runs beside a theme
        // deletion, and the shelf may never have been opened in this session.
        const doomed = promotedFrom(await listAssets(uid), themeId);
        for (const a of doomed) await dbDelete(a.id);
        const ids = new Set(doomed.map((a) => a.id));
        setAssets((as) => (as ?? []).filter((a) => !ids.has(a.id)));
        setError(null);
      } catch (e) {
        failed(setError, "write", e, "could not clear the promoted plates");
      }
    },
    [uid],
  );

  return {
    assets,
    error,
    loading: assets === null,
    reload,
    remove,
    move,
    rename,
    renameFolder,
    addUploads,
    promote,
    removeFromTheme,
  };
}


/**
 * Resolve the `upload:` pointers of the rows ON SCREEN, and nothing else.
 *
 * Returns a `draw(asset)` that hands back a row a gallery can paint: an
 * uploaded plate with an object URL this hook owns, a plate whose bytes are
 * gone renamed and marked (assets.ts#hydrateUploadSrcs, same as before), one
 * still being read as an empty frame, and every other row untouched.
 *
 * THE BLOB URLS THIS HOOK OWNS, RELEASED WHEN THEIR ROWS GO. An object URL
 * leaks until revoked, so ownership is stated (same rule as
 * app/playground/PlaygroundView.tsx). The caller passes every row it draws —
 * the window of the grid, the open plate, its siblings strip — and a URL is
 * revoked in the effect after the commit in which its row stopped being among
 * them, so nothing still mounted is holding it. A row that comes back (the
 * user returns to the folder) is read again; the bytes are local, and holding
 * every plate ever glanced at is the leak this replaces.
 *
 * Nothing downstream may revoke a `src` it was handed.
 */
export function useUploadSrcs(onScreen: readonly Asset[]): (a: Asset) => Asset {
  /** What a render may draw: upload id -> URL, or null for bytes that are gone. */
  const [table, setTable] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  /** What this hook has minted and must revoke. Touched only in effects. */
  const owned = useRef(new Map<string, string>());
  const gone = useRef(new Set<string>());

  // A string, so the effect runs when the SET of ids changes, not on every
  // render that rebuilt an equal array.
  const key = [
    ...new Set(onScreen.map((a) => readUploadPointer(a.src)).filter((id): id is string => Boolean(id))),
  ]
    .sort()
    .join("\n");

  useEffect(() => {
    const need = new Set(key ? key.split("\n") : []);
    for (const [id, url] of owned.current)
      if (!need.has(id)) {
        URL.revokeObjectURL(url);
        owned.current.delete(id);
      }
    for (const id of gone.current) if (!need.has(id)) gone.current.delete(id);
    const missing = [...need].filter((id) => !owned.current.has(id) && !gone.current.has(id));
    let live = true;
    const publish = () =>
      setTable(new Map<string, string | null>([...owned.current, ...[...gone.current].map((id) => [id, null] as const)]));
    // Always through the (async) read, even for nothing missing: the table is
    // rebuilt after the revocations above, never in the same synchronous pass.
    void getUploadBlobs(missing)
      .then((blobs) => {
        // A later window replaced this one while the read was out: mint
        // nothing for it, or the URLs would belong to no one.
        if (!live) return;
        for (const id of missing) {
          const blob = blobs.get(id);
          if (blob) owned.current.set(id, URL.createObjectURL(blob));
          else gone.current.add(id);
        }
        publish();
      })
      .catch((e: unknown) => {
        // A failed byte read draws the rows as missing rather than as frames
        // that wait forever, and the trouble channel hears it like any read.
        if (!live) return;
        reportStorageTrouble("read", "", "assets", e);
        for (const id of missing) gone.current.add(id);
        publish();
      });
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    const mine = owned.current;
    return () => {
      for (const url of mine.values()) URL.revokeObjectURL(url);
      mine.clear();
    };
  }, []);

  return useCallback(
    (a: Asset): Asset => {
      const id = readUploadPointer(a.src);
      if (!id) return a;
      const url = table.get(id);
      if (url) return { ...a, src: url };
      if (url === null) return hydrateUploadSrcs([a], new Map())[0];
      return { ...a, src: EMPTY_PLATE };
    },
    [table],
  );
}
