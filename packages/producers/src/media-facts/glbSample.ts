// A GLB MADE IN CODE - the fixture universe's model and the parser's test input, so no binary is
// checked in (spark game-3d-assets WP3). Pure: Uint8Array out, no Buffer, no Node, so a fixture,
// a test and a server-built kit specimen all make the same bytes.
//
// `buildGlb` writes what readGlb (./glb.ts) reads: one buffer, flat-shaded triangles per mesh
// (each face its own three vertices, so a box reads as a box under a single light), an optional
// skeleton (a skin over a joint chain, every vertex bound to the first joint), optional clips (a
// two-key rotation on the first joint) and optional embedded images (bytes the file carries but
// no material uses). `figure` is the sample geometry: a chunky low-poly character built of boxes.

export type Box = { readonly at: readonly [number, number, number]; readonly size: readonly [number, number, number] };
export type GlbMeshIn = { readonly boxes: readonly Box[]; readonly color: readonly [number, number, number] };
export type GlbIn = {
  readonly meshes: readonly GlbMeshIn[];
  /** Joints in a chain up the figure; 0 or absent is a static mesh. */
  readonly bones?: number;
  readonly clips?: number;
  readonly images?: readonly Uint8Array[];
};

/** A box's 12 triangles, flat: 36 positions and 36 normals. */
function boxTris(b: Box): { pos: number[]; nrm: number[] } {
  const [cx, cy, cz] = b.at;
  const [hx, hy, hz] = b.size.map((s) => s / 2) as [number, number, number];
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const [n, q] of faces) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const c = q[k] ?? [0, 0, 0];
      pos.push(cx + (c[0] ?? 0) * hx, cy + (c[1] ?? 0) * hy, cz + (c[2] ?? 0) * hz);
      nrm.push(...n);
    }
  }
  return { pos, nrm };
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** The GLB's bytes. */
export function buildGlb(input: GlbIn): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const view = (bytes: Uint8Array): number => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    const padded = new Uint8Array(pad4(bytes.byteLength));
    padded.set(bytes);
    chunks.push(padded);
    offset += padded.byteLength;
    return bufferViews.length - 1;
  };
  const floats = (a: readonly number[], type: "SCALAR" | "VEC3" | "VEC4" | "MAT4", width: number, bounds = false): number => {
    const f = new Float32Array(a);
    const acc: Record<string, unknown> = { bufferView: view(new Uint8Array(f.buffer)), componentType: 5126, count: a.length / width, type };
    if (bounds) {
      const min = [0, 1, 2].map((k) => Math.min(...a.filter((_, i) => i % 3 === k)));
      const max = [0, 1, 2].map((k) => Math.max(...a.filter((_, i) => i % 3 === k)));
      Object.assign(acc, { min, max });
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const bones = input.bones ?? 0;
  const meshes = input.meshes.map((m) => {
    const all = m.boxes.map(boxTris);
    const pos = all.flatMap((b) => b.pos);
    const attributes: Record<string, number> = { POSITION: floats(pos, "VEC3", 3, true), NORMAL: floats(all.flatMap((b) => b.nrm), "VEC3", 3) };
    if (bones > 0) {
      const n = pos.length / 3;
      accessors.push({ bufferView: view(new Uint8Array(n * 4)), componentType: 5121, count: n, type: "VEC4" });
      attributes["JOINTS_0"] = accessors.length - 1;
      attributes["WEIGHTS_0"] = floats(Array.from({ length: n }, () => [1, 0, 0, 0]).flat(), "VEC4", 4);
    }
    return { primitives: [{ attributes, material: 0, mode: 4 }] };
  });
  const color = input.meshes[0]?.color ?? [0.6, 0.6, 0.6];
  const nodes: Record<string, unknown>[] = meshes.map((_, i) => ({ mesh: i, ...(bones > 0 ? { skin: 0 } : {}) }));
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "gravitone fixture glb" },
    scene: 0,
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes,
    accessors,
    bufferViews,
  };
  if (bones > 0) {
    const first = nodes.length;
    for (let j = 0; j < bones; j++) nodes.push({ name: `joint_${j}`, translation: [0, j === 0 ? 0.9 : 0.8 / bones, 0], ...(j + 1 < bones ? { children: [first + j + 1] } : {}) });
    json["skins"] = [{ joints: Array.from({ length: bones }, (_, j) => first + j), skeleton: first }];
    const clips = input.clips ?? 0;
    if (clips > 0) {
      const times = floats([0, 1], "SCALAR", 1);
      accessors[times] = { ...accessors[times], min: [0], max: [1] };
      const turns = floats([0, 0, 0, 1, 0, 0.2588, 0, 0.9659], "VEC4", 4);
      json["animations"] = Array.from({ length: clips }, (_, c) => ({ name: `clip_${c}`, samplers: [{ input: times, output: turns }], channels: [{ sampler: 0, target: { node: first, path: "rotation" } }] }));
    }
  }
  if ((input.images ?? []).length > 0) json["images"] = (input.images ?? []).map((b) => ({ bufferView: view(b), mimeType: "image/png" }));
  json["nodes"] = nodes;
  json["scenes"] = [{ nodes: [...meshes.keys(), ...(bones > 0 ? [meshes.length] : [])] }];
  json["buffers"] = [{ byteLength: offset }];
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(text.byteLength);
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jsonLen, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLen);
  out.set(text, 20);
  v.setUint32(20 + jsonLen, offset, true);
  v.setUint32(24 + jsonLen, 0x004e4942, true);
  let at = 28 + jsonLen;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A chunky game-camera hero, 1.8 m tall, standing on the origin: boots, legs, torso, arms, head, hood. */
export function figure(): readonly Box[] {
  return [
    { at: [-0.14, 0.06, 0.03], size: [0.2, 0.12, 0.3] },
    { at: [0.14, 0.06, 0.03], size: [0.2, 0.12, 0.3] },
    { at: [-0.14, 0.48, 0], size: [0.18, 0.72, 0.2] },
    { at: [0.14, 0.48, 0], size: [0.18, 0.72, 0.2] },
    { at: [0, 1.14, 0], size: [0.56, 0.62, 0.32] },
    { at: [-0.38, 1.1, 0], size: [0.16, 0.62, 0.18] },
    { at: [0.38, 1.1, 0], size: [0.16, 0.62, 0.18] },
    { at: [0, 1.6, 0], size: [0.3, 0.3, 0.3] },
    { at: [0, 1.7, -0.04], size: [0.36, 0.2, 0.36] },
  ];
}

/** Bytes as a data: URL, without Buffer (a fixture serves its generated media this way). */
export function dataUrl(bytes: Uint8Array, mime: string): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i] ?? 0, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += (A[(n >> 18) & 63] ?? "") + (A[(n >> 12) & 63] ?? "") + (b === undefined ? "=" : (A[(n >> 6) & 63] ?? "")) + (c === undefined ? "=" : (A[n & 63] ?? ""));
  }
  return `data:${mime};base64,${s}`;
}
