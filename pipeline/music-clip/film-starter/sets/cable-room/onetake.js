// sets/cable-room/onetake.js - the intro as ONE 15 s take (operator, 2026-10-30: "the scene can be one long take
// for 15 s as the music in this phase does not build up and switching scenes in intro does not work well there";
// the first 5 s were below the rest of the film). The shot plan marks s01 `oneTake`; this module owns its props
// and its camera path, cable-room.js owns the room and the cables.
//
// What the take shows (the camera never stops; something happens on every onset / beat):
//   0.00  macro on the JUNCTION where the bundle starts: machined box, ferrules, one LED per cable, a stencilled
//         lid; a cold raking shaft from a high slit on the right wall, dust turning in it. Before the first downbeat
//         only onsets exist: the hero cable's LED and the dust flare on each one, a probe pulse leaves the box.
//  ~1.87  first downbeat: the camera lifts off the lid and runs low beside the bundle; on every downbeat the next
//         cable's LED fires and its pulse races out of the junction AHEAD of the camera toward the door.
//  ~5.7   the run passes under the vent sliver and veers left to the pressure gauge: a close pass while the needle
//         kicks on every beat; at bar 4 (7.64) the door lamp ignites and its red flicker crosses the dial.
//  ~9.5   the camera turns from the gauge to the door and cranes up the room as the lamp flickers and catches
//         (bar 7, 13.4: it holds), every cable lit below.
//  13.4   push down into the line of white light under ASSEMBLY 01 - the cut to the bay's sparks goes "through".
// Path: Catmull-Rom (Hermite) over timed keys, C1 in time, so the move never jerks at a key. Pure f(t).
import { clamp, mulberry, hermite } from "../../core/env.js";
export { hermite };

export function buildOneTake(core, g, curves, cableRad) {
  const { THREE, X, kit } = core;
  const RB = core.RoundedBox;
  // UVs in metres so the hull maps keep one texel density on a 2.8 m box
  const rbox = (w, h, d, seg, r) => { const geo = new RB(w, h, d, seg, r); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d), uv.getY(i) * h); return geo; };
  const J = new THREE.Group(); g.add(J);
  const starts = curves.map(c => c.getPoint(0));
  const xs = starts.map(p => p.x), x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3, cx = (x0 + x1) / 2, W = x1 - x0;
  const BOX = { y: 0.46, z0: 10.0, z1: 10.8 };
  const body = new THREE.Mesh(rbox(W, BOX.y, BOX.z1 - BOX.z0, 4, 0.04), X.darkMat); body.position.set(cx, BOX.y / 2, (BOX.z0 + BOX.z1) / 2); body.castShadow = body.receiveShadow = true; J.add(body);
  const lid = new THREE.Mesh(rbox(W - 0.08, 0.035, BOX.z1 - BOX.z0 - 0.12, 3, 0.012), X.robotMat); lid.position.set(cx, BOX.y + 0.012, (BOX.z0 + BOX.z1) / 2 + 0.03); lid.castShadow = lid.receiveShadow = true; J.add(lid);
  const foot = new THREE.Mesh(rbox(W + 0.12, 0.06, BOX.z1 - BOX.z0 + 0.12, 3, 0.015), X.robotMat); foot.position.set(cx, 0.03, (BOX.z0 + BOX.z1) / 2); foot.receiveShadow = true; J.add(foot);
  // bolts round the lid, hinge knuckles on the back edge
  { const geo = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6); const n = 14; const im = new THREE.InstancedMesh(geo, X.darkMat, n * 2 + 4); const M = new THREE.Matrix4(); let i = 0;
    for (let k = 0; k < n; k++) for (const z of [BOX.z0 + 0.1, BOX.z1 - 0.06]) { M.makeTranslation(x0 + 0.1 + k * (W - 0.2) / (n - 1), BOX.y + 0.034, z); im.setMatrixAt(i++, M); }
    for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [BOX.z0 + 0.3, BOX.z1 - 0.3]) { M.makeTranslation(x, BOX.y + 0.034, z); im.setMatrixAt(i++, M); }
    im.count = i; J.add(im);
    for (let k = 0; k < 3; k++) { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 16).rotateZ(Math.PI / 2), X.darkMat); kn.position.set(x0 + 0.4 + k * (W - 0.8) / 2, BOX.y + 0.02, BOX.z1 - 0.02); J.add(kn); } }
  // stencil on the lid: what this box is, and whose line
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), new THREE.MeshStandardMaterial({ map: X.stencilTex(["JUNCTION 01  /  LINE 0451"], { w: 2048, h: 320, size: 170, track: 20 }), transparent: true, roughness: 0.8, metalness: 0, color: 0xffffff }));
  tag.rotation.set(-Math.PI / 2, 0, Math.PI); // reads from the lens side (+z) tag.position.set(cx + 0.05, BOX.y + 0.031, BOX.z0 + 0.36); J.add(tag);
  // ferrules where the cables enter the front face, and one LED per cable on the lid's front edge
  const ledMats = [], leds = [];
  starts.forEach((p, i) => {
    const r = cableRad[i];
    const fe = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.7, 0.12, 20).rotateX(Math.PI / 2), X.robotMat); fe.position.set(p.x, p.y, BOX.z0 + 0.02); fe.castShadow = true; J.add(fe);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.62, 0.006, 8, 24), X.darkMat); ring.position.set(p.x, p.y, BOX.z0 - 0.035); J.add(ring);
    const lm = new THREE.MeshBasicMaterial({ color: 0x000000 }); ledMats.push(lm);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.022), lm); led.position.set(p.x, BOX.y + 0.034, BOX.z0 + 0.13); J.add(led); leds.push(led);
    const bez = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.008, 0.036), X.darkMat); bez.position.set(p.x, BOX.y + 0.03, BOX.z0 + 0.13); J.add(bez);
  });
  // the light riding the newest pulse head down the bundle: it lights the cable bodies and the wet floor as it passes
  const runLight = new THREE.PointLight(0xff2a18, 0, 3.2, 2); g.add(runLight);
  const ledLight = new THREE.PointLight(0xff2010, 0, 2.4, 2); ledLight.position.set(cx, BOX.y + 0.25, BOX.z0 + 0.1); g.add(ledLight);
  // the raking key of the opening: a cold shaft from a high slit in the right wall onto the junction (casts shadows)
  // it falls IN FRONT of the box, across the opening frame: a visible shaft with dust, cold edges on the cables, their shadows on the floor
  const SL = new THREE.Vector3(5.42, 4.6, 7.3), SD = new THREE.Vector3(cx - 0.1, 0.12, BOX.z0 - 0.9);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 3.5) })); slit.rotation.y = -Math.PI / 2; slit.position.copy(SL); g.add(slit);
  const rake = new THREE.SpotLight(0xe2e9ff, 0, 16, 0.16, 0.55, 1.4); rake.position.copy(SL); rake.target.position.copy(SD); rake.castShadow = true; rake.shadow.mapSize.set(2048, 2048); rake.shadow.bias = -0.0004; rake.shadow.normalBias = 0.02; g.add(rake, rake.target);
  const shaft = kit.beam(g, 9.5, 0.5, 0xdfe6ff);
  { const dir = SD.clone().sub(SL), L = dir.length(); dir.normalize(); shaft.position.copy(SL); shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); shaft.scale.set(1, L / 9.5, 1); }
  shaft.userData.noDepth = true;
  // dust that only lives inside the rake shaft
  const motes = (() => { const n = 700, base = new Float32Array(n * 3); { const r = mulberry(5151); for (let i = 0; i < n * 3; i++) base[i] = r(); }
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.012, map: X.dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 2, 2.1) });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.noDepth = true; g.add(pts); return { n, base, geo, mat, pos }; })();
  // camera keys [t, pos xyz, look xyz, focus xyz, fov, aperture] - positions measured off the real props
  const hero = starts[7], ledH = new THREE.Vector3(hero.x, BOX.y + 0.04, BOX.z0 + 0.13);
  const KEYS = [
    [0.0, hero.x + 0.62, 0.66, 10.72, hero.x + 0.02, 0.44, 10.05, ledH.x, ledH.y, ledH.z, 30, 0.012],
    [1.87, hero.x + 0.38, 0.6, 10.42, hero.x - 0.05, 0.36, 9.35, ledH.x, ledH.y, ledH.z - 0.1, 31, 0.01],
    [3.0, 0.15, 0.62, 9.35, 0.45, 0.22, 5.6, 0.5, 0.25, 7.6, 33, 0.006],
    [4.4, -0.78, 0.48, 6.0, 0.4, 0.24, 0.4, 0.3, 0.25, 3.8, 33, 0.005],
    [5.71, -0.95, 0.56, 1.5, 0.1, 0.45, -6, 0.2, 0.3, -1.0, 34, 0.004],
    [7.0, -2.45, 1.12, -0.85, -4.2, 1.4, -2.0, -4.2, 1.4, -2.0, 32, 0.004],
    [8.3, -3.15, 1.46, -2.5, -4.2, 1.42, -2.0, -4.19, 1.42, -2.0, 30, 0.006],
    [9.55, -2.35, 2.1, -4.7, 0.0, 3.8, -19.5, 0.0, 4.9, -19.45, 34, 0.003],
    [11.5, -0.7, 3.4, -8.5, 0.0, 4.2, -19.45, 0.0, 4.9, -19.45, 33, 0.0025],
    [13.4, 0.1, 3.9, -13.0, 0.0, 4.75, -19.45, 0.0, 4.9, -19.45, 32, 0.0025],
    [15.21, 0.0, 2.3, -14.7, 0.0, 1.9, -19.9, 0.0, 1.2, -19.9, 36, 0.0025],
  ];
  return { runLight, J, leds, ledMats, ledLight, rake, shaft, slit, motes, SL, SD, KEYS, starts, BOX };
}

/** the take's frame: LEDs + rake + motes driven by the cable state, camera from the keys. Returns {m, focus, post}. */
export function renderOneTake(t, core, o, { cableOn, onP, pre, evt, lampK, head }) {
  const { THREE } = core;
  // LEDs: each cable's LED is lit while its cable is (flash on the hit); the hero's flickers with the onsets pre-beat
  let sum = 0;
  o.ledMats.forEach((m, i) => { const k = cableOn[i]; sum += k; m.color.setRGB(0.04 + 5.5 * k, 0.012 + 0.2 * k, 0.01 + 0.14 * k); });
  o.ledLight.intensity = 0.25 + 0.9 * sum / o.ledMats.length + (pre ? 0.5 * onP : 0);
  if (head) { o.runLight.position.copy(head.p).add(new THREE.Vector3(0, 0.22, 0)); o.runLight.intensity = head.k; } else o.runLight.intensity = 0;
  const rk = 0.8 + 0.45 * evt;
  o.rake.intensity = 300 * rk; o.shaft.set(1.2 * rk, 0xdfe6ff);
  { const M = o.motes, a = M.pos, src = o.SL, dir = o.SD.clone().sub(src), L = dir.length(); dir.normalize();
    const ax = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), bx = dir.clone().cross(ax).normalize();
    for (let i = 0; i < M.n; i++) { const u = 0.35 + 0.65 * ((M.base[i * 3] + t * 0.006 * (0.5 + M.base[i * 3 + 1])) % 1), rr = 0.04 + 0.42 * u;
      const ox = (M.base[i * 3 + 1] - .5) * 1.5 * rr + Math.sin(t * .37 + i) * .015, oy = (M.base[i * 3 + 2] - .5) * 1.5 * rr + Math.cos(t * .29 + i * 1.3) * .015;
      a[i * 3] = src.x + dir.x * L * u + ax.x * ox + bx.x * oy; a[i * 3 + 1] = src.y + dir.y * L * u + ax.y * ox + bx.y * oy; a[i * 3 + 2] = src.z + dir.z * L * u + ax.z * ox + bx.z * oy; }
    M.geo.attributes.position.needsUpdate = true; M.mat.color.setRGB(1.5, 1.55, 1.7).multiplyScalar(0.7 + 1.8 * evt); }
  const k = hermite(o.KEYS, t);
  const m = { pos: new THREE.Vector3(k[0], k[1], k[2]), look: new THREE.Vector3(k[3], k[4], k[5]), fov: k[9] };
  // a breath of handheld that grows as the room wakes (never on the macro of the junction)
  const hh = clamp((t - 2) / 6, 0, 1) * 0.006; m.pos.x += hh * Math.sin(t * 1.3); m.pos.y += hh * Math.sin(t * 1.7 + 2);
  const focus = new THREE.Vector3(k[6], k[7], k[8]);
  // exposure: the dark junction opens a touch brighter; the last push into the door gap lifts toward the bay's white
  const exposure = 1.05 - 0.08 * lampK;
  return { m, focus, post: { aperture: k[10], maxblur: 0.014, exposure, bloomStrength: 0.75, bloomThreshold: 0.86 } };
}
