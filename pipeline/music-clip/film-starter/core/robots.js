// film/core/robots.js - the robot factory: the high-fidelity procedural worker (approved 4K pass), one joint
// hierarchy, one InstancedMesh per part kind, near/far LOD (bolts, pistons, vents, cables, antenna only within
// 15 m of the camera), serial decal per unit, visor colour per unit.
//
//   const army = core.robots.createArmy(maxUnits);   scene.add(army.group);
//   army.R.n = count; army.R.x[i] = ...; army.setVis(i, VISOR.RED, k);   (state buffers, see below)
//   army.hero (pose overrides for unit 0: headPitch, armL/armR, elL/elR, shRz, lean, headYaw)
//   army.commit(cameraPosition, nod)   // nod = env.nod(t) = {head, body}; per-unit weight in R.nod[i]
//   poseRobot(t, {walkPhase, amp, nod, ...}) poses the shared template (used by commit; exported for sets)
//
// The pose function and the nod application (head + nod capped at 0.5 rad, neck 0.35 x body, spine +0.22 x body,
// hips -0.025 x body) are the APPROVED ones - do not change their numbers.
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { lerp } from "./env.js";

export const VISOR = { RED: [7.5, 0.28, 0.22], GREEN: [0.35, 7.0, 1.5], OFF: [0.008, 0.006, 0.006], WHITE: [4, 4, 4.2] };

export function createRobots(THREE, X) {
  const { robotMat, darkMat, whiteMat, rubberMat, visorMat, plateMat } = X;
const T = {}; const troot = new THREE.Object3D();
function node(name, parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); T[name] = o; return o; }
node("hips", troot, 0, 0.98, 0); node("pelvisM", T.hips, 0, 0, 0); node("spine", T.hips, 0, 0.08, 0);
node("abdM", T.spine, 0, 0.07, 0); node("torsoM", T.spine, 0, 0.36, 0); node("packM", T.spine, 0, 0.4, -0.18);
node("plateM", T.spine, 0, 0.43, 0.134); node("neck", T.spine, 0, 0.6, 0); node("neckM", T.neck, 0, 0.04, 0);
node("head", T.neck, 0, 0.09, 0); node("headM", T.head, 0, 0.12, 0); node("visorM", T.head, 0, 0.125, 0.128); node("browM", T.head, 0, 0.175, 0.115);
node("earML", T.head, -0.135, 0.11, 0); node("earMR", T.head, 0.135, 0.11, 0);
for (const [S, s] of [["L", -1], ["R", 1]]) {
  node("sh" + S, T.spine, s * 0.29, 0.52, 0); node("shM" + S, T["sh" + S], 0, 0, 0); node("padM" + S, T.spine, s * 0.28, 0.6, 0);
  node("uarmM" + S, T["sh" + S], 0, -0.15, 0); node("el" + S, T["sh" + S], 0, -0.3, 0); node("farmM" + S, T["el" + S], 0, -0.13, 0); node("handM" + S, T["el" + S], 0, -0.3, 0.0);
  node("hip" + S, T.hips, s * 0.11, -0.02, 0); node("thighM" + S, T["hip" + S], 0, -0.21, 0); node("kn" + S, T["hip" + S], 0, -0.43, 0);
  node("kneeM" + S, T["kn" + S], 0, 0, 0.05); node("shinM" + S, T["kn" + S], 0, -0.21, 0); node("footM" + S, T["kn" + S], 0, -0.5, 0.045);
}
T.padML.rotation.z = 0.35; T.padMR.rotation.z = -0.35;
// detail attachments (children of the same joints: the approved pose/nod hierarchy is unchanged)
node("collarM", T.spine, 0, 0.6, 0); node("ventM", T.spine, 0, 0.42, -0.245); node("cableM", T.spine, 0, 0, 0);
node("vframeM", T.head, 0, 0.125, 0.121); node("crestM", T.head, 0, 0.24, -0.01); node("antM", T.head, -0.15, 0.2, -0.04);
for (const [S, s] of [["L", -1], ["R", 1]]) {
  node("elbM" + S, T["el" + S], 0, 0, 0); node("kcapM" + S, T["kn" + S], 0, 0.03, 0.075); node("ankM" + S, T["kn" + S], 0, -0.455, 0);
  node("pistM" + S, T["hip" + S], s * 0.04, -0.2, 0.098);
  for (let i = 0; i < 4; i++) node("boltM" + S + i, T["padM" + S], (i % 2 ? 1 : -1) * 0.058, 0.032, (i < 2 ? 1 : -1) * 0.085);
}

// ---- hull geometry: bevelled slabs, lathed armour shells, merged details; UVs in metres so one texel density covers the body ----
function uvm(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function rshape(pts, r) { const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const p1 = p.clone().add(a.clone().sub(p).normalize().multiplyScalar(r)), p2 = p.clone().add(b.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) s.moveTo(p1.x, p1.y); else s.lineTo(p1.x, p1.y); s.quadraticCurveTo(p.x, p.y, p2.x, p2.y); }
  s.closePath(); return s; }
function slab(pts, depth, r, bev) {
  const g = new THREE.ExtrudeGeometry(rshape(pts.map(([x, y]) => new THREE.Vector2(x, y)), r), { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 8 });
  g.translate(0, 0, -(depth - 2 * bev) / 2); return toCreasedNormals(g, 0.9);
}
function shell(prof, seg = 32) { const pts = prof.map(([r, y]) => new THREE.Vector2(r, y)); const g = new THREE.LatheGeometry(pts, seg); const rmax = Math.max(...prof.map(p => p[0])); const ys = prof.map(p => p[1]); return uvm(g, 2 * Math.PI * rmax, Math.max(...ys) - Math.min(...ys)); }
function uvShift(g, du, dv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv); return g; }
function rbox(w, h, d, seg, rad) { return uvm(new RoundedBoxGeometry(w, h, d, seg, rad), Math.max(w, d), h); }
function merged(list) { return mergeGeometries(list.map(g => { const q = g.index ? g.toNonIndexed() : g; if (!q.attributes.uv) q.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; })); }
const bellows = (() => { const pts = [[0, -0.085]]; for (let i = 0; i <= 40; i++) { const y = -0.08 + 0.16 * i / 40; pts.push([0.104 + 0.016 * Math.abs(Math.sin(i / 40 * Math.PI * 5)), y]); } pts.push([0, 0.085]); return shell(pts, 36); })();
const handGeo = merged([rbox(0.075, 0.1, 0.06, 3, 0.018),
  ...[-0.024, 0, 0.024].map(x => rbox(0.019, 0.07, 0.024, 2, 0.008).translate(x, -0.075, 0.006)),
  rbox(0.018, 0.05, 0.022, 2, 0.008).rotateZ(0.5).translate(0.045, -0.035, 0.015)]);
const footGeo = merged([rbox(0.12, 0.07, 0.23, 3, 0.025), rbox(0.11, 0.035, 0.09, 3, 0.012).translate(0, 0.04, 0.075), rbox(0.13, 0.02, 0.24, 2, 0.008).translate(0, -0.03, 0)]);
const earGeo = merged([new THREE.CylinderGeometry(0.045, 0.045, 0.04, 28).rotateZ(Math.PI / 2), new THREE.TorusGeometry(0.04, 0.006, 8, 28).rotateY(Math.PI / 2).translate(0.022, 0, 0), new THREE.CylinderGeometry(0.02, 0.02, 0.05, 16).rotateZ(Math.PI / 2)]);
const neckGeo = merged([new THREE.CylinderGeometry(0.042, 0.052, 0.11, 24), ...[-1, 1].map(s => new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8).rotateZ(s * 0.25).translate(s * 0.05, 0, 0.03)),
  ...[0.03, 0, -0.03].map(y => new THREE.TorusGeometry(0.047, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, y, 0))]);
const pistGeo = merged([new THREE.CylinderGeometry(0.009, 0.009, 0.32, 10), new THREE.CylinderGeometry(0.017, 0.017, 0.13, 14).translate(0, 0.08, 0), new THREE.SphereGeometry(0.014, 10, 8).translate(0, -0.16, 0), new THREE.SphereGeometry(0.02, 10, 8).translate(0, 0.15, 0)]);
const ventGeo = merged([...[0, 1, 2, 3, 4, 5].map(i => rbox(0.22, 0.014, 0.02, 2, 0.005).translate(0, -0.1 + i * 0.04, 0)), rbox(0.03, 0.24, 0.024, 2, 0.008).translate(-0.125, -0.0, 0), rbox(0.03, 0.24, 0.024, 2, 0.008).translate(0.125, 0, 0)]);
const cableGeo = merged([-1, 1].map(s => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.1, 0.57, -0.24), new THREE.Vector3(s * 0.11, 0.66, -0.2), new THREE.Vector3(s * 0.08, 0.7, -0.12), new THREE.Vector3(s * 0.05, 0.66, -0.06)]), 24, 0.012, 8)));
const antGeo = merged([new THREE.CylinderGeometry(0.006, 0.008, 0.14, 8).translate(0, 0.07, 0), new THREE.SphereGeometry(0.012, 10, 8).translate(0, 0.145, 0), new THREE.CylinderGeometry(0.02, 0.024, 0.02, 12)]);
const KIND = {
  pelvis: [slab([[-0.15, 0.08], [0.15, 0.08], [0.12, -0.08], [-0.12, -0.08]], 0.2, 0.03, 0.02), darkMat],
  abd: [bellows, rubberMat],
  torso: [slab([[-0.17, -0.23], [0.17, -0.23], [0.235, 0.14], [0.215, 0.23], [-0.215, 0.23], [-0.235, 0.14]], 0.26, 0.045, 0.026), robotMat],
  collar: [new THREE.TorusGeometry(0.07, 0.02, 12, 32).rotateX(Math.PI / 2), darkMat],
  pack: [rbox(0.32, 0.34, 0.12, 4, 0.03), darkMat],
  vent: [ventGeo, darkMat],
  cable: [cableGeo, rubberMat],
  plate: [new THREE.PlaneGeometry(0.24, 0.12), plateMat],
  neck: [neckGeo, darkMat],
  head: [rbox(0.25, 0.23, 0.25, 6, 0.07), robotMat],
  vframe: [rbox(0.252, 0.068, 0.03, 3, 0.014), darkMat],
  visor: [new RoundedBoxGeometry(0.235, 0.042, 0.03, 3, 0.012), visorMat],
  brow: [rbox(0.27, 0.035, 0.07, 3, 0.012), darkMat],
  crest: [rbox(0.045, 0.03, 0.2, 3, 0.012), darkMat],
  ant: [antGeo, darkMat],
  ear: [earGeo, darkMat],
  sh: [new THREE.SphereGeometry(0.075, 32, 20), darkMat],
  pad: [uvShift(slab([[-0.08, -0.025], [0.08, -0.025], [0.062, 0.025], [-0.062, 0.025]], 0.22, 0.012, 0.012), 0.17, 0.21), whiteMat],
  bolt: [new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), darkMat],
  uarm: [shell([[0, .15], [.045, .148], [.062, .13], [.066, .06], [.06, .052], [.062, .0], [.058, -.09], [.05, -.13], [.03, -.15], [0, -.15]]), robotMat],
  elb: [new THREE.SphereGeometry(0.05, 24, 16), darkMat],
  farm: [shell([[0, .12], [.045, .118], [.058, .09], [.06, .0], [.055, -.008], [.056, -.06], [.048, -.12], [.03, -.14], [0, -.14]]), robotMat],
  hand: [handGeo, darkMat],
  thigh: [shell([[0, .2], [.06, .198], [.085, .17], [.09, .08], [.083, .072], [.086, .0], [.078, -.12], [.066, -.18], [.04, -.21], [0, -.21]]), robotMat],
  pist: [pistGeo, darkMat],
  knee: [new THREE.SphereGeometry(0.055, 24, 16), darkMat],
  kcap: [rbox(0.1, 0.1, 0.035, 3, 0.012), robotMat],
  shin: [shell([[0, .2], [.05, .198], [.072, .17], [.075, .06], [.069, .052], [.07, -.05], [.06, -.17], [.045, -.22], [0, -.23]]), robotMat],
  ank: [new THREE.SphereGeometry(0.045, 20, 14), darkMat],
  foot: [footGeo, darkMat],
};
const HI = new Set(["vent", "cable", "bolt", "pist", "ant"]);
  const PARTS = []; // [node, kind]
  troot.traverse(o => { if (o === troot) return; const m = /^([a-z]+)M[LR0-9]*$/.exec(Object.keys(T).find(k => T[k] === o) || ""); if (m) PARTS.push([o, m[1]]); });
  const KINDS = {}; for (const [o, k] of PARTS) (KINDS[k] = KINDS[k] || []).push(o);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const BUILD_ORDER = ["foot", "ank", "shin", "knee", "kcap", "thigh", "pist", "pelvis", "abd", "torso", "collar", "pack", "vent", "cable", "plate", "sh", "pad", "bolt", "uarm", "elb", "farm", "hand", "neck", "head", "vframe", "brow", "crest", "ear", "ant", "visor"];
  // pose: phase p (radians), amp walking amplitude, o overrides (APPROVED numbers)
  function pose(p, amp, o = {}) {
    const s = Math.sin(p), c = Math.cos(p);
    T.hips.position.y = 0.98 - amp * 0.035 * (1 - Math.abs(Math.cos(p))) + (o.dy || 0);
    T.hips.rotation.set(0, amp * 0.08 * s, 0);
    T.spine.rotation.set(0.05 * amp + (o.lean || 0), -amp * 0.14 * s, 0);
    const nb = o.nodBody || 0;
    T.hips.position.y -= 0.025 * nb; T.spine.rotation.x += 0.22 * nb;
    T.neck.rotation.set(0.35 * nb, 0, 0);
    T.head.rotation.set((o.headPitch || 0) + (o.nod || 0), (o.headYaw || 0) + amp * 0.1 * s, o.headRoll || 0);
    T.hipL.rotation.set(-amp * 0.42 * s, 0, 0); T.hipR.rotation.set(amp * 0.42 * s, 0, 0);
    T.knL.rotation.set(amp * 0.75 * Math.max(0, c) + 0.05, 0, 0); T.knR.rotation.set(amp * 0.75 * Math.max(0, -c) + 0.05, 0, 0);
    T.shL.rotation.set(amp * 0.38 * s + (o.armL || 0), 0, 0.08); T.shR.rotation.set(-amp * 0.38 * s + (o.armR || 0), 0, -0.08);
    T.elL.rotation.set(-0.35 - amp * 0.2 * Math.max(0, s) + (o.elL || 0), 0, 0); T.elR.rotation.set(-0.35 - amp * 0.2 * Math.max(0, -s) + (o.elR || 0), 0, 0);
    if (o.shRz !== undefined) T.shR.rotation.z = o.shRz;
  }
  /** pose the shared template from t-derived values: {walkPhase, amp, nod: {head, body}, weight, ...overrides} */
  function poseRobot(t, o = {}) { const w = o.weight ?? 1; pose(o.walkPhase || 0, o.amp || 0, { ...o, nod: Math.min(0.5, (o.nod ? o.nod.head : 0) * w), nodBody: (o.nod ? o.nod.body : 0) * w }); return T; }

  function createArmy(MAXR, { shadows = true, hiDist = 15 } = {}) {
    const group = new THREE.Group(); const IM = {};
    for (const k in KINDS) {
      const [geo, mat] = KIND[k]; const n = KINDS[k].length; const g = geo.clone();
      const e = { nodes: KINDS[k] };
      if (k === "plate") { const a = new Float32Array(MAXR * n); g.setAttribute("aCell", new THREE.InstancedBufferAttribute(a, 1)); e.cell = a; }
      const m = new THREE.InstancedMesh(g, mat, MAXR * n); m.frustumCulled = false; m.castShadow = shadows && k !== "visor" && k !== "plate" && !HI.has(k); m.receiveShadow = true;
      if (k === "visor") m.setColorAt(0, new THREE.Color(0, 0, 0));
      e.mesh = m; IM[k] = e; group.add(m);
    }
    const R = { n: 0, x: new Float32Array(MAXR), z: new Float32Array(MAXR), yaw: new Float32Array(MAXR), p: new Float32Array(MAXR), amp: new Float32Array(MAXR),
      vis: new Float32Array(MAXR * 3), hp: new Float32Array(MAXR), y: new Float32Array(MAXR), roll: new Float32Array(MAXR), lean: new Float32Array(MAXR), build: new Float32Array(MAXR), cell: new Uint8Array(MAXR), nod: new Float32Array(MAXR) };
    const hero = {}; const _c = new THREE.Color();
    const HERO_NODES = ["head", "visorM", "handMR", "handML", "plateM", "neck", "spine"]; const heroAt = Object.fromEntries(HERO_NODES.map(k => [k, new THREE.Vector3()]));
    /** reset unit i to a standing default */
    function unit(i, x = 0, z = 0, yaw = 0) { R.x[i] = x; R.z[i] = z; R.y[i] = 0; R.yaw[i] = yaw; R.p[i] = 0; R.amp[i] = 0; R.hp[i] = 0; R.roll[i] = 0; R.lean[i] = 0; R.build[i] = 1; R.cell[i] = i === 0 ? 0 : 2 + (i % 62); R.nod[i] = 0; setVis(i, VISOR.RED, 0.6); }
    function setVis(r, c, k) { R.vis[r * 3] = c[0] * k; R.vis[r * 3 + 1] = c[1] * k; R.vis[r * 3 + 2] = c[2] * k; }
    function mixVis(r, a, b, u, k) { for (let i = 0; i < 3; i++) R.vis[r * 3 + i] = lerp(a[i], b[i], u) * k; }
    function clearHero() { for (const k in hero) delete hero[k]; }
    function commit(cam, nod = { head: 0, body: 0 }) {
      for (const k in IM) IM[k].mesh.count = R.n * IM[k].nodes.length;
      for (let r = 0; r < R.n; r++) {
        const o = r === 0 ? hero : { headPitch: R.hp[r], lean: R.lean[r] };
        o.nod = Math.min(0.5, nod.head * R.nod[r]); o.nodBody = nod.body * R.nod[r];
        pose(R.p[r], R.amp[r], o);
        troot.position.set(R.x[r], R.y[r], R.z[r]); troot.rotation.set(0, R.yaw[r], R.roll[r]);
        troot.updateMatrixWorld(true);
        if (r === 0) for (const k of HERO_NODES) T[k].getWorldPosition(heroAt[k]);
        const b = R.build[r]; const near = Math.hypot(R.x[r] - cam.x, R.z[r] - cam.z) < hiDist;
        for (const k in IM) {
          const im = IM[k]; const ns = im.nodes.length;
          const visible = (b >= 1 || BUILD_ORDER.indexOf(k) < b * BUILD_ORDER.length) && (near || !HI.has(k));
          const hid = hiddenParts.get(r);
          for (let j = 0; j < ns; j++) im.mesh.setMatrixAt(r * ns + j, visible && !(hid && hid.has(im.nodes[j])) ? im.nodes[j].matrixWorld : ZERO);
          if (k === "visor") im.mesh.setColorAt(r, _c.setRGB(R.vis[r * 3], R.vis[r * 3 + 1], R.vis[r * 3 + 2]));
          if (k === "plate") im.cell[r] = R.cell[r];
        }
      }
      for (const k in IM) { IM[k].mesh.instanceMatrix.needsUpdate = true; if (IM[k].mesh.instanceColor) IM[k].mesh.instanceColor.needsUpdate = true; }
      IM.plate.mesh.geometry.attributes.aCell.needsUpdate = true;
    }
    // heroAt.head / visorM / handMR ... = world positions of unit 0's joints from the last commit
    /** preview(r, nod): pose unit r NOW (the same pose commit will give it) without touching the instances; returns
     *  { at(nodeName, out?) } -> world position, e.g. at("visorM"), at("footML"), at("handMR"). For focus and foot
     *  placement before the camera is placed. Node names: robots.NODES. */
    function preview(r, nod = { head: 0, body: 0 }) {
      const o = r === 0 ? hero : { headPitch: R.hp[r], lean: R.lean[r] };
      o.nod = Math.min(0.5, nod.head * R.nod[r]); o.nodBody = nod.body * R.nod[r];
      pose(R.p[r], R.amp[r], o); troot.position.set(R.x[r], R.y[r], R.z[r]); troot.rotation.set(0, R.yaw[r], R.roll[r]); troot.updateMatrixWorld(true);
      return { at: (name, out = new THREE.Vector3()) => T[name].getWorldPosition(out) };
    }
    /** hide(r, "handMR" | [...]) hides those parts of unit r on every commit until show(r) / show() (e.g. to swap in a prop) */
    const hiddenParts = new Map();
    function hide(r, names) { const s = hiddenParts.get(r) || new Set(); for (const nm of [].concat(names)) { if (!T[nm]) throw new Error(`robots: no part ${nm}`); s.add(T[nm]); } hiddenParts.set(r, s); }
    function show(r) { if (r === undefined) hiddenParts.clear(); else hiddenParts.delete(r); }
    return { group, R, IM, hero, heroAt, unit, setVis, mixVis, clearHero, commit, preview, hide, show, MAXR };
  }
  const NODES = Object.keys(T);
  return { T, troot, KIND, HI, NODES, pose, poseRobot, createArmy, VISOR };
}
