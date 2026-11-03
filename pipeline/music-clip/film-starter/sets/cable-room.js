// sets/cable-room.js - PORTED (board-t/unit-0451 s01), relit for the film. Darkness, a bundle of cables on the floor;
// a cable lights on each downbeat (a red pulse with a white-hot head runs along it); the door lamp over ASSEMBLY 01
// ignites at bar 4, flickers, holds from bar 7. The dark is never empty: a sliver of cold light falls through a
// high vent slit across the bundle, dust turning in it; a line of the bay's white work light leaks under the door
// (the same cold key the assembly bay is lit by, seen from outside). Before the first downbeat (0 - 1.87 s, onsets
// only) a faint probe pulse runs the hero cable on every onset and the dust in the sliver flares with it; through
// s01 the dead lamp's filament warms a little on every beat until it catches. The gauge is lit by its own white
// work bulb so the dial reads white with a red arc. s06: sparks dying along a cable (macro).
// Cams: macro (a cable / its pulse), track (push along the bundle at floor height), insert (the gauge),
// wide (room in silhouette), close (the lamp).
import { lerp, ease, sm, clamp, mulberry, hash1 } from "../core/env.js";
import { buildOneTake, renderOneTake } from "./cable-room/onetake.js";

const set = {
  name: "cable-room",
  cams: ["macro", "track", "insert", "wide", "close"],
  async build(core) {
    const { THREE, kit, X } = core;
    const st = kit.stage({ density: 0.028, envI: 0.25, shadow: 4096 });
    const g = st.scene, glow = [], curves = [], rads = []; let door;
    { const r = mulberry(101); const cm = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: .35, metalness: .1 });
      for (let i = 0; i < 16; i++) {
        const x0 = (i - 7.5) * 0.14 + (r() - .5) * .08 + 0.6; const pts = [];
        for (let k = 0; k <= 24; k++) { const u = k / 24; const z = 10 - u * 30; pts.push(new THREE.Vector3(x0 * (1 - u * .35) + Math.sin(u * 7 + i) * .12 * (1 - u), 0.06 + (i % 3) * .07 + 0.05 * Math.sin(u * 13 + i * 2), z)); }
        const curve = new THREE.CatmullRomCurve3(pts); const rad = 0.045 + r() * .05; curves.push(curve); rads.push(rad);
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, rad, 10), cm); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const gm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uOn: { value: 0 }, uHead: { value: 0 }, uDir: { value: 1 }, uBase: { value: 0.03 }, uPk: { value: 0.35 }, uW: { value: 18 }, uCol: { value: new THREE.Color(6, .25, .18) } },
          vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
          fragmentShader: "uniform float uOn,uHead,uDir,uBase,uPk,uW; uniform vec3 uCol; varying vec2 vUv; void main(){ float seam = exp(-pow((fract(vUv.y)-0.3)*9.0,2.0)); float d=(vUv.x-uHead)*uDir; float pulse = exp(-pow(d*uW,2.0)) + 0.5*exp(-max(d,0.0)*uW*0.8)*step(0.0,d); float core = exp(-pow(d*60.0,2.0)); float a = uOn*(uBase+uPk*pulse)*seam; vec3 c = uCol*a + vec3(5.0,4.6,4.2)*core*uOn*uPk*1.4*seam; gl_FragColor=vec4(c,1.0);} " });
        const gl = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, rad * 1.04, 10), gm); gl.userData.noDepth = true; g.add(gl); glow.push(gl);
      }
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ map: X.tex(X.shutterCanvas("", ""), [6, 1]), bumpMap: X.BUMP, bumpScale: 1.5, color: 0xaaaaaa, metalness: .4, roughness: .6 })); wall.position.set(0, 8, -20); g.add(wall);
      door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: .9 })); door.position.set(0, 2.1, -19.95); g.add(door);
      const sten = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: X.stencilTex(["ASSEMBLY 01"], { size: 96, track: 12 }), transparent: true, roughness: .8 })); sten.position.set(0, 6.05, -19.9); sten.scale.setScalar(0.75); g.add(sten);
      for (const x of [-2.2, 2.2]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.8, 0.5), X.darkMat); f.position.set(x, 2.4, -19.8); g.add(f); }
      for (const x of [-5.5, 5.5]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(32, 9), new THREE.MeshStandardMaterial({ map: X.tex(X.shutterCanvas("", ""), [5, 1]), bumpMap: X.BUMP, bumpScale: 2, color: 0x666666, metalness: .6, roughness: .5 })); sw.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; sw.position.set(x, 4.5, -4); g.add(sw);
        for (let k = 0; k < 9; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.3), X.darkMat); rib.position.set(x * 0.97, 4.5, 10 - k * 3.6); g.add(rib); } }
      for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1 + k * .02, 0.1 + k * .02, 34, 10), X.robotMat); p.rotation.x = Math.PI / 2; p.position.set(-2.5 + k * 1.6, 6.2 + (k % 2) * .4, -4); g.add(p); }
      for (const x of [-4.5, 4.8]) for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + k * .03, 0.12 + k * .03, 50, 12), X.robotMat); p.rotation.x = Math.PI / 2; p.position.set(x + k * .3 * Math.sign(x), 0.5 + k * .5, -8); g.add(p); }
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), X.floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const lamp = kit.cageLamp(g, 0, 4.9, -19.45, 1.8);
    // pressure gauge on the left wall pipe: dial face + needle (insert)
    const gauge = new THREE.Group(); gauge.position.set(-4.2, 1.4, -2.0); gauge.rotation.y = Math.PI / 2; g.add(gauge);
    { const face = X.canvas(2048, 2048); const [c, cx] = face; cx.scale(4, 4); cx.fillStyle = "#d8d8d4"; cx.beginPath(); cx.arc(256, 256, 250, 0, 7); cx.fill();
      cx.strokeStyle = "#111"; cx.lineWidth = 6; for (let i = 0; i <= 10; i++) { const a = -Math.PI * 0.75 + i / 10 * Math.PI * 1.5; cx.beginPath(); cx.moveTo(256 + Math.sin(a) * 200, 256 - Math.cos(a) * 200); cx.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236); cx.stroke(); }
      cx.strokeStyle = "#c01010"; cx.lineWidth = 18; cx.beginPath(); cx.arc(256, 256, 218, -Math.PI * 0.25 - Math.PI / 2 + Math.PI * 0.75, Math.PI * 0.75 - Math.PI / 2 + Math.PI * 0.0 + Math.PI * 0.25); cx.stroke();
      cx.fillStyle = "#111"; cx.font = `900 46px ${X.FONT}`; cx.textAlign = "center"; cx.fillText("PSI", 256, 360);
      // 4K detail: minor ticks, numerals, a maker's line, grime and a fingerprint smear on the face (seeded)
      cx.lineWidth = 2; for (let i = 0; i <= 50; i++) { if (i % 5 === 0) continue; const a = -Math.PI * 0.75 + i / 50 * Math.PI * 1.5; cx.beginPath(); cx.moveTo(256 + Math.sin(a) * 222, 256 - Math.cos(a) * 222); cx.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236); cx.stroke(); }
      cx.font = `700 22px ${X.FONT}`; for (let i = 0; i <= 10; i += 2) { const a = -Math.PI * 0.75 + i / 10 * Math.PI * 1.5; cx.fillText(String(i * 10), 256 + Math.sin(a) * 172, 264 - Math.cos(a) * 172); }
      cx.font = `700 13px ${X.FONT}`; cx.fillText("LINE 01 - x10 kPa", 256, 392); cx.fillText("ASSEMBLY 01", 256, 410);
      { const r = mulberry(4511); for (let i = 0; i < 900; i++) { cx.fillStyle = `rgba(40,30,20,${r() * 0.18})`; const x = r() * 512, y = r() * 512; cx.fillRect(x, y, 0.5 + r() * 2.5, 0.5 + r() * 2.5); }
        for (let i = 0; i < 3; i++) { const x = 120 + r() * 280, y = 120 + r() * 280, g = cx.createRadialGradient(x, y, 0, x, y, 40 + r() * 60); g.addColorStop(0, "rgba(60,45,30,.18)"); g.addColorStop(1, "rgba(60,45,30,0)"); cx.fillStyle = g; cx.fillRect(x - 100, y - 100, 200, 200); } }
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 40).rotateX(Math.PI / 2), X.robotMat); gauge.add(rim);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.21, 48), new THREE.MeshStandardMaterial({ map: X.tex(c), roughness: .5 })); dial.position.z = 0.041; gauge.add(dial);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.215, 48), new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.15, roughness: 0.02, metalness: 0.5 })); glass.position.z = 0.06; gauge.add(glass); }
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.17, 0.004).translate(0, 0.07, 0), new THREE.MeshStandardMaterial({ color: 0x111111 })); needle.position.z = 0.046; gauge.add(needle);
    const dust = kit.dust(st.fx, 2000, 7), beam = kit.beam(st.fx, 6.5, 2.4), sparks = kit.streaks(st.fx, 900);
    // the sliver: a high vent slit in the left wall, a cold shaft through it, dust that only shows inside the shaft
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 3.5) })); slit.rotation.y = Math.PI / 2; slit.position.set(-5.45, 6.4, 0.4); g.add(slit);
    const shaft = kit.beam(st.fx, 9.5, 0.55, 0xdfe6ff);
    const motes = (() => { const n = 900, base = new Float32Array(n * 3); { const r = mulberry(4040); for (let i = 0; i < n * 3; i++) base[i] = r(); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.022, map: X.dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 2, 2.1) });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.noDepth = true; st.fx.add(pts); return { n, base, geo, mat, pts }; })();
    // the door gap: the bay's white work light leaking under ASSEMBLY 01
    const gapMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.2) });
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.05), gapMat); gap.position.set(0, 0.03, -19.9); g.add(gap);
    const workBulb = kit.cageLamp(g, -3.75, 2.15, -1.7, 0.6);
    core.RoundedBox = core.RoundedBox || (await import("three/addons/geometries/RoundedBoxGeometry.js")).RoundedBoxGeometry;
    const take = buildOneTake(core, g, curves, rads);
    return { door, gap, take, st, glow, curves, lamp, gauge, needle, dust, beam, sparks, slit, shaft, motes, gapMat, workBulb };
  },
  render(t, shot, core, s) {
    const { env, kit, THREE } = core; const { st } = s; const DOWN = env.DOWN;
    const s01 = shot.sectionId === "s01";
    const di = env.lastIdx(DOWN, t) + 1;
    const DOWN0 = DOWN[0].t, pre = t < DOWN0;
    // onsets before the first downbeat (the intro has no beats yet): the last one at or before t
    const ON = env.TL.onsets; let oi = -1; { let lo = 0, hi = ON.length - 1; while (lo <= hi) { const q = (lo + hi) >> 1; if (ON[q] <= t) { oi = q; lo = q + 1; } else hi = q - 1; } }
    const onsetT = oi >= 0 ? ON[oi] : -9, onP = Math.exp(-(t - onsetT) * 7);
    const ORDER = [7, 9, 5, 11, 3, 13, 1, 15, 8, 6, 10, 4, 12, 2, 14, 0];
    s.glow.forEach((g, i) => { const order = ORDER.indexOf(i), U = g.material.uniforms;
      let on, lit, pk = 0.35, base = 0.03;
      U.uDir.value = s01 ? -1 : 1; // s01 (the one take): pulses leave the junction toward the door; s06: they drain back
      if (s01 && pre) { on = order === 0 ? 0.25 + 0.75 * onP : 0.1; lit = onsetT; pk = order === 0 ? 0.7 : 0; U.uHead.value = t * 0.38; } // one probe leaves the junction, flaring on each onset
      else if (s01) { on = order < di ? 1 : 0.18; lit = order < di ? DOWN[order].t : 0; pk = order === di - 1 ? 1.0 : 0.4; }
      else { on = 1 - ease(shot.p); lit = env.downbeatAt(t)?.t ?? 0; base = 0.012; pk = 0.45; } // s06: the lines go out
      // the bundle fills a macro frame: a 1.7 m pulse would flood it - tighten it to a short bolt with a white-hot head
      U.uW.value = shot.cam === "macro" && !pre ? 70 : 18; if (shot.cam === "macro" && !pre) { base *= 0.35; pk *= 1.2; }
      U.uOn.value = on * (0.6 + 0.4 * Math.exp(-(t - lit) * 1.5)); U.uBase.value = base; U.uPk.value = pk;
      if (s01 && !pre) U.uHead.value = (t - lit) * 0.5; // out of the box and down the bundle in two seconds, no wrap
      else if (!s01) U.uHead.value = 1 - ((t - lit) * 0.35 % 1); });
    const ign = (DOWN.find(d => d.bar === 4) || { t: 7.64 }).t, hold = (DOWN.find(d => d.bar === 7) || { t: 13.4 }).t;
    let lamp = 0.03 + 0.14 * env.beatPulse(t, 5) * clamp(t / ign, 0, 1) * (pre ? 0 : 1); // the dead filament warms on each beat
    if (t >= ign) { const age = t - ign; lamp = age < 0.9 ? sm(0, 0.12, age) * (0.55 + 0.45 * Math.sin(age * 40) * Math.exp(-age * 2)) : (hash1(Math.floor(t * 14)) > lerp(0.75, 0.2, (t - ign) / (hold - ign)) ? 0.8 : 0.05); }
    if (t >= hold) lamp = 1;
    if (!s01) lamp = 0.7 + 0.3 * env.beatPulse(t, 3);
    s.lamp.set(lamp * 1.5);
    const bp = env.beatPulse(t, 6), evt = pre ? onP : bp;
    st.hemi.intensity = 0.12; st.fills[2].position.set(0.6, 0.8, 2); st.fills[2].color.set(0xff2010); st.fills[2].intensity = s01 ? 4 * (0.6 + 0.4 * env.beatPulse(t, 4)) * (pre ? 0.4 : 1) : 0; st.fills[2].distance = 9;
    st.key.position.set(0, 5.2, -18.8); st.key.target.position.set(0, 0, -12); st.key.intensity = 260 * lamp * (shot.cam === "macro" ? 0.22 : 1); // macro: the glossy bundle mirrors the far lamp along its whole length - that was the red flood, not the glow st.key.distance = 40; st.key.angle = 0.7; st.key.penumbra = 0.9;
    st.fills[0].position.set(0, 4.8, -18.9); st.fills[0].intensity = 110 * lamp; st.fills[0].distance = 14;
    // the gauge's own white work bulb (a practical in every angle; the key of the insert)
    s.workBulb.set(1, [3.2, 3.2, 3.4]);
    st.fills[1].position.set(-3.75, 2.05, -1.7); st.fills[1].color.set(0xfff2ee); st.fills[1].intensity = shot.cam === "insert" ? 3.2 : 1.2; st.fills[1].distance = 4;
    // the door gap: the bay's cold work light, raking the floor from under the door
    s.gapMat.color.setRGB(3, 3, 3.2).multiplyScalar(s01 ? 1 : 0.6);
    // the end of the one take: ASSEMBLY 01 lifts on the last two beats and the bay's white light floods in - the cut to the sparks goes through it
    const open = s01 ? sm(env.S.s01.endS - 0.95, env.S.s01.endS, t) : 0, gh = 0.05 + 0.7 * open; // a slot, not a white frame
    s.door.position.y = 2.1 + 0.7 * open; s.gapMat.color.multiplyScalar(1 - 0.45 * open); s.gap.scale.y = gh / 0.05; s.gap.position.y = gh / 2 + 0.005;
    st.fills[3].position.set(0, 0.12 + 1.6 * open, -19.2); st.fills[3].color.set(0xe8eeff); st.fills[3].intensity = (s01 ? 7 : 3) + 14 * open; st.fills[3].distance = 7 + 4 * open;
    // the sliver: the shaft from the slit to the hero cable; flares with the onset (intro) / beat (after)
    const src = new THREE.Vector3(-5.4, 6.4, 0.4), dst = s.curves[7].getPoint(0.36), dir = dst.clone().sub(src), L = dir.length(); dir.normalize();
    const sl = (s01 ? 1 : 0.5) * (0.75 + 0.45 * evt);
    s.shaft.position.copy(src); s.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); s.shaft.scale.set(1, L / 9.5, 1); s.shaft.set(1.6 * sl, 0xdfe6ff);
    st.rim.position.copy(src); st.rim.target.position.copy(dst); st.rim.color.set(0xe6ecff); st.rim.intensity = 520 * sl; st.rim.angle = 0.065; st.rim.penumbra = 0.35; st.rim.distance = 22;
    { const M = s.motes, a = M.geo.attributes.position.array, ax = new THREE.Vector3(0, 0, 1).cross(dir).normalize(), bx = dir.clone().cross(ax).normalize();
      for (let i = 0; i < M.n; i++) { const u = (M.base[i * 3] + t * 0.004 * (0.5 + M.base[i * 3 + 1])) % 1, rr = 0.06 + 0.5 * u;
        const ox = (M.base[i * 3 + 1] - .5) * 1.6 * rr + Math.sin(t * .4 + i) * .02, oy = (M.base[i * 3 + 2] - .5) * 1.6 * rr + Math.cos(t * .33 + i * 1.3) * .02;
        a[i * 3] = src.x + dir.x * L * u + ax.x * ox + bx.x * oy; a[i * 3 + 1] = src.y + dir.y * L * u + ax.y * ox + bx.y * oy; a[i * 3 + 2] = src.z + dir.z * L * u + ax.z * ox + bx.z * oy; }
      M.geo.attributes.position.needsUpdate = true; M.mat.color.setRGB(1.6, 1.65, 1.8).multiplyScalar(sl * (0.8 + 1.6 * evt)); M.mat.size = shot.cam === "macro" ? 0.012 : 0.022; }
    s.beam.position.set(0, 4.75, -19.2); s.beam.scale.set(1, 0.8, 1); s.beam.set(0.6 * lamp);
    s.dust.update(t, [0, 2.2, -12], [10, 5, 16], 0xff5040, 0.04);
    // gauge needle: a kick on every beat, bigger on downbeats
    s.needle.rotation.z = -(-0.9 + 0.35 * env.lowSmooth(t) + 0.7 * env.beatPulse(t, 9) + 0.4 * env.downPulse(t, 6));
    // s06: sparks dying along a cable (fewer, dimmer through the shot)
    if (!s01 && shot.cam === "macro") { const c = s.curves[7 + (shot.variant % 4)], pnt = c.getPoint(lerp(0.3, 0.45, shot.p)); s.sparks.sparks(t, pnt, { spread: 1.2, up: 1.2, life: 0.6, k: 1 - 0.8 * shot.p, count: Math.floor(lerp(500, 60, shot.p)) }); }
    else s.sparks.off();
    let m, focus;
    const v = shot.variant;
    if (s01) { // the one take: the junction, the run, the gauge, the lamp, the door
      const cableOn = s.curves.map((_, i) => { const order = ORDER.indexOf(i); if (pre) return order === 0 ? 0.15 + 0.85 * onP : 0; return order < di ? 0.55 + 0.45 * Math.exp(-(t - DOWN[order].t) * 3) : 0; });
      // the newest pulse head (the probe before the first downbeat): where the run light rides
      let head = null;
      if (pre) { const u = t * 0.38; if (u < 1) head = { p: s.curves[7].getPoint(u), k: 0.6 + 1.6 * onP }; }
      else if (di > 0) { const u = (t - DOWN[di - 1].t) * 0.5; if (u < 1) head = { p: s.curves[ORDER[di - 1]].getPoint(u), k: 4.5 * (1 - u) ** 0.5 }; }
      const r = renderOneTake(t, core, s.take, { cableOn, onP, pre, evt, lampK: lamp, head });
      kit.place(st.camera, r.m);
      return { scene: st.scene, camera: st.camera, post: { focusDistance: core.post.focusOn(st.camera, r.focus), ...r.post } };
    }
    if (shot.cam === "track") { const z = lerp(6, -9, Math.pow(shot.p, 0.85)) - v * 3; m = { pos: new THREE.Vector3(-0.95 + Math.sin(t * .2) * .05, 0.42 + 0.03 * Math.sin(t * .7), z), look: new THREE.Vector3(0.25, 2.3, -20), fov: 34 }; focus = new THREE.Vector3(0, 2.5, -19.5); }
    else if (shot.cam === "macro") { const c = s.curves[7 + (v % 4)], u0 = lerp(0.28, 0.4, shot.p), pt = c.getPoint(u0), ahead = c.getPoint(u0 + 0.08);
      m = { pos: pt.clone().add(new THREE.Vector3(-0.35, 0.18, 0.25)), look: ahead.clone().add(new THREE.Vector3(0, 0.04, 0)), fov: 30 }; focus = pt; }
    else if (shot.cam === "insert") { m = kit.camMove(shot, [-4.2, 1.4, -2.0], { r: 0.6 }); m.pos.set(-4.2 + lerp(1.2, 1.0, shot.p), 1.45 + 0.05 * Math.sin(shot.p * 3), -2.0 + (v % 2 ? 0.25 : -0.2)); m.look = new THREE.Vector3(-4.2, 1.4, -2.0); m.fov = 28; focus = new THREE.Vector3(-4.2, 1.4, -2.0); }
    else if (shot.cam === "close") { m = { pos: new THREE.Vector3(lerp(-0.8, 0.8, shot.p), 3.6, -14.5 - shot.p), look: new THREE.Vector3(0, 4.9, -19.45), fov: 30 }; focus = new THREE.Vector3(0, 4.9, -19.45); }
    else { m = { pos: new THREE.Vector3(lerp(2.5, 1.0, shot.p), 1.4, lerp(8, 5, shot.p)), look: new THREE.Vector3(0, 2.2, -20), fov: 36 }; focus = new THREE.Vector3(0, 2.4, -19.5); }
    kit.place(st.camera, m);
    return { scene: st.scene, camera: st.camera, post: { focusDistance: core.post.focusOn(st.camera, focus), aperture: shot.cam === "track" ? 0.0012 : 0.003, maxblur: 0.012,
      // once the lamp is lit, the glossy bundle catches it at grazing angle and floods a macro frame: hold it down so the pulse and the sparks read
      ...(shot.cam === "macro" && !pre ? { exposure: 0.85, bloomStrength: 0.6, bloomThreshold: 0.88 } : {}) } };
  },
};
export default set;
