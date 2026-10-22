// THE FINISH UNIT (spark game-3d-assets WP2) - one variant `generated` -> `finished`, through the
// ported lynx-bench Blender scripts (pipeline/mesh/blender/), each run bounded by ./blender.ts:
//
//   finish.py   raw.glb -> <name>_static.glb + .blend: weld on import (raw TRELLIS is a split-vertex
//               soup), floaters under 1% of faces removed, a character scaled to 1.8 m, metallic
//               clamped to 0.5          (M1: touchup.py instead - the weapon touch-up, on raw.glb)
//   rig.py      a character whose brief asks for a rig: UE5 Mannequin chain names, heat weights on a
//               watertight voxel proxy transferred to the mesh, normalised -> <name>_rigged.glb
//   metrics.py  PoF's mesh metrics over the delivered glb (rigged when rigged)
//   render.py   the poster (hero 3/4, 1024) and the 640x480 game-camera view
//   views4.py   four orthographic views, composed by ffmpeg into one turnaround strip
//
// then the export PROVEN by reading it (./glb.ts readBack: triangles, joints, no Draco - PoF's
// viewer cannot decode it), then the ported PoF gates (./grade.ts). Any Blender step that fails
// fails the variant with Blender's own last lines; the turnaround is evidence, not the asset, so a
// failed composite is a limitation. A DRY finish runs none of it: a stand-in glb at the class's
// size (rigged when the brief asks), a committed picture as the poster, and the same gates read
// off the stand-in - so a dry run proves the plumbing and every gate reads a real file.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { UnitIo, UnitOutcome } from "@gt/producers/mesh/define";

import type { MeshMetrics } from "./gates/mesh-score";
import { blenderCommand, runBlender, SCRIPTS, spawnBounded } from "./blender";
import { assetOf } from "./generate";
import { readBack } from "./glb";
import { gradeFinished, readMeasured, type Measured } from "./grade";
import { glbMetrics } from "./metrics";
import { standInGlb } from "./standin";
import { resolveInAsset } from "./store";
import type { MeshAsset, MeshVariant, VariantFiles } from "./types";
import { failedWith, meshName, weaponKind, writeVariant } from "./variant";

export type FinishEngines = {
  /** The Blender command prefix ([blender.exe]; [node, fake.mjs] under test). */
  readonly command: readonly string[];
  /** The ported scripts' directory, absolute. */
  readonly scripts: string;
  readonly ffmpeg: string;
  readonly stepTimeoutMs: number;
  /** Where the dry poster is read from (the checkout). */
  readonly root: string;
};

export const liveFinishEngines = (root: string = process.cwd()): FinishEngines => ({
  command: blenderCommand(),
  scripts: path.resolve(root, SCRIPTS),
  ffmpeg: process.env["FFMPEG"] ?? "ffmpeg",
  stepTimeoutMs: 15 * 60_000,
  root,
});

/** A committed picture of OUR OWN, what a dry finish shows as its poster (lib/foundry/scout/scene.ts). */
const DRY_POSTER = path.join("public", "clips", "presets", "blueprint.jpg");
const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

type Made = { readonly files: VariantFiles; readonly limitations: string[]; readonly metrics: Measured<MeshMetrics>; readonly delivered: string; readonly finished: string; readonly rigged?: string };

const rigs = (a: MeshAsset, v: MeshVariant): boolean => a.brief.rig === "ue5-mannequin" && a.brief.class === "character" && v.technique !== "M1";

async function dryFinish(a: MeshAsset, v: MeshVariant, e: FinishEngines): Promise<Made> {
  const name = meshName(a.id, v.id);
  const rel = (f: string): string => `${v.id}/${f}`;
  const finished = rel(`${name}_static.glb`);
  await writeFile(resolveInAsset(a.id, finished), standInGlb(a.brief.class, { name: `SM_${name}` }));
  let rigged: string | undefined;
  if (rigs(a, v)) {
    rigged = rel(`${name}_rigged.glb`);
    await writeFile(resolveInAsset(a.id, rigged), standInGlb(a.brief.class, { name: `SM_${name}`, rig: true }));
  }
  const src = path.join(e.root, DRY_POSTER);
  const poster = existsSync(src) ? rel(`${name}_hero.jpg`) : rel(`${name}_hero.png`);
  if (existsSync(src)) await copyFile(src, resolveInAsset(a.id, poster));
  else await writeFile(resolveInAsset(a.id, poster), Buffer.from(PIXEL_PNG, "base64"));
  const delivered = rigged ?? finished;
  return {
    files: { ...v.files, glb: finished, poster, ...(rigged === undefined ? {} : { rigged }) },
    limitations: ["dry run: a stand-in box at the class's size, not a TRELLIS mesh; the poster is a placeholder picture"],
    metrics: { ok: true, value: glbMetrics(new Uint8Array(await readFile(resolveInAsset(a.id, delivered)))) },
    delivered,
    finished,
    ...(rigged === undefined ? {} : { rigged }),
  };
}

/** metrics.py's answer as PoF's MeshMetrics; a key it did not write makes the mesh gate unmeasured. */
export function metricsFrom(x: Record<string, unknown>): Measured<MeshMetrics> {
  const num = (k: string): number | undefined => (typeof x[k] === "number" ? (x[k] as number) : undefined);
  const bool = (k: string): boolean | undefined => (typeof x[k] === "boolean" ? (x[k] as boolean) : undefined);
  const bbox = Array.isArray(x["bbox"]) && x["bbox"].length === 3 && x["bbox"].every((n) => typeof n === "number") ? (x["bbox"] as [number, number, number]) : undefined;
  const verts = num("verts");
  const faces = num("faces");
  const watertight = bool("watertight");
  const winding = bool("windingConsistent");
  const components = num("components");
  if (verts === undefined || faces === undefined || watertight === undefined || winding === undefined || components === undefined || bbox === undefined) {
    return { ok: false, why: "metrics.py wrote no verts, faces, watertight, windingConsistent, components or bbox" };
  }
  const hist = Array.isArray(x["componentFaces"]) ? x["componentFaces"].filter((n): n is number => typeof n === "number") : undefined;
  return {
    ok: true,
    value: {
      verts,
      faces,
      watertight,
      windingConsistent: winding,
      components,
      euler: num("euler") ?? 0,
      bbox,
      volume: num("volume") ?? null,
      area: num("area") ?? 0,
      degenerateFaces: num("degenerateFaces") ?? 0,
      ...(hist === undefined ? {} : { componentFaces: hist }),
      ...(num("componentFacesOmitted") === undefined ? {} : { componentFacesOmitted: num("componentFacesOmitted") }),
    },
  };
}

type Step = (script: string, args: readonly string[], result: string, env?: Record<string, string>) => Promise<Result<Record<string, unknown>>>;

async function liveFinish(a: MeshAsset, v: MeshVariant, e: FinishEngines): Promise<Result<Made>> {
  const name = meshName(a.id, v.id);
  const dir = resolveInAsset(a.id, v.id);
  const rel = (f: string): string => `${v.id}/${f}`;
  const abs = (f: string): string => path.join(dir, f);
  const raw = v.files.raw === undefined ? undefined : resolveInAsset(a.id, v.files.raw);
  if (raw === undefined || !existsSync(raw)) return err("refused", `${v.id} has no raw.glb to finish`);
  const step: Step = async (script, args, result, env) => {
    const r = await runBlender({ command: e.command, script: path.join(e.scripts, script), args, result, timeoutMs: e.stepTimeoutMs, ...(env === undefined ? {} : { env }) });
    return r.ok ? ok((r.result ?? {}) as Record<string, unknown>) : err("unavailable", r.message);
  };
  const limitations: string[] = [];
  let finished: string;
  let blend: string | undefined;
  if (v.technique === "M1") {
    const kind = weaponKind(a.brief.subject);
    if (kind === undefined) return err("refused", `the M1 touch-up knows sword, mace, axe and staff; the subject "${a.brief.subject}" names none of them`);
    if (a.concept === undefined) return err("refused", "the M1 touch-up regrades toward the concept, and the asset has none");
    const t = await step("touchup.py", [raw, resolveInAsset(a.id, a.concept), abs(`${name}_touchup`), kind], abs(`${name}_touchup.touchup.json`));
    if (!t.ok) return t;
    for (const x of Array.isArray(t.value["not_fixed"]) ? t.value["not_fixed"] : []) limitations.push(String(x));
    finished = rel(`${name}_touchup.glb`);
  } else {
    const f = await step("finish.py", [raw, dir, name, a.brief.class], abs(`${name}_finish.json`));
    if (!f.ok) return f;
    finished = rel(`${name}_static.glb`);
    blend = rel(`${name}_finish.blend`);
  }
  let rigged: string | undefined;
  if (rigs(a, v) && blend !== undefined) {
    const r = await step("rig.py", [resolveInAsset(a.id, blend), dir, name, dir], abs(`${name}_rig.json`));
    if (!r.ok) return r;
    rigged = rel(`${name}_rigged.glb`);
    blend = rel(`${name}_rigged.blend`);
    const fb = Number(r.value["nearest_bone_fallback_verts"] ?? 0);
    if (fb > 0) limitations.push(`${fb} vertices took nearest-bone weights because the proxy heat left them unweighted`);
    const how = String(r.value["weights"] ?? "");
    if (how !== "" && !how.startsWith("proxy heat")) limitations.push(`rig weights: ${how}`);
  }
  const delivered = rigged ?? finished;
  const m = await step("metrics.py", [resolveInAsset(a.id, delivered), abs("metrics.json")], abs("metrics.json"));
  if (!m.ok) return m;
  const s = await step("render.py", [resolveInAsset(a.id, delivered), dir, name, "stills"], abs(`${name}_render.json`));
  if (!s.ok) return s;
  let turnaround: string | undefined;
  const views = await step("views4.py", [resolveInAsset(a.id, delivered), abs(`${name}_view`)], abs(`${name}_view_views.json`));
  if (!views.ok) limitations.push(`no turnaround: ${views.error.message}`);
  else {
    const ins = [0, 1, 2, 3].flatMap((i) => ["-i", abs(`${name}_view_${i}.png`)]);
    const c = await spawnBounded([e.ffmpeg], ["-y", "-v", "error", ...ins, "-filter_complex", "hstack=4", abs(`${name}_turnaround.png`)], { timeoutMs: 60_000 });
    if (c.code === 0) turnaround = rel(`${name}_turnaround.png`);
    else limitations.push(`no turnaround: ffmpeg could not compose the four views: ${c.error ?? c.tail}`);
  }
  return ok({
    files: { ...v.files, glb: finished, poster: rel(`${name}_hero.png`), gameplay: rel(`${name}_gameplay.png`), ...(blend === undefined ? {} : { blend }), ...(rigged === undefined ? {} : { rigged }), ...(turnaround === undefined ? {} : { turnaround }) },
    limitations,
    metrics: metricsFrom(m.value),
    delivered,
    finished,
    ...(rigged === undefined ? {} : { rigged }),
  });
}

export async function finishVariant(assetId: string, variantId: string, io: UnitIo, e: FinishEngines): Promise<Result<UnitOutcome>> {
  const got = await assetOf(assetId);
  if (!got.ok) return got;
  const a = got.value;
  const v = a.variants.find((x) => x.id === variantId);
  if (v === undefined) return err("not-found", `asset ${assetId} has no variant ${variantId}`);
  if (v.status !== "generated") return ok({ kind: "done", status: v.status });
  const t0 = Date.now();
  await mkdir(resolveInAsset(a.id, v.id), { recursive: true });
  const fail = async (why: string): Promise<Result<UnitOutcome>> => {
    io.stillHeld();
    await writeVariant(assetId, variantId, io.jobId, (x) => failedWith(x, why));
    return ok({ kind: "done", status: "failed", error: why });
  };
  let made: Made;
  if (io.dry) made = await dryFinish(a, v, e);
  else {
    const r = await liveFinish(a, v, e);
    if (!r.ok) return fail(r.error.message);
    made = r.value;
  }
  // The export proven by reading it back: the file the game will import, not Blender's word for it.
  const back = await readMeasured(resolveInAsset(a.id, made.finished), "finished glb");
  if (!back.ok) return fail(back.why);
  let tris: number;
  try {
    const rb = readBack(back.value);
    if (rb.draco) return fail(`${made.finished} was exported with Draco compression, which PoF's viewer cannot decode`);
    if (rb.tris === 0) return fail(`${made.finished} reads back with no triangles`);
    tris = rb.tris;
  } catch (x) {
    return fail(`${made.finished} does not read back as a glb: ${x instanceof Error ? x.message : String(x)}`);
  }
  const rigged = rigs(a, v) ? await readMeasured(made.rigged === undefined ? undefined : resolveInAsset(a.id, made.rigged), "rigged glb") : undefined;
  const gates = gradeFinished({ cls: a.brief.class, budgetTris: a.brief.budgetTris, metrics: made.metrics, ...(rigged === undefined ? {} : { rigged }) });
  io.stillHeld();
  await writeVariant(assetId, variantId, io.jobId, (x) => {
    const { error: _e, ...rest } = x;
    // The concept's input gate stays beside the mesh's: a warn it passed with is part of the record.
    return { ...rest, status: "finished", files: made.files, gates: [...x.gates.filter((g) => g.name === "input"), ...gates], tris, limitations: [...made.limitations] };
  });
  return ok({ kind: "done", status: "finished", seconds: Math.round((Date.now() - t0) / 100) / 10 });
}
