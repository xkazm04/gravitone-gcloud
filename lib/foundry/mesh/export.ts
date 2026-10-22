import "server-only";

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { FoundryError } from "../runStore";
import { readAsset, resolveInAsset } from "./store";
import { BUDGETS, TECHNIQUE_LABEL, type ExportProject, type MeshAsset, type MeshVariant, type Sidecar } from "./types";

// THE HAND-OFF TO A GAME PROJECT (spark game-3d-assets WP3, the Library's `export` act) - one
// finished variant's glb, and what travels beside it, written into a game project's checkout.
// FILES ONLY: nothing here runs git, in the project or anywhere - the project's owner reads the
// folder, commits and pushes (ASSET-PIPELINE.md "Transport to Wolf"). A project whose root is not
// on this machine is refused, never created.
//
// One adapter per project, each matching what that project already holds:
//   pof         generated/gravitone/<asset>-<variant>/<name>.glb + <name>.gravitone.json (the
//               Sidecar, lib/foundry/mesh/types.ts). PoF ignores /generated/ in git: a local import.
//   bp          apps/vr/ArtSource/<asset>-<variant>/final.glb + manifest.json, in the shape of
//               bp's own ArtSource manifests (studio-desk-lamp: id, class, budget_tris, tris,
//               generator, licence, gates {pass, note, date}, file_bytes, sha256). bp has no LFS:
//               every file under 10 MB, refused with its size when one is over.
//   mage-arena  apps/vr/art/<characters|props>/<asset>-<variant>/export/<SK|SM>_<Name>.glb +
//               manifest.json, the shape of its T38 hand-offs (characters/brennic: generated,
//               note, items [{asset, path, sha256, bytes}]). Its .gitattributes routes *.fbx and
//               *.png through LFS, not *.glb - the owner's call, said in the manifest's note.
//
// Each project's root: EXPORT_ROOT_POF / EXPORT_ROOT_MAGE_ARENA / EXPORT_ROOT_BP, else the
// sibling checkout of this one (`../pof` from the working directory).

export const BP_FILE_CAP = 10 * 1024 * 1024;

const REPO: { readonly [P in ExportProject]: string } = { pof: "pof", "mage-arena": "mage-arena", bp: "bp" };
const ENV: { readonly [P in ExportProject]: string } = { pof: "EXPORT_ROOT_POF", "mage-arena": "EXPORT_ROOT_MAGE_ARENA", bp: "EXPORT_ROOT_BP" };

/** Where a project's checkout is on this machine (not checked here). */
export function exportRoot(project: ExportProject, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env[ENV[project]]?.trim() || path.resolve(process.cwd(), "..", REPO[project]);
}

const ENGINE = "TRELLIS.2-4B via ComfyUI; Blender headless finish";

/** What travels beside the glb: enough to import it and to know what judged it. */
export function sidecarOf(a: MeshAsset, v: MeshVariant, commit?: string): Sidecar {
  return {
    id: `${a.id}-${v.id}`,
    asset: a.id,
    variant: v.id,
    class: a.brief.class,
    technique: v.technique,
    budgetTris: a.brief.budgetTris,
    ...(v.tris === undefined ? {} : { tris: v.tris }),
    ...(BUDGETS[a.brief.class].heightM === undefined ? {} : { heightM: BUDGETS[a.brief.class].heightM }),
    ...(v.files.rigged !== undefined && a.brief.rig !== undefined ? { rig: a.brief.rig } : {}),
    gates: v.gates,
    limitations: v.limitations,
    provenance: { made: a.createdAt, engine: ENGINE, ...(a.night === undefined ? {} : { night: a.night }), ...(a.concept === undefined ? {} : { concept: a.concept }), ...(commit === undefined ? {} : { gravitoneCommit: commit }) },
    rights: a.rights,
  };
}

/** One file to copy: from the asset, to a path under the export's folder. */
type Copy = { readonly from: string; readonly to: string; readonly bytes: number; readonly sha256: string };
export type ExportPlan = { readonly project: ExportProject; readonly root: string; readonly dir: string; readonly copies: readonly Copy[]; readonly manifest: { readonly to: string; readonly json: unknown } };
export type Exported = { readonly project: ExportProject; readonly dir: string; readonly wrote: readonly string[] };

const pascal = (s: string): string => s.split(/[^a-z0-9]+/i).filter((w) => w !== "").map((w) => w[0]?.toUpperCase() + w.slice(1)).join("");
const day = (iso: string): string => iso.slice(0, 10);

async function measured(abs: string, to: string): Promise<Copy> {
  const bytes = await readFile(abs);
  return { from: abs, to, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function optional(a: MeshAsset, rel: string | undefined, to: string): Promise<Copy[]> {
  if (rel === undefined) return [];
  const abs = resolveInAsset(a.id, rel);
  try {
    await stat(abs);
  } catch {
    return [];
  }
  return [await measured(abs, to)];
}

const gateNote = (g: Sidecar["gates"][number]): string => [g.score === undefined ? undefined : `score ${g.score}`, ...g.fails.map((f) => `fail: ${f}`), ...g.warns.map((w) => `warn: ${w}`), g.gradedAs].filter((x) => x !== undefined).join("; ") || g.verdict;

/** The files and manifest an export would write, every size checked; nothing is written. */
export async function planExport(a: MeshAsset, variantId: string, project: ExportProject, opts: { readonly root: string; readonly now: string; readonly commit?: string }): Promise<ExportPlan> {
  const v = a.variants.find((x) => x.id === variantId);
  if (v === undefined) throw new FoundryError(`Asset ${a.id} has no variant ${variantId}.`, 404);
  if (v.status !== "finished") throw new FoundryError(`Variant ${a.id}/${v.id} is ${v.status}, not finished: there is no glb to hand off.`, 409);
  const rel = v.files.rigged ?? v.files.glb;
  if (rel === undefined) throw new FoundryError(`Variant ${a.id}/${v.id} names no glb.`, 409);
  const glb = resolveInAsset(a.id, rel);
  const side = sidecarOf(a, v, opts.commit);
  const folder = `${a.id}-${v.id}`;
  const rigged = v.files.rigged !== undefined;
  let dir: string;
  let copies: Copy[];
  let manifest: { to: string; json: unknown };
  if (project === "pof") {
    dir = path.join(opts.root, "generated", "gravitone", folder);
    copies = [await measured(glb, `${folder}.glb`)];
    manifest = { to: `${folder}.gravitone.json`, json: side };
  } else if (project === "bp") {
    dir = path.join(opts.root, "apps", "vr", "ArtSource", folder);
    copies = [await measured(glb, "final.glb"), ...(await optional(a, a.concept, "concept.png")), ...(await optional(a, v.files.poster, "evidence/poster.png"))];
    const over = copies.find((c) => c.bytes > BP_FILE_CAP);
    if (over !== undefined) throw new FoundryError(`${over.to} is ${over.bytes} bytes; bp keeps every file under ${BP_FILE_CAP} bytes (no LFS).`, 413);
    manifest = {
      to: "manifest.json",
      json: {
        id: folder,
        class: a.brief.class,
        budget_tris: a.brief.budgetTris,
        ...(v.tris === undefined ? {} : { tris: v.tris, tris_total: v.tris }),
        generator: `${ENGINE} (Gravitone, ${v.technique} ${TECHNIQUE_LABEL[v.technique]})`,
        licence: "own work: made from our own concept image, never a found source",
        gates: Object.fromEntries(v.gates.map((g) => [g.name, { pass: g.verdict === "pass", note: gateNote(g), date: day(opts.now) }])),
        file_bytes: Object.fromEntries(copies.map((c) => [c.to, c.bytes])),
        sha256: Object.fromEntries(copies.map((c) => [c.to, c.sha256])),
        gravitone: side,
      },
    };
  } else {
    const shelf = a.brief.class === "character" ? "characters" : "props";
    dir = path.join(opts.root, "apps", "vr", "art", shelf, folder);
    const name = `${rigged ? "SK" : "SM"}_${pascal(a.id)}`;
    copies = [await measured(glb, `export/${name}.glb`), ...(await optional(a, v.files.poster, `export/${pascal(a.id)}_poster.png`))];
    const repoRel = (to: string): string => ["apps", "vr", "art", shelf, folder, to].join("/");
    manifest = {
      to: "manifest.json",
      json: {
        generated: day(opts.now),
        note: `${a.brief.subject}: ${a.brief.class}, ${v.technique} ${TECHNIQUE_LABEL[v.technique]}, exported from Gravitone as GLB (no FBX). .gitattributes does not route *.glb through LFS.`,
        items: copies.map((c) => ({ asset: path.posix.basename(c.to, path.posix.extname(c.to)), path: repoRel(c.to), sha256: c.sha256, bytes: c.bytes })),
        gravitone: side,
      },
    };
  }
  return { project, root: opts.root, dir, copies, manifest };
}

/** Plan, then write: the root must exist, every file must fit, and only then is anything copied. */
export async function exportVariant(assetId: string, variantId: string, project: ExportProject, opts: { readonly root?: string; readonly now?: string; readonly commit?: string } = {}): Promise<Exported> {
  const root = opts.root ?? exportRoot(project);
  try {
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new FoundryError(`The ${project} checkout is not at ${root}; set ${ENV[project]} to where it is.`, 404);
  }
  const a = await readAsset(assetId);
  const plan = await planExport(a, variantId, project, { root, now: opts.now ?? new Date().toISOString(), ...(opts.commit === undefined ? {} : { commit: opts.commit }) });
  const wrote: string[] = [];
  for (const c of plan.copies) {
    const to = path.join(plan.dir, c.to);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(c.from, to);
    wrote.push(to);
  }
  const m = path.join(plan.dir, plan.manifest.to);
  await mkdir(path.dirname(m), { recursive: true });
  await writeFile(m, `${JSON.stringify(plan.manifest.json, null, 2)}\n`);
  wrote.push(m);
  return { project, dir: plan.dir, wrote };
}
