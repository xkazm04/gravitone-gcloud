// PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
// ~\ai\lynx-bench\pof3d\round4\characters\work\pofmetrics2.py `compute`, 2026-10-21 -
// itself a numpy re-implementation of PoF's scripts/visual-gen/pof_mesh_critique.py metrics, run in
// Blender's Python because trimesh is not installed there. This is the same arithmetic in TS, for a
// DRY finish: the stand-in glb is measured here, with no Blender. A LIVE finish is measured by the
// Python original (pipeline/mesh/blender/metrics.py) over Blender's own import of the exported file.
//
// Same rules as the original: vertices are welded by EXACT position (trimesh's `process=True`
// welds with a tolerance, so this can only find MORE components - an upper bound, never a kinder
// count); an edge shared by exactly two faces in opposite directions is wound consistently; the
// mesh is watertight when every edge has exactly two faces; components are face islands joined by
// shared edges; the histogram keeps 4096 entries and counts the rest as omitted. `bbox` is in the
// file's own axes - glTF, Y up - which is the order PoF's world-scale reads (GLTF_UP_AXIS_INDEX 1).

import type { MeshMetrics } from "./gates/mesh-score";
import { geometry } from "./glb";

const HISTOGRAM_CAP = 4096;

/** The PoF metrics of a triangle soup: `positions` xyz triples, `faces` index triples. */
export function computeMetrics(positions: readonly number[], faces: readonly number[]): MeshMetrics {
  // Weld by exact position (pofmetrics2: np.unique(V, axis=0)), in float32 as the glb holds them.
  const f32 = Float32Array.from(positions);
  const weld = new Map<string, number>();
  const remap: number[] = [];
  const welded: [number, number, number][] = [];
  for (let i = 0; i < f32.length / 3; i++) {
    const p: [number, number, number] = [f32[i * 3] ?? 0, f32[i * 3 + 1] ?? 0, f32[i * 3 + 2] ?? 0];
    const key = `${p[0]},${p[1]},${p[2]}`;
    let w = weld.get(key);
    if (w === undefined) {
      w = welded.length;
      weld.set(key, w);
      welded.push(p);
    }
    remap.push(w);
  }
  const F: [number, number, number][] = [];
  for (let i = 0; i + 2 < faces.length; i += 3) F.push([remap[faces[i] ?? 0] ?? 0, remap[faces[i + 1] ?? 0] ?? 0, remap[faces[i + 2] ?? 0] ?? 0]);
  const nF = F.length;
  const nV = welded.length;

  // Edges in pofmetrics2's order: every face's (0,1), then (1,2), then (2,0).
  const uses = new Map<number, { readonly face: number; readonly forward: boolean }[]>();
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    F.forEach((f, fi) => {
      const u = f[a];
      const v = f[b];
      const key = Math.min(u, v) * (nV + 1) + Math.max(u, v);
      const list = uses.get(key) ?? [];
      list.push({ face: fi, forward: u < v });
      uses.set(key, list);
    });
  }
  let watertight = true;
  let winding = true;
  const parent = Array.from({ length: nF }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) {
      parent[r] = parent[parent[r] ?? r] ?? r;
      r = parent[r] ?? r;
    }
    return r;
  };
  for (const list of uses.values()) {
    if (list.length !== 2) watertight = false;
    else if (list[0]?.forward === list[1]?.forward) winding = false;
    const first = list[0];
    if (first === undefined) continue;
    for (const other of list.slice(1)) {
      const r1 = find(first.face);
      const r2 = find(other.face);
      if (r1 !== r2) parent[r2] = r1;
    }
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < nF; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const comp = [...sizes.values()].sort((a, b) => b - a);

  const used = new Set<number>();
  let area = 0;
  let vol = 0;
  let degenerate = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of welded) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k] ?? Infinity, p[k] ?? 0);
    hi[k] = Math.max(hi[k] ?? -Infinity, p[k] ?? 0);
  }
  for (const [a, b, c] of F) {
    used.add(a).add(b).add(c);
    const v0 = welded[a] ?? [0, 0, 0];
    const v1 = welded[b] ?? [0, 0, 0];
    const v2 = welded[c] ?? [0, 0, 0];
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const cr = [(e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0), (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0), (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0)];
    const ar = Math.hypot(cr[0] ?? 0, cr[1] ?? 0, cr[2] ?? 0) / 2;
    area += ar;
    if (ar < 1e-12) degenerate++;
    // v0 . (v1 x v2), the signed tetrahedron volume pofmetrics2 sums.
    vol += v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) + v0[1] * (v1[2] * v2[0] - v1[0] * v2[2]) + v0[2] * (v1[0] * v2[1] - v1[1] * v2[0]);
  }
  const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
  const ext = nV === 0 ? [0, 0, 0] : [0, 1, 2].map((k) => round4((hi[k] ?? 0) - (lo[k] ?? 0)));
  return {
    verts: used.size,
    faces: nF,
    watertight,
    windingConsistent: winding,
    components: comp.length,
    euler: used.size - uses.size + nF,
    bbox: [ext[0] ?? 0, ext[1] ?? 0, ext[2] ?? 0],
    volume: watertight ? vol / 6 : null,
    area,
    degenerateFaces: degenerate,
    componentFaces: comp.slice(0, HISTOGRAM_CAP),
    componentFacesOmitted: Math.max(0, comp.length - HISTOGRAM_CAP),
  };
}

/** The metrics of a glb's bytes (dry finish only; see the header). */
export function glbMetrics(bytes: Uint8Array): MeshMetrics {
  const g = geometry(bytes);
  return computeMetrics(g.positions, g.faces);
}
