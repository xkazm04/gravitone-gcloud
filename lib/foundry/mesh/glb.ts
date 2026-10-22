// A GLB, READ AND WRITTEN WITHOUT A LIBRARY (spark game-3d-assets WP2). Three uses, all small:
//
//   readBack   the export PROVEN by reading it (game-production: mesh-finishing-for-engine-readiness /
//              export-proven-by-read-back): the triangles, the joints and whether Draco crept in,
//              read off the file Blender wrote rather than off what Blender said it wrote;
//   geometry   positions and triangles for the dry metrics (./metrics.ts) over a stand-in;
//   writeGlb   the dry stand-ins (./standin.ts).
//
// Only what those need is read: node transforms are NOT applied by `geometry` (a stand-in has none;
// a real finished mesh is measured by Blender's own importer, pipeline/mesh/blender/metrics.py).
// Pure: bytes in, numbers out; nothing here touches the disk.

export type GltfAccessor = {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
  readonly normalized?: boolean;
};
export type GltfPrimitive = { readonly attributes: Readonly<Record<string, number>>; readonly indices?: number; readonly mode?: number; readonly extensions?: Readonly<Record<string, unknown>> };
export type GltfJson = {
  readonly asset: { readonly version: string; readonly generator?: string };
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes: readonly number[] }[];
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number; readonly skin?: number; readonly children?: readonly number[]; readonly translation?: readonly number[] }[];
  readonly meshes?: readonly { readonly name?: string; readonly primitives: readonly GltfPrimitive[] }[];
  readonly skins?: readonly { readonly joints: readonly number[]; readonly inverseBindMatrices?: number; readonly skeleton?: number }[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number; readonly target?: number }[];
  readonly buffers?: readonly { readonly byteLength: number }[];
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
};

const MAGIC = 0x46546c67; // 'glTF'
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const TRIANGLES = 4;
export const DRACO = "KHR_draco_mesh_compression";

/** The two chunks of a GLB. Throws only when the bytes are not a GLB at all. */
export function readGlb(bytes: Uint8Array): { readonly json: GltfJson; readonly bin?: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== MAGIC) throw new Error("not a binary glTF (.glb): missing glTF magic");
  let json: GltfJson | undefined;
  let bin: Uint8Array | undefined;
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > bytes.byteLength) throw new Error(`a glTF chunk runs past the end of the file (${start + len} > ${bytes.byteLength} bytes)`);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len))) as GltfJson;
    else if (type === BIN_CHUNK) bin = bytes.subarray(start, start + len);
    off = start + len;
  }
  if (json === undefined) throw new Error("not a binary glTF (.glb): no JSON chunk");
  return bin === undefined ? { json } : { json, bin };
}

/** What an exported file is, read back: the facts a finish must prove before it calls itself done. */
export type ReadBack = {
  readonly tris: number;
  readonly meshes: number;
  readonly joints: number;
  readonly draco: boolean;
  readonly bytes: number;
};

export function readBack(bytes: Uint8Array): ReadBack {
  const { json } = readGlb(bytes);
  let tris = 0;
  let draco = (json.extensionsUsed ?? []).includes(DRACO) || (json.extensionsRequired ?? []).includes(DRACO);
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives) {
      if (p.extensions !== undefined && DRACO in p.extensions) draco = true;
      if ((p.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const ix = p.indices === undefined ? undefined : json.accessors?.[p.indices];
      const pos = p.attributes["POSITION"] === undefined ? undefined : json.accessors?.[p.attributes["POSITION"]];
      tris += Math.floor((ix?.count ?? pos?.count ?? 0) / 3);
    }
  }
  const joints = Math.max(0, ...(json.skins ?? []).map((s) => s.joints.length));
  return { tris, meshes: (json.meshes ?? []).length, joints, draco, bytes: bytes.byteLength };
}

const SIZE: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const WIDTH: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function read(dv: DataView, type: number, at: number): number {
  switch (type) {
    case 5120:
      return dv.getInt8(at);
    case 5121:
      return dv.getUint8(at);
    case 5122:
      return dv.getInt16(at, true);
    case 5123:
      return dv.getUint16(at, true);
    case 5125:
      return dv.getUint32(at, true);
    case 5126:
      return dv.getFloat32(at, true);
    default:
      throw new Error(`glTF componentType ${type} is not one this reader knows`);
  }
}

/** One accessor as a flat number array (`count * width` values). */
export function accessorValues(json: GltfJson, bin: Uint8Array | undefined, index: number): number[] {
  const a = json.accessors?.[index];
  if (a === undefined) throw new Error(`glTF accessor ${index} does not exist`);
  const width = WIDTH[a.type];
  const size = SIZE[a.componentType];
  if (width === undefined || size === undefined) throw new Error(`glTF accessor ${index} has an unreadable type ${a.type}/${a.componentType}`);
  if (a.bufferView === undefined) return new Array<number>(a.count * width).fill(0);
  const bv = json.bufferViews?.[a.bufferView];
  if (bv === undefined || bin === undefined) throw new Error(`glTF accessor ${index} points at no buffer`);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = bv.byteStride ?? size * width;
  const out: number[] = [];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < width; c++) out.push(read(dv, a.componentType, base + i * stride + c * size));
  return out;
}

/** Every triangle primitive's positions and faces, concatenated (glTF axes, Y up; node transforms not applied). */
export function geometry(bytes: Uint8Array): { readonly positions: number[]; readonly faces: number[] } {
  const { json, bin } = readGlb(bytes);
  const positions: number[] = [];
  const faces: number[] = [];
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives) {
      if ((p.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const at = p.attributes["POSITION"];
      if (at === undefined) continue;
      const base = positions.length / 3;
      const pos = accessorValues(json, bin, at);
      positions.push(...pos);
      const ix = p.indices === undefined ? Array.from({ length: pos.length / 3 }, (_, i) => i) : accessorValues(json, bin, p.indices);
      for (let i = 0; i + 2 < ix.length; i += 3) faces.push(base + (ix[i] ?? 0), base + (ix[i + 1] ?? 0), base + (ix[i + 2] ?? 0));
    }
  }
  return { positions, faces };
}

/** A GLB from its JSON and one binary buffer, each chunk padded to 4 bytes as the spec asks. */
export function writeGlb(json: GltfJson, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (n: number): number => (4 - (n % 4)) % 4;
  const jsonLen = text.byteLength + pad(text.byteLength);
  const binLen = bin.byteLength + pad(bin.byteLength);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, JSON_CHUNK, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.byteLength, 20 + jsonLen);
  const b = 20 + jsonLen;
  dv.setUint32(b, binLen, true);
  dv.setUint32(b + 4, BIN_CHUNK, true);
  out.set(bin, b + 8);
  return out;
}
