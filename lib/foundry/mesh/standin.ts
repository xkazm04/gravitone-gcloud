// THE DRY STAND-INS (spark game-3d-assets WP2). A dry mesh job writes a stand-in where TRELLIS.2
// would have written raw.glb, and a dry finish writes a stand-in finished (and, for a rigged brief,
// rigged) glb - generated here in code, so no binary is checked in. Each is an honest, tiny,
// closed solid: a box subdivided N x N on every face (6N^2+2 welded vertices, 12N^2 triangles),
// standing on y = 0 in glTF's Y-up axes at the class's size. It clears PoF's empty-mesh floor
// (100 vertices) so the ported gates judge a mesh, not an error - and the gates' verdicts on it are
// real verdicts on a box, which is all a dry run proves: that the plumbing carries a glb from one
// end to the other and every gate reads it.
//
// The rigged stand-in carries a skin of the 23 UE5-named bones pipeline/mesh/blender/rig.py fits
// (root, pelvis, spine_01..03, neck_01, head, and per side clavicle, upperarm, lowerarm, hand,
// thigh, calf, foot, ball), each vertex weighted 1.0 to its nearest bone head - enough for the rig
// gate to bind every UE5 Mannequin chain, and its orphan-joint warning to say what it is.

import type { AssetClass } from "./types";
import { writeGlb, type GltfAccessor, type GltfJson } from "./glb";

const SEGMENTS = 6;

/** Width, height, depth in metres, by class: a 1.8 m figure, a 1 m blade, a 0.6 m crate. */
export const STAND_IN_DIMS: { readonly [C in AssetClass]: readonly [number, number, number] } = {
  character: [0.6, 1.8, 0.35],
  weapon: [0.12, 1.0, 0.04],
  prop: [0.6, 0.6, 0.6],
};

/** The subdivided box: welded positions and outward-wound triangles. */
export function standInBox(dims: readonly [number, number, number], n: number = SEGMENTS): { readonly positions: number[]; readonly faces: number[] } {
  const [w, h, d] = dims;
  const positions: number[] = [];
  const faces: number[] = [];
  const index = new Map<string, number>();
  const vertex = (x: number, y: number, z: number): number => {
    const p = [((x + 1) / 2 - 0.5) * w, ((y + 1) / 2) * h, ((z + 1) / 2 - 0.5) * d];
    const key = p.map((c) => c.toFixed(6)).join(",");
    const at = index.get(key);
    if (at !== undefined) return at;
    positions.push(...p);
    index.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  // Each face: a normal axis and sign, and two in-plane axes ordered so u x v points outward.
  const sides: readonly (readonly [number, number, number, number])[] = [
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
  ];
  for (const [axis, sign, ua, va] of sides) {
    const at = (i: number, j: number): number => {
      const c = [0, 0, 0];
      c[axis] = sign;
      c[ua] = -1 + (2 * i) / n;
      c[va] = -1 + (2 * j) / n;
      return vertex(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const e = at(i, j + 1);
        faces.push(a, b, c, a, c, e);
      }
    }
  }
  return { positions, faces };
}

/** UE5 Mannequin names in rig.py's hierarchy, with rest heads as fractions of the height (x, y). */
const BONES: readonly (readonly [string, string | null, number, number])[] = [
  ["root", null, 0, 0],
  ["pelvis", "root", 0, 0.54],
  ["spine_01", "pelvis", 0, 0.58],
  ["spine_02", "spine_01", 0, 0.66],
  ["spine_03", "spine_02", 0, 0.73],
  ["neck_01", "spine_03", 0, 0.83],
  ["head", "neck_01", 0, 0.88],
  ...(["_l", "_r"] as const).flatMap((s) => {
    const x = s === "_l" ? 1 : -1;
    return [
      [`clavicle${s}`, "spine_03", 0.02 * x, 0.8],
      [`upperarm${s}`, `clavicle${s}`, 0.11 * x, 0.81],
      [`lowerarm${s}`, `upperarm${s}`, 0.2 * x, 0.68],
      [`hand${s}`, `lowerarm${s}`, 0.26 * x, 0.56],
      [`thigh${s}`, "pelvis", 0.055 * x, 0.52],
      [`calf${s}`, `thigh${s}`, 0.06 * x, 0.28],
      [`foot${s}`, `calf${s}`, 0.06 * x, 0.045],
      [`ball${s}`, `foot${s}`, 0.06 * x, 0.017],
    ] as const;
  }),
];

class Bin {
  readonly parts: Uint8Array[] = [];
  length = 0;
  add(bytes: Uint8Array): { readonly byteOffset: number; readonly byteLength: number } {
    const byteOffset = this.length;
    this.parts.push(bytes);
    this.length += bytes.byteLength;
    const pad = (4 - (this.length % 4)) % 4;
    if (pad > 0) {
      this.parts.push(new Uint8Array(pad));
      this.length += pad;
    }
    return { byteOffset, byteLength: bytes.byteLength };
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.byteLength;
    }
    return out;
  }
}

const u8 = (a: Float32Array | Uint32Array | Uint8Array): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** The stand-in glb of a class, optionally skinned onto the 23 UE5-named bones. */
export function standInGlb(cls: AssetClass, o: { readonly rig?: boolean; readonly name?: string } = {}): Uint8Array {
  const dims = STAND_IN_DIMS[cls];
  const box = standInBox(dims);
  const pos = Float32Array.from(box.positions);
  const idx = Uint32Array.from(box.faces);
  const bin = new Bin();
  const views: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  const push = (bytes: Uint8Array, target?: number): number => {
    const v = bin.add(bytes);
    views.push({ buffer: 0, ...v, ...(target === undefined ? {} : { target }) });
    return views.length - 1;
  };
  const lo = [0, 1, 2].map((k) => Math.min(...box.positions.filter((_, i) => i % 3 === k)));
  const hi = [0, 1, 2].map((k) => Math.max(...box.positions.filter((_, i) => i % 3 === k)));
  const accessorsOut: GltfAccessor[] = [
    { bufferView: push(u8(pos), 34962), componentType: 5126, count: pos.length / 3, type: "VEC3", min: lo, max: hi },
    { bufferView: push(u8(idx), 34963), componentType: 5125, count: idx.length, type: "SCALAR" },
  ];
  const attributes: Record<string, number> = { POSITION: 0 };
  const name = o.name ?? `SM_${cls}_standin`;
  type Node = NonNullable<GltfJson["nodes"]>[number];
  const nodes: Node[] = [{ name, mesh: 0 }];
  let skins: NonNullable<GltfJson["skins"]> | undefined;
  let roots = [0];
  if (o.rig === true) {
    const h = dims[1];
    const heads = BONES.map(([, , x, y]) => [x * h, y * h, 0] as const);
    const joints = new Uint8Array((pos.length / 3) * 4);
    const weights = new Float32Array((pos.length / 3) * 4);
    for (let v = 0; v < pos.length / 3; v++) {
      let best = 0;
      let bd = Infinity;
      heads.forEach(([x, y], j) => {
        if (j === 0) return; // root deforms nothing in rig.py either
        const dd = ((pos[v * 3] ?? 0) - x) ** 2 + ((pos[v * 3 + 1] ?? 0) - y) ** 2;
        if (dd < bd) [best, bd] = [j, dd];
      });
      joints[v * 4] = best;
      weights[v * 4] = 1;
    }
    const ibm = new Float32Array(BONES.length * 16);
    heads.forEach(([x, y, z], j) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], j * 16));
    attributes["JOINTS_0"] = accessorsOut.push({ bufferView: push(joints, 34962), componentType: 5121, count: pos.length / 3, type: "VEC4" }) - 1;
    attributes["WEIGHTS_0"] = accessorsOut.push({ bufferView: push(u8(weights), 34962), componentType: 5126, count: pos.length / 3, type: "VEC4" }) - 1;
    const ibmAt = accessorsOut.push({ bufferView: push(u8(ibm)), componentType: 5126, count: BONES.length, type: "MAT4" }) - 1;
    const first = nodes.length;
    BONES.forEach(([bone, parent], j) => {
      const p = parent === null ? undefined : BONES.findIndex(([b]) => b === parent);
      const [x, y, z] = heads[j] ?? [0, 0, 0];
      const [px, py, pz] = p === undefined ? [0, 0, 0] : (heads[p] ?? [0, 0, 0]);
      const children = BONES.flatMap(([, par], c) => (par === bone ? [first + c] : []));
      nodes.push({ name: bone, translation: [x - px, y - py, z - pz], ...(children.length === 0 ? {} : { children }) });
    });
    nodes[0] = { name, mesh: 0, skin: 0 };
    skins = [{ joints: BONES.map((_, j) => first + j), inverseBindMatrices: ibmAt, skeleton: first }];
    roots = [0, first];
  }
  const buffer = bin.bytes();
  const json: GltfJson = {
    asset: { version: "2.0", generator: "gravitone mesh stand-in (dry)" },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes,
    meshes: [{ name, primitives: [{ attributes, indices: 1, mode: 4 }] }],
    ...(skins === undefined ? {} : { skins }),
    accessors: accessorsOut,
    bufferViews: views,
    buffers: [{ byteLength: buffer.byteLength }],
  };
  return writeGlb(json, buffer);
}
