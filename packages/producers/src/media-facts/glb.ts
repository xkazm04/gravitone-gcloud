import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import type { MeshFacts } from "@gt/domain/library";

// A GLB'S OWN COUNTS, READ IN PURE TS (spark game-3d-assets): the 12-byte header, the JSON chunk,
// and the counts its accessors declare - no decoder, no WebGL, no Blender. A model/gltf-binary blob
// used to fall through media-facts' ffprobe branch and be written undecodable (ffprobe knows no
// glTF); this is what the probe reads instead.
//
// What is counted, and how (glTF 2.0 §3.7.2, §5.24):
//   tris    per primitive by its mode: TRIANGLES (4, the default) is count/3, a STRIP (5) or a FAN
//           (6) count-2, points and lines (0-3) none - `count` being the indices accessor's when
//           the primitive is indexed, else POSITION's. A mesh counts once per node that draws it
//           (an instanced rock drawn three times is three rocks in the game's budget); a file with
//           no node naming any mesh counts each mesh once.
//   verts   POSITION's count, by the same instancing rule.
//   bones   the distinct joint nodes across every skin.
//   clips   animations; images the file's images, used or not.
//   bboxM   POSITION min/max of each drawn primitive, through its node's world transform (TRS or
//           matrix, parents first). Absent when any drawn POSITION omits min or max - the spec
//           requires both, and a file without them is not one this guesses for.
//
// Every refusal is a sentence that names what was wrong where, because it is what the Library's
// detail quotes beside an `unreadable` item.

export type GlbRead = { readonly ok: true; readonly facts: MeshFacts } | { readonly ok: false; readonly error: string };

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

type Accessor = { count?: unknown; min?: unknown; max?: unknown };
type Primitive = { attributes?: Record<string, unknown>; indices?: unknown; mode?: unknown };
type Node = { mesh?: unknown; children?: unknown; matrix?: unknown; translation?: unknown; rotation?: unknown; scale?: unknown };
type Gltf = { accessors?: Accessor[]; meshes?: { primitives?: Primitive[] }[]; nodes?: Node[]; skins?: { joints?: unknown }[]; animations?: unknown[]; images?: unknown[]; scenes?: { nodes?: unknown }[] };

class Refused extends Error {}
const refuse = (msg: string): never => {
  throw new Refused(msg);
};
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const nums = (x: unknown, n: number): number[] | undefined => (Array.isArray(x) && x.length === n && x.every((v) => typeof v === "number") ? (x as number[]) : undefined);

type M4 = number[];
const IDENT: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major a*b, glTF's order. */
function mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] = (o[c * 4 + r] ?? 0) + (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
  return o;
}

function localOf(n: Node): M4 {
  const m = nums(n.matrix, 16);
  if (m !== undefined) return m;
  const [tx, ty, tz] = nums(n.translation, 3) ?? [0, 0, 0];
  const [x, y, z, w] = nums(n.rotation, 4) ?? [0, 0, 0, 1];
  const [sx, sy, sz] = nums(n.scale, 3) ?? [1, 1, 1];
  const [qx, qy, qz, qw] = [x ?? 0, y ?? 0, z ?? 0, w ?? 1];
  const r = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw), 2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw), 2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy)];
  const s = [sx ?? 1, sy ?? 1, sz ?? 1];
  const at = (i: number) => r[i] ?? 0;
  return [at(0) * (s[0] ?? 1), at(1) * (s[0] ?? 1), at(2) * (s[0] ?? 1), 0, at(3) * (s[1] ?? 1), at(4) * (s[1] ?? 1), at(5) * (s[1] ?? 1), 0, at(6) * (s[2] ?? 1), at(7) * (s[2] ?? 1), at(8) * (s[2] ?? 1), 0, tx ?? 0, ty ?? 0, tz ?? 0, 1];
}

const apply = (m: M4, p: readonly number[]): number[] => [0, 1, 2].map((r) => (m[r] ?? 0) * (p[0] ?? 0) + (m[4 + r] ?? 0) * (p[1] ?? 0) + (m[8 + r] ?? 0) * (p[2] ?? 0) + (m[12 + r] ?? 0));

/** Each node that draws a mesh, with its world transform; parents first, each node once. */
function drawn(g: Gltf): { mesh: number; world: M4 }[] {
  const nodes = g.nodes ?? [];
  const isChild = new Set<number>();
  for (const n of nodes) if (Array.isArray(n.children)) for (const c of n.children) if (isInt(c)) isChild.add(c);
  const out: { mesh: number; world: M4 }[] = [];
  const seen = new Set<number>();
  const walk = (i: number, parent: M4): void => {
    const n = nodes[i];
    if (n === undefined) refuse(`a node names child ${i}, which does not exist`);
    if (seen.has(i)) return;
    seen.add(i);
    const world = mul(parent, localOf(n as Node));
    if (isInt((n as Node).mesh)) out.push({ mesh: (n as Node).mesh as number, world });
    const kids = (n as Node).children;
    if (Array.isArray(kids)) for (const c of kids) if (isInt(c)) walk(c, world);
  };
  nodes.forEach((_, i) => {
    if (!isChild.has(i)) walk(i, IDENT);
  });
  return out;
}

function countOf(g: Gltf, ref: unknown, where: string): Accessor & { count: number } {
  if (!isInt(ref)) refuse(`${where} names no accessor`);
  const a = (g.accessors ?? [])[ref as number];
  if (a === undefined) return refuse(`${where} names accessor ${String(ref)}, which does not exist`);
  if (!isInt(a.count)) refuse(`accessor ${String(ref)} has no count`);
  return a as Accessor & { count: number };
}

function factsOfJson(g: Gltf): MeshFacts {
  const meshes = g.meshes ?? [];
  const uses = drawn(g);
  const draws = uses.length > 0 ? uses : meshes.map((_, mesh) => ({ mesh, world: IDENT }));
  let tris = 0;
  let verts = 0;
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  let boxed = true;
  for (const d of draws) {
    const mesh = meshes[d.mesh];
    if (mesh === undefined) refuse(`a node draws mesh ${d.mesh}, which does not exist`);
    (mesh?.primitives ?? []).forEach((p, i) => {
      const where = `primitive ${i} of mesh ${d.mesh}`;
      const pos = countOf(g, p.attributes?.["POSITION"], `${where} POSITION`);
      const n = p.indices === undefined ? pos.count : countOf(g, p.indices, `${where} indices`).count;
      const mode = p.mode === undefined ? 4 : p.mode;
      tris += mode === 4 ? Math.floor(n / 3) : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0;
      verts += pos.count;
      const mn = nums(pos.min, 3);
      const mx = nums(pos.max, 3);
      if (mn === undefined || mx === undefined) {
        boxed = false;
        return;
      }
      for (const cx of [mn[0], mx[0]]) for (const cy of [mn[1], mx[1]]) for (const cz of [mn[2], mx[2]]) {
        const w = apply(d.world, [cx ?? 0, cy ?? 0, cz ?? 0]);
        lo = lo.map((v, k) => Math.min(v, w[k] ?? 0));
        hi = hi.map((v, k) => Math.max(v, w[k] ?? 0));
      }
    });
  }
  const joints = new Set<number>();
  for (const s of g.skins ?? []) if (Array.isArray(s.joints)) for (const j of s.joints) if (isInt(j)) joints.add(j);
  const round = (x: number) => Math.round(x * 1e4) / 1e4;
  const bbox = boxed && draws.length > 0 && Number.isFinite(lo[0]) ? ([0, 1, 2].map((k) => round((hi[k] ?? 0) - (lo[k] ?? 0))) as [number, number, number]) : undefined;
  return { tris, verts, bones: joints.size, clips: (g.animations ?? []).length, images: (g.images ?? []).length, ...(bbox === undefined ? {} : { bboxM: bbox }) };
}

/** A GLB's counts, or the sentence that says why it is not one this can read. Total: never throws. */
export function readGlb(bytes: Uint8Array): GlbRead {
  try {
    if (bytes.byteLength < 20) return { ok: false, error: `glb: ${bytes.byteLength} bytes is shorter than a header and one chunk` };
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = v.getUint32(0, true);
    if (magic !== MAGIC) return { ok: false, error: `glb: the magic is 0x${magic.toString(16).padStart(8, "0")}, not glTF` };
    const version = v.getUint32(4, true);
    if (version !== 2) return { ok: false, error: `glb: container version ${version}; only 2 is read` };
    const length = v.getUint32(8, true);
    if (length > bytes.byteLength) return { ok: false, error: `glb: the header declares ${length} bytes, the file holds ${bytes.byteLength}` };
    const jsonLen = v.getUint32(12, true);
    const type = v.getUint32(16, true);
    if (type !== JSON_CHUNK) return { ok: false, error: `glb: the first chunk is 0x${type.toString(16)}, not JSON` };
    if (20 + jsonLen > length) return { ok: false, error: `glb: the JSON chunk runs ${20 + jsonLen - length} bytes past the declared end` };
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + jsonLen));
    // Only "an object" is checked at the door: each field the counts read is checked where it is read.
    const json = parseJsonAt("glb: the JSON chunk", z.record(z.string(), z.unknown()), text);
    if (!json.ok) return { ok: false, error: json.error.message };
    return { ok: true, facts: factsOfJson(json.value as Gltf) };
  } catch (e) {
    return { ok: false, error: e instanceof Refused ? `glb: ${e.message}` : `glb: ${e instanceof Error ? e.message : String(e)}` };
  }
}
