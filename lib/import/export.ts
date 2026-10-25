import { z } from "zod";

import { recipeById } from "@gt/catalog/recipes";
import { PHASES, TEMPLATE_FAMILY, TEMPLATES } from "@gt/catalog/projects";
import { blobRefSchema, type BlobRef } from "@gt/domain/blob";
import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import { digestOf } from "@gt/kernel/parts/core";
import { projectRecords } from "@gt/kernel/parts/driver";
import { loadProject } from "@gt/kernel/records/schema";
import type { Reader, Store } from "@gt/kernel/store";

import { framesFromUnits, type PictureUnit } from "@/lib/frames/picture/unit";

import { writeArchive, type Row, type Section } from "./archive.ts";
import { inlineRecord, restoreOriginal, type ReadBytes } from "./bytes.ts";

// THE RE-EXPORT - a kernel project as a `.gravitone` archive v1 can read back (Phase 4 wave D,
// L42; the Phase 4 exit item "an imported project round-trips with its plan").
//
// OVER THE KERNEL RECORDS, with one rule that makes the round trip exact: a record whose digest
// is still the one the import landed (the `project.imported` event's `held`) is written as the
// ORIGINAL v1 row - the import record keeps it with its bytes as blob refs (./bytes.ts), and
// restoring them gives v1's line back byte for byte. A record an editor or a job changed since
// is written from the kernel record, walked DOWN to v1's shape: blob refs inlined as data: URLs
// again, frames v3 -> v2 with the `frames` shadow rebuilt from the units (v1's
// lib/frames/picture/unit.ts `framesFromUnits`, the function v1's own reader rebuilds it with),
// frames-alts v2 -> v1. v1 reads both (its doors are loose; its parser walks v1/v2), so either
// way the browser gets its work back. An imported project's own row is v1's original except its title and
// `targetS`, which follow the kernel when they were edited since the import (withKernelEdits). Records the import carried as data only (a key no part
// holds) go back verbatim. A project the kernel composed itself (no import record) is written in
// v1's project shape when its recipe is a film of a v1 template; an album or explainer has none.

export type ExportInput = { readonly ids: readonly string[]; readonly uid: string; readonly now: number };

const importedSchema = z.object({ v1Id: z.string().min(1), record: blobRefSchema, held: z.record(z.string(), z.string()) });
// The rows inside stay `unknown`: a schema's output re-orders an object's keys (named first), and
// the original's key order IS its bytes.
const recordSchema = z.looseObject({
  kind: z.literal("gravitone-v1-import"),
  project: z.unknown(),
  steps: z.array(z.unknown()),
  theme: z.unknown().optional(),
  assets: z.array(z.unknown()),
  uploads: z.array(z.unknown()),
});

type Imported = z.output<typeof importedSchema>;
type Read = { readonly projectId: string; readonly imported?: Imported; readonly records: ReadonlyMap<string, Readonly<Record<string, unknown>>>; readonly recipe: string; readonly title: string; readonly runtimeS?: number; readonly createdAt: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON through the door, then the schema's own parse: these shapes are loose on purpose (the
 *  door's `Parsed` flattens a loose object's index signature over its named fields). */
function viaSchema<S extends z.ZodType>(where: string, schema: S, text: string): Result<z.output<S>> {
  const raw = parseJsonAt(where, z.unknown(), text);
  if (!raw.ok) return raw;
  const p = schema.safeParse(raw.value);
  return p.success ? ok(p.data) : err("invalid", `${where}: ${p.error.issues[0]?.message ?? "invalid"}`);
}

function readOne(r: Reader, id: string): Result<Read> {
  const project = loadProject(r, id);
  const ev = r.get("SELECT data FROM events WHERE type = 'project.imported' AND subject_id = ? ORDER BY seq DESC LIMIT 1", id);
  let imported: Imported | undefined;
  if (ev !== undefined) {
    const d = viaSchema(`project ${id} import event`, importedSchema, String(ev["data"]));
    if (!d.ok) return d;
    imported = d.value;
  }
  return ok({ projectId: id, ...(imported === undefined ? {} : { imported }), records: projectRecords(r, id).records, recipe: project.recipe, title: project.title, ...(project.runtimeS === undefined ? {} : { runtimeS: project.runtimeS }), createdAt: project.createdAt });
}

const reader = (blobs: BlobStore): ReadBytes => async (ref: BlobRef) => {
  const r = await blobs.read(ref);
  if (r.ok) return r.value;
  if (r.error.code === "not-found") return null;
  throw r.error;
};

/** A kernel record in v1's stored shape (see the header). */
async function downward(key: string, current: Readonly<Record<string, unknown>>, read: ReadBytes): Promise<Record<string, unknown>> {
  const inlined = await inlineRecord(current, read);
  if (!isObj(inlined)) throw new AppError("internal", `export: ${key} is not an object`);
  if (key === "frames") {
    const units = Array.isArray(inlined["units"]) ? (inlined["units"] as PictureUnit[]) : [];
    return { ...inlined, frames: framesFromUnits(units), v: 2 };
  }
  if (key === "frames-alts") return { ...inlined, v: 1 };
  return inlined;
}

const stepRow = (v1Id: string, key: string, data: Record<string, unknown>): Row => ({ id: `${v1Id}:${key}`, projectId: v1Id, phase: key, data });

/** The v1 project row for a project the kernel composed itself. */
function v1ProjectOf(p: Read, uid: string): Result<Row> {
  const template = recipeById(p.recipe)?.template;
  if (template === undefined) return err("refused", `a ${p.recipe} project has no v1 shape; only a film of a v1 template exports`);
  const at = Date.parse(p.createdAt);
  return ok({
    id: p.projectId,
    uid,
    title: p.title,
    logline: "",
    template,
    discipline: TEMPLATE_FAMILY[template],
    targetS: p.runtimeS ?? TEMPLATES.find((t) => t.id === template)?.defaultS ?? 120,
    createdAt: at,
    updatedAt: at,
    phase: PHASES[0],
    progress: Object.fromEntries(PHASES.map((x) => [x, "empty"])),
  });
}

/** An imported project's v1 row with the two fields the kernel owns since the import. The import
 *  wrote the kernel's title and runtime FROM the row (project.ts: a trimmed title, `Untitled film`
 *  when empty, 200 chars; `targetS` when positive, else the template's default), so a kernel value
 *  that is not what the row would give has been edited since - a rename, a new length - and goes
 *  back; one that is, leaves v1's row as it was, byte for byte. */
function withKernelEdits(row: Row, p: Read): Row {
  const was = (String(row["title"] ?? "").trim() || "Untitled film").slice(0, 200);
  const target = typeof row["targetS"] === "number" && row["targetS"] > 0 ? row["targetS"] : TEMPLATES.find((t) => t.id === row["template"])?.defaultS ?? 120;
  const title = p.title === was ? {} : { title: p.title };
  const targetS = p.runtimeS === undefined || p.runtimeS === target ? {} : { targetS: p.runtimeS };
  return { ...row, ...title, ...targetS };
}

async function rowsOf(p: Read, blobs: BlobStore, uid: string, into: Record<Section, Row[]>): Promise<Result<string>> {
  const read = reader(blobs);
  if (p.imported === undefined) {
    const head = v1ProjectOf(p, uid);
    if (!head.ok) return head;
    into.projects.push(head.value);
    const keys = [...p.records.keys()].sort();
    for (const key of keys) {
      const cur = p.records.get(key);
      if (cur !== undefined) into.steps.push(stepRow(p.projectId, key, await downward(key, cur, read)));
    }
    return ok(p.projectId);
  }
  const bytes = await read(p.imported.record);
  if (bytes === null) return err("not-found", `the import record of ${p.projectId} is not in the blob store`);
  const rec = viaSchema(`import record of ${p.projectId}`, recordSchema, new TextDecoder().decode(bytes));
  if (!rec.ok) return rec;
  const v1Id = p.imported.v1Id;
  const restored = async (x: unknown): Promise<Row> => {
    const v = await restoreOriginal(x, read);
    if (!isObj(v)) throw new AppError("internal", `export: a restored row of ${p.projectId} is not an object`);
    return v;
  };
  into.projects.push(withKernelEdits(await restored(rec.value.project), p));
  const held = p.imported.held;
  const seen = new Set<string>();
  const steps: Row[] = [];
  for (const original of rec.value.steps) {
    const key = isObj(original) ? String(original["phase"]) : "";
    seen.add(key);
    if (!Object.hasOwn(held, key)) {
      steps.push(await restored(original));
      continue;
    }
    const cur = p.records.get(key);
    if (cur === undefined) continue; // removed since the import: v1 has no tombstone for a step row
    steps.push(digestOf(cur) === held[key] ? await restored(original) : stepRow(v1Id, key, await downward(key, cur, read)));
  }
  for (const [key, cur] of p.records) if (!seen.has(key)) steps.push(stepRow(v1Id, key, await downward(key, cur, read)));
  // v1 exports a project's steps in key order (an index read, studioDb `BY_PROJECT`).
  into.steps.push(...steps.sort((a, b) => (String(a["id"]) < String(b["id"]) ? -1 : String(a["id"]) > String(b["id"]) ? 1 : 0)));
  if (rec.value.theme !== undefined) into.themes.push(await restored(rec.value.theme));
  for (const a of rec.value.assets) into.assets.push(await restored(a));
  for (const u of rec.value.uploads) into.uploads.push(await restored(u));
  return ok(v1Id);
}

/** The projects `ids` as one `.gravitone` archive (gzip), in v1's format. */
export async function exportProjects(store: Store, blobs: BlobStore, input: ExportInput): Promise<Result<Uint8Array>> {
  const read = store.read((r) => input.ids.map((id) => readOne(r, id)));
  if (!read.ok) return read;
  const rows: Record<Section, Row[]> = { projects: [], steps: [], themes: [], assets: [], uploads: [] };
  const v1Ids: string[] = [];
  for (const one of read.value) {
    if (!one.ok) return one;
    const id = await rowsOf(one.value, blobs, input.uid, rows);
    if (!id.ok) return id;
    v1Ids.push(id.value);
  }
  // Two projects built on one theme carry it once (v1's archive refuses an id twice).
  const once = (list: Row[]) => [...new Map(list.map((x) => [String(x["id"]), x])).values()];
  return ok(writeArchive({ exportedAt: input.now, from: input.uid, scope: "project", projectIds: v1Ids }, { ...rows, themes: once(rows.themes), assets: once(rows.assets), uploads: once(rows.uploads) }));
}
