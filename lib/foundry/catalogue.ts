// THE FOUNDRY CATALOGUE — server only. Two things live here since Phase 5:
//
// (1) THE STYLE STORE'S DOOR FOR V1 (Phase 5 decision 3). Styles are no longer a file: they are
//     rows in the kernel store (packages/kernel/src/styles), each write one transaction with its
//     event, the ratchet enforced at the write. pipeline/foundry/styles.json is an EXPORT of that
//     table, re-written after every change for the Python readers (forge.py prepare, grade.py).
//     The v1 readers in this tree still speak `StyleDef`, so `readStyleDefs` hands them the store
//     in that shape; the v1 writers (forge and extract commits, adopt) write through the kernel
//     and call `exportStyles` after. A store that holds no style yet takes the catalogue the repo
//     carries on first touch (`ensureStyles`) - a fixture universe, a new machine - instead of
//     reading as empty and then exporting an empty file over the real one.
//
// (2) THE FENCE FOR THE OTHER INDICES. ledger.json, training-ledger.json, motion-styles.json and
//     strips-ledger.json keep their v1 writers this phase (only styles moved), and still need what
//     `withCatalogue` gave them: one writer at a time across the forge, Dojo and Strips commits,
//     measured necessary 2026-10-05 (tests/golden-path/foundry-commit-race.probe.spec.ts: four
//     lost updates in four schedules). The lock is lib/diskTx.ts's queue plus an exclusive-create
//     lock at pipeline/foundry/.catalogue.lock (catalogue_lock.py takes it by the same protocol).
//     DROPPED: catalogue-journal.jsonl and styles.json's `_rev` stamping. The journal existed so a
//     crashed multi-file write could recover its revision; the style half is now a transaction,
//     and the remaining indices are each replaced per run (a retry converges without a journal).
//     A transaction's revision is now motion-styles.json's own counter + 1, which only the Strips
//     commit reads.

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Style } from "@gt/domain/style";
import { blobStore } from "@gt/kernel/blob";
import type { Store } from "@gt/kernel/store";
import type { StyleOpOutcome, StyleOpRequest } from "@gt/domain/styleView";
import { applyStyleOp, catalogueRevIn, listStylesIn } from "@gt/kernel/styles/driver";
import { writeStylesExport, type ExportReport } from "@gt/kernel/styles/export";
import { draftFromV1, importV1In, planImportV1In, readV1Catalogue, type ImportOutcome } from "@gt/kernel/styles/v1";

import { DEFAULT_LOCK_TIMING, exclusiveSection, type LockTiming } from "../diskTx";
import { outPath } from "../fixtures/roots";
import { blobRootOf, kernel } from "../kernelProcess.ts";
import { foundryFs } from "./fsPort";
import { FoundryError, foundryFile } from "./runStore";
import type { MotionStylesDoc, StripsLedgerDoc } from "./strips/triage";
import type { TrainingLedgerRow } from "./training/types";
import type { LedgerRow, StyleDef } from "./types";

export const CATALOGUE_LOCK = ".catalogue.lock";
export const STYLES_FILE = "styles.json";

/** RETIRED with the journal (Phase 5 decision 3): nothing writes this file any more. Exported
 *  only so v1's journal probe (tests/golden-path/foundry-catalogue-tx.probe.spec.ts) still
 *  typechecks until it retires with v1's Foundry in wave B; its journal assertions now fail. */
export const CATALOGUE_JOURNAL = "catalogue-journal.jsonl";
/** RETIRED with CATALOGUE_JOURNAL: the shape v1's journal lines had. */
export interface JournalLine {
  rev: number;
  at: string;
  op: string;
  run: string;
  ids: string[];
  by: string;
}

/** Where extract runs live (the exemplars' files): EXTRACT_STORE_DIR, else <out>/extract. */
export const extractRoot = (): string => process.env["EXTRACT_STORE_DIR"]?.trim() || outPath("extract");

/** The actor a v1 commit route writes as: the operator who pressed commit (v1 has no principal here). */
export const OPERATOR: Actor = { kind: "operator", id: "operator" };

/* ── (1) the style store ──────────────────────────────────────────────────── */

function store(): Store {
  const k = kernel();
  if (!k.ok) throw new FoundryError(`The style store cannot be opened: ${k.error.message}`, 503);
  return k.value.store;
}

function unwrap<T>(r: Result<T>, what: string): T {
  if (r.ok) return r.value;
  const status = r.error.code === "refused" || r.error.code === "conflict" ? 409 : r.error.code === "not-found" ? 404 : r.error.code === "invalid" ? 400 : 503;
  throw new FoundryError(`${what}: ${r.error.message}`, status);
}

/** Read an exemplar's file into the blob store; undefined when it is not on this machine. */
async function exemplarBlob(blobs: ReturnType<typeof blobStore>, run: string, file: string): Promise<BlobRef | undefined> {
  const abs = path.resolve(extractRoot(), run, file);
  if (!abs.startsWith(path.resolve(extractRoot()) + path.sep)) return undefined;
  let bytes: Uint8Array;
  try {
    bytes = await readFile(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return unwrap(await blobs.put(bytes, mime), `exemplar ${run}/${file}`);
}

export type V1ImportPlan = { readonly outcomes: readonly ImportOutcome[]; readonly refused: readonly { index: number; message: string }[] };

/**
 * styles.json's text into the store: exemplar files become blobs first (async, idempotent by
 * content), then one transaction imports every entry. `dry` plans the same outcomes and rolls
 * the transaction back. Shared by the one-time CLI (pipeline/import/styles.mts) and `ensureStyles`.
 */
export async function importStylesText(s: Store, text: string, opts: { readonly dry: boolean; readonly by: Actor }): Promise<V1ImportPlan> {
  const cat = unwrap(readV1Catalogue(text), STYLES_FILE);
  const blobs = blobStore(blobRootOf(s));
  const media = new Map<string, BlobRef>();
  for (const v of cat.styles)
    for (const x of v.exemplars ?? []) {
      // A dry plan only asks whether the file is here; it copies nothing, so it stands in a
      // well-formed ref that the plan's door check reads and nothing ever stores.
      const ref = opts.dry
        ? await readFile(path.resolve(extractRoot(), x.run, x.file)).then(() => ({ sha256: "0".repeat(64), bytes: 0, mime: "image/png" }), () => undefined)
        : await exemplarBlob(blobs, x.run, x.file);
      if (ref !== undefined) media.set(`${x.run}/${x.file}`, ref);
    }
  const at = new Date().toISOString();
  const reports = cat.styles.map((v) => draftFromV1(v, (run, file) => media.get(`${run}/${file}`), at));
  const outcomes = opts.dry ? unwrap(s.read((r) => planImportV1In(r, reports)), "import") : unwrap(s.tx((t) => importV1In(t, reports, opts.by)), "import");
  return { outcomes, refused: cat.refused };
}

/** First touch of a store with no style: import the catalogue the repo carries. One indexed
 *  probe per call, no process cache - a test or a CLI that replaces the store file under the
 *  same path must be seen as empty again. */
export async function ensureStyles(s: Store): Promise<void> {
  const any = unwrap(s.read((r) => r.get("SELECT EXISTS (SELECT 1 FROM styles) AS n")?.["n"]), "the style store");
  if (any === 1) return;
  let text: string | null = null;
  try {
    text = await readFile(foundryFile(STYLES_FILE), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (text !== null) await importStylesText(s, text, { dry: false, by: { kind: "machine", id: "styles/first-touch" } });
}

/** The store, with the repo's catalogue in it. */
export async function styleStore(): Promise<Store> {
  const s = store();
  await ensureStyles(s);
  return s;
}

/** A store style in v1's `StyleDef` shape, for the v1 readers until they retire. */
export function styleDefOf(s: Style): StyleDef {
  return {
    id: s.id,
    name: s.name,
    family: s.family,
    // A locked style is a proven one to every v1 reader (none of them knows the lock).
    status: s.status === "candidate" ? "candidate" : "proven",
    origin: { kind: s.origin.kind === "readback" || s.origin.kind === "extracted" ? s.origin.kind : "authored", ...(s.origin.source === undefined ? {} : { source: s.origin.source }), ...(s.origin.models === undefined ? {} : { models: s.origin.models }) },
    observables: Object.fromEntries(Object.entries(s.observables).filter((e): e is [string, string] => e[1] !== undefined)),
    recipe: s.recipe,
    negative: s.negative,
    evidence: s.evidence.map((e) => ({ run: e.run, scene: e.scene, mechanism: e.mechanism, verdict: e.verdict, at: e.at, ...(e.by === "agent" ? { by: "model" as const } : {}) })),
    ...(s.exemplars.length
      ? { exemplars: s.exemplars.flatMap((x) => (x.file === undefined ? [] : [{ kind: "extract" as const, run: x.run, file: x.file, role: x.role, ...(x.settled === undefined ? {} : { settled: x.settled }) }])) }
      : {}),
  };
}

/** Every style as v1's readers want it, and the catalogue revision. */
export async function readStyleDefs(): Promise<{ styles: StyleDef[]; rev: number }> {
  const s = await styleStore();
  return unwrap(
    s.read((r) => ({ styles: listStylesIn(r).map((row) => styleDefOf(row.style)), rev: catalogueRevIn(r) })),
    "the style store",
  );
}

/** Re-export pipeline/foundry/styles.json after a change. Loud on failure: the store holds the
 *  change, and a stale export is exactly what the Python readers would forge against. */
export function exportStyles(s: Store): ExportReport {
  return unwrap(writeStylesExport(s, foundryFile(STYLES_FILE)), `the store holds the change, but ${STYLES_FILE} was not re-exported`);
}

/** Run a style write in one store transaction, then re-export. */
export async function writeStyles<T>(what: string, fn: (s: Store) => Result<T>): Promise<T> {
  const s = await styleStore();
  const out = unwrap(fn(s), what);
  exportStyles(s);
  return out;
}

/** An operator's op on one style (the atelier's acts): applied in one store transaction, then
 *  styles.json re-exported when it changed anything. A refusal or a stale base writes nothing. */
export async function styleOp(req: StyleOpRequest, by: Actor): Promise<StyleOpOutcome> {
  const s = await styleStore();
  const out = unwrap(applyStyleOp(s, req, by), `style ${req.styleId}`);
  if (out.kind === "applied") exportStyles(s);
  return out;
}

/* ── (2) the fence for the other indices ──────────────────────────────────── */

/** The app's commits that write an index here. */
export type CatalogueOp = "forge-commit" | "extract-commit" | "dojo-commit" | "strip-commit";

export interface CatalogueDocs {
  "ledger.json": { rows: LedgerRow[] } & Record<string, unknown>;
  "training-ledger.json": { rows: TrainingLedgerRow[] } & Record<string, unknown>;
  // The Strips commit's two indices (lib/foundry/strips/store.ts). A code style is a module, not
  // a prompt, so it is not a Style (Phase 5 decision 4) and never enters the style store.
  "motion-styles.json": MotionStylesDoc & Record<string, unknown>;
  "strips-ledger.json": StripsLedgerDoc & Record<string, unknown>;
}
export type CatalogueIndex = keyof CatalogueDocs;

const EMPTY: { [K in CatalogueIndex]: () => CatalogueDocs[K] } = {
  "ledger.json": () => ({ rows: [] }),
  "training-ledger.json": () => ({ rows: [] }),
  "motion-styles.json": () => ({
    _purpose: "Code-rendered motion styles kept in the /foundry Strips triage: one entry per kept strip, its files under motion-styles/<id>/.",
    styles: [],
    _rev: 0,
  }),
  "strips-ledger.json": () => ({
    _purpose: "One row per decided code-rendered strip (kept and rejected), with its reason chips.",
    rows: [],
  }),
};

let timing: LockTiming | null = null;

/** PROBE ONLY, the same posture as __setFoundryFsPort: shorten the wait bound
 *  so the 503 path runs in milliseconds. null restores the defaults. */
export function __setCatalogueLockTiming(t: LockTiming | null): void {
  timing = t;
}

const exclusive = exclusiveSection(
  () => foundryFile(CATALOGUE_LOCK),
  () => ({
    timing: timing ?? DEFAULT_LOCK_TIMING,
    by: "app",
    onTimeout: (lock, waitMs) =>
      new FoundryError(
        `The Foundry indices are locked (${lock}) and the holder did not release it in ${waitMs} ms. Another commit or acquire.py is writing them; try again, and if nothing is running, delete the lock file.`,
        503,
      ),
  }),
);

export class CatalogueTx {
  private loaded: { [K in CatalogueIndex]?: CatalogueDocs[K] } = {};
  private rev: number | null = null;

  /** The revision this transaction writes under; null until `begin`. */
  get revision(): number | null {
    return this.rev;
  }

  /** Load an index once per transaction, through the port. */
  async read<K extends CatalogueIndex>(name: K): Promise<CatalogueDocs[K]> {
    const have = this.loaded[name];
    if (have) return have;
    const doc = await foundryFs().readJson<CatalogueDocs[K]>(foundryFile(name), EMPTY[name]());
    (this.loaded as Record<CatalogueIndex, unknown>)[name] = doc;
    return doc;
  }

  /** Mark the plan checked and mint the revision. Call once, after the token check, before
   *  the first write (a write before it is refused: the check must lead the writes). */
  async begin(ids: string[]): Promise<number> {
    void ids;
    if (this.rev !== null) return this.rev;
    this.rev = ((await this.read("motion-styles.json"))._rev ?? 0) + 1;
    return this.rev;
  }

  /** Write a loaded index through the port. */
  async write(name: CatalogueIndex): Promise<void> {
    if (this.rev === null) throw new Error(`catalogue: ${name} written before begin() — the plan check must lead the write`);
    const doc = this.loaded[name];
    if (!doc) throw new Error(`catalogue: ${name} written without being read in this transaction`);
    await foundryFs().writeJsonAtomic(foundryFile(name), doc);
  }

  /** v1 carried the revision onto styles.json here; styles.json is now the store's export,
   *  stamped with the store's revision, so there is nothing left to carry. Kept for the Dojo
   *  and Strips commits, which call it. */
  async stamp(): Promise<void> {}
}

/** Run one transaction over the other indices under the lock. Everything that reads an index to
 *  decide what to write — plan, token check, the writes — belongs inside `fn`. */
export function withCatalogue<T>(meta: { op: CatalogueOp; run: string }, fn: (tx: CatalogueTx) => Promise<T>): Promise<T> {
  void meta;
  return exclusive(() => fn(new CatalogueTx()));
}
