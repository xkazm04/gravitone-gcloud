// film/core/kit.js - shared set building blocks: a stage (scene + camera + one shadow key + rim + fill pool + env),
// cage lamps, volumetric beams, dust, sparks/rain, and the generic camera language for every cam type.
// Everything that animates is a pure function of t (and of the shot), seeded where random.
import { mulberry, hash1, lerp, ease, clamp, handheld } from "./env.js";
import { dotMatrix as _dotMatrix, text as _dotText } from "./dotmatrix.js";

export function createKit(THREE, X) {
  const { darkMat, beamMat, dotTex, envFrom } = X;
  const ENV = {
    red: envFrom([[[4, .15, .1], 0, 6, -8, 10, 2], [[3, .1, .08], -8, 3, 2, 3, 6], [[1.6, 1.7, 1.8], 6, 8, 4, 8, .4], [[2, .08, .05], 8, 1, -4, 2, 2]]),
    green: envFrom([[[.15, 3, .7], 0, 2, 8, 10, 2], [[1.5, .05, .04], 0, 7, -8, 8, 1], [[1.4, 1.5, 1.6], 6, 9, 4, 8, .4]]),
    cold: envFrom([[[1.2, 1.3, 1.5], 0, 8, -6, 12, 2], [[2, .1, .08], -8, 2, 3, 2, 4], [[.6, .65, .7], 6, 3, 6, 6, 3]]),
  };
  /** a set's stage: its own scene, a 35 mm camera, ONE shadow-casting key, a rim, 4 point fills, a hemi */
  function stage({ fog = 0x050102, density = 0.045, env = "red", envI = 0.6, shadow = 2048 } = {}) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(fog, density); scene.environment = ENV[env]; scene.environmentIntensity = envI;
    const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 220);
    const hemi = new THREE.HemisphereLight(0x301010, 0x000000, 0.2); scene.add(hemi);
    const key = new THREE.SpotLight(0xff2a1e, 400, 40, 0.5, 0.7, 1.6); key.castShadow = true; key.shadow.mapSize.set(shadow, shadow); key.shadow.radius = 2.5; key.shadow.bias = -0.0004; key.shadow.camera.near = 0.3; key.shadow.camera.far = 60; scene.add(key, key.target);
    const rim = new THREE.SpotLight(0xdfe6ff, 0, 60, 0.5, 0.8, 1.4); scene.add(rim, rim.target);
    const fills = []; for (let i = 0; i < 4; i++) { const p = new THREE.PointLight(0xff2010, 0, 14, 1.8); scene.add(p); fills.push(p); }
    const fx = new THREE.Group(); fx.userData.noDepth = true; scene.add(fx);
    return { scene, camera, hemi, key, rim, fills, fx, ENV };
  }
  /** an industrial room around the origin: wet concrete floor, corrugated walls (stencil label), ribs, ceiling beams */
  const _wallMats = {};
  function room(st, { w = 16, d = 20, h = 8, label = "", line2 = "", ribs = true } = {}) {
    const g = new THREE.Group(); st.scene.add(g);
    const fm = X.floorMat.clone(); fm.map = X.floorMat.map.clone(); fm.map.repeat.set(w / 18, d / 18); fm.map.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), X.floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const k = label + "|" + line2;
    const wm = _wallMats[k] || (_wallMats[k] = new THREE.MeshStandardMaterial({ map: X.tex(X.shutterCanvas(label, line2)), bumpMap: X.BUMP, bumpScale: 2.5, metalness: .55, roughness: .55 }));
    const plain = _wallMats["|"] || (_wallMats["|"] = new THREE.MeshStandardMaterial({ map: X.tex(X.shutterCanvas("", "")), bumpMap: X.BUMP, bumpScale: 2.5, metalness: .55, roughness: .55 }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wm); back.position.set(0, h / 2, -d / 2); back.receiveShadow = true; g.add(back);
    for (const sx of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(d, h), plain); sw.rotation.y = -sx * Math.PI / 2; sw.position.set(sx * w / 2, h / 2, 0); sw.receiveShadow = true; g.add(sw);
      if (ribs) for (let i = 0; i <= Math.floor(d / 2.5); i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), darkMat); rib.position.set(sx * (w / 2 - 0.15), h / 2, -d / 2 + i * 2.5); rib.castShadow = true; g.add(rib); } }
    for (let i = 0; i <= Math.floor(d / 3); i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, 0.3), darkMat); b.position.set(0, h - 0.25, -d / 2 + i * 3); g.add(b); }
    return g;
  }
  /** red cage lamp; L.set(k) sets its glow (0 = dead) */
  function cageLamp(parent, x, y, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.15) });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 16), bulbMat));
    for (let k = 0; k < 6; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.32, 0.015), darkMat); const a = k / 6 * Math.PI * 2; bar.position.set(Math.cos(a) * .14, 0, Math.sin(a) * .14); g.add(bar); }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 16), darkMat); cap.position.y = 0.18; g.add(cap);
    parent.add(g);
    return { g, bulbMat, set(k, col = [6, 0.2, 0.15]) { bulbMat.color.setRGB(col[0] * k, col[1] * k, col[2] * k); } };
  }
  /** soft volumetric cone hanging from its origin (additive, no depth); b.set(intensity, colour) */
  function beam(parent, len = 6.5, r = 2.4, col = 0xff2015) {
    const g = new THREE.CylinderGeometry(0.06, r, len, 40, 1, true); g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, beamMat(col)); m.userData.noDepth = true; parent.add(m);
    m.set = (i, c) => { m.material.uniforms.uI.value = i; if (c !== undefined) m.material.uniforms.uCol.value.set(c); m.visible = i > 0; };
    return m;
  }
  /** drifting dust motes in a box, a pure function of t */
  function dust(parent, n = 2000, seed = 7) {
    const base = new Float32Array(n * 3); { const r = mulberry(seed); for (let i = 0; i < n * 3; i++) base[i] = r(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.03, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, .55, .45), sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.noDepth = true; parent.add(pts);
    pts.update = (t, c, s, col = 0xff6a50, size = 0.03, k = 1.6) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) { const u = base[i * 3], v = base[i * 3 + 1], w = base[i * 3 + 2]; const y = ((v + t * 0.012 * (0.5 + u)) % 1);
        a[i * 3] = c[0] + (u - .5) * s[0] + Math.sin(t * .3 + i) * .05; a[i * 3 + 1] = c[1] + (y - .5) * s[1]; a[i * 3 + 2] = c[2] + (w - .5) * s[2] + Math.cos(t * .23 + i * 1.7) * .05; }
      geo.attributes.position.needsUpdate = true; mat.color.set(col).multiplyScalar(k); mat.size = size;
    };
    return pts;
  }
  /**
   * streaks: sparks (ballistic bursts) or rain (falling), pure f(t). Methods: off(), sparks(t, o, opts), rain(t, c, s, opts).
   *   streaks(parent, n)               -> 1 px GL lines (the original behaviour, unchanged)
   *   streaks(parent, n, { px: 2.2 })  -> camera-facing quads, px wide AT 1080 (scaled with the frame height, so 4K looks
   *                                       like a sharper 1080p), soft edges, end caps; no DOF 'comb' at 4K.
   */
  function streaks(parent, n = 1400, opts = {}) {
    if (opts.px) return streakQuads(parent, n, opts);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(6, 3.4, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ls = new THREE.LineSegments(geo, mat); ls.frustumCulled = false; ls.userData.noDepth = true; parent.add(ls);
    return streakMethods(ls, n, geo.attributes.position.array, () => { geo.attributes.position.needsUpdate = true; }, (c) => geo.setDrawRange(0, c * 2), (r, g, b) => mat.color.setRGB(r, g, b));
  }
  function streakQuads(parent, n, { px = 2, soft = 0.6 } = {}) {
    // 4 verts per segment: (A,-1) (A,+1) (B,-1) (B,+1); the vertex shader expands them across the screen-space direction
    const aA = new Float32Array(n * 12), aB = new Float32Array(n * 12), side = new Float32Array(n * 4), end = new Float32Array(n * 4), idx = [];
    for (let i = 0; i < n; i++) { side.set([-1, 1, -1, 1], i * 4); end.set([0, 0, 1, 1], i * 4); const o = i * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 12), 3)); // not read by the shader
    geo.setAttribute("aA", new THREE.BufferAttribute(aA, 3)); geo.setAttribute("aB", new THREE.BufferAttribute(aB, 3));
    geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1)); geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCol: { value: new THREE.Color(6, 3.4, 1.6) }, uPx: { value: px }, uRes: { value: new THREE.Vector2(1920, 1080) }, uSoft: { value: soft } },
      vertexShader: "attribute vec3 aA, aB; attribute float aSide, aEnd; uniform float uPx; uniform vec2 uRes; varying float vS;\n" +
        "void main(){ vec4 A = projectionMatrix * viewMatrix * vec4(aA, 1.0), B = projectionMatrix * viewMatrix * vec4(aB, 1.0);\n" +
        "  vec2 sa = A.xy / max(A.w, 1e-4), sb = B.xy / max(B.w, 1e-4); vec2 d = (sb - sa) * uRes; float L = length(d); d = L > 1e-5 ? d / L : vec2(1.0, 0.0);\n" +
        "  vec2 nrm = vec2(-d.y, d.x); vec4 P = aEnd > 0.5 ? B : A; float w = uPx * uRes.y / 1080.0;\n" +
        "  vec2 off = (nrm * aSide * w * 0.5 + d * (aEnd > 0.5 ? 0.5 : -0.5) * w) * 2.0 / uRes;\n" +
        "  P.xy += off * P.w; vS = aSide; gl_Position = P; }",
      fragmentShader: "uniform vec3 uCol; uniform float uSoft; varying float vS; void main(){ float a = 1.0 - smoothstep(1.0 - uSoft, 1.0, abs(vS)); gl_FragColor = vec4(uCol * a, 1.0); }" });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.userData.noDepth = true; parent.add(mesh);
    const _s = new THREE.Vector2(); mesh.onBeforeRender = (r) => { r.getDrawingBufferSize(_s); mat.uniforms.uRes.value.copy(_s); };
    const seg = new Float32Array(n * 6);
    const flush = () => { for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 3;
        aA[o] = seg[i * 6]; aA[o + 1] = seg[i * 6 + 1]; aA[o + 2] = seg[i * 6 + 2]; aB[o] = seg[i * 6 + 3]; aB[o + 1] = seg[i * 6 + 4]; aB[o + 2] = seg[i * 6 + 5]; }
      geo.attributes.aA.needsUpdate = true; geo.attributes.aB.needsUpdate = true; };
    return streakMethods(mesh, n, seg, flush, (c) => geo.setDrawRange(0, c * 6), (r, g, b) => mat.uniforms.uCol.value.setRGB(r, g, b));
  }
  /** the shared sparks/rain writers: fill a segment array (x0 y0 z0 x1 y1 z1 per segment), then flush */
  function streakMethods(ls, n, a, flush, range, colour) {
    const geo = { attributes: { position: { array: a, set needsUpdate(v) { if (v) flush(); } } }, setDrawRange: (s, c) => range(c / 2) };
    const mat = { color: { setRGB: colour } };
    ls.off = () => range(0);
    ls.sparks = (t, o, { period = 0.48, spread = 3, up = 2.5, life = 0.9, k = 1, seed = 77, count = n } = {}) => {
      const a = geo.attributes.position.array, rr = mulberry(seed);
      for (let i = 0; i < count; i++) { const burst = Math.floor(rr() * 12); const t0 = Math.floor(t / period) * period - burst * period * 0.25; const age = ((t - t0) + rr() * 0.4) % life;
        const vx = (rr() - .5) * spread, vy = rr() * up + .5, vz = (rr() - .5) * spread; const x = o.x + vx * age, y = o.y + vy * age - 4.9 * age * age, z = o.z + vz * age, dt = 0.03;
        a[i * 6] = x; a[i * 6 + 1] = Math.max(0.01, y); a[i * 6 + 2] = z; a[i * 6 + 3] = x - vx * dt; a[i * 6 + 4] = Math.max(0.01, y - (vy - 9.8 * age) * dt); a[i * 6 + 5] = z - vz * dt; }
      geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, count * 2); mat.color.setRGB(6 * k, 3.4 * k, 1.6 * k);
    };
    ls.rain = (t, c, s, { speed = 1.1, len = 0.45, k = 1.1, seed = 9 } = {}) => {
      const a = geo.attributes.position.array, rr = mulberry(seed), top = s[1];
      for (let i = 0; i < n; i++) { const x = c[0] + (rr() - .5) * s[0], z = c[2] + (rr() - .5) * s[2], ph = rr(); const y = c[1] + top - ((ph + t * speed) % 1) * top;
        a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x + .02; a[i * 6 + 4] = y + len; a[i * 6 + 5] = z; }
      geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, n * 2); mat.color.setRGB(k, k * 1.08, k * 1.18);
    };
    return ls;
  }
  /** a wall of LED text: L.draw(lines) redraws only when the content changes */
  function ledPanel(parent, w, h, cols, rows, { dot = 9, font = 8 } = {}) {
    const cv = document.createElement("canvas"); cv.width = cols * dot; cv.height = rows * dot; const ctx = cv.getContext("2d", { willReadFrequently: true });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = X.MAXANI;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.15, 1.15, 1.15) })); parent.add(face);
    let key = "";
    face.draw = (lines, on) => { const k = JSON.stringify(lines); if (k === key) return; key = k;
      const src = X.ledCanvas(lines, cols, rows, { font, dot, on: on || ((r, g) => (g > 200 && r < 120) ? "#3dff7a" : (r > 200 && g < 120) ? "#ff1e1e" : "#f2f2f2"), off: "#0b0d0c" });
      ctx.drawImage(src, 0, 0); t.needsUpdate = true; };
    return face;
  }
  /**
   * The generic camera language. Every shot moves: the move is parameterised by shot.p (0..1 progress) and
   * shot.variant (so repeats differ). target = what the shot is about; o.r = base distance for that cam.
   * Returns {pos, look, fov}. Sets with their own grammar override per cam.
   */
  function camMove(shot, target, o = {}) {
    const p = shot.p, v = shot.variant || 0, sg = (v % 2 ? -1 : 1), e = ease(p), T = new THREE.Vector3(...target);
    const base = { wide: 9, medium: 4, close: 1.8, macro: 0.55, track: 3.5, orbit: 3.2, crane: 6, pov: 0.01, insert: 0.9 }[shot.cam] ?? 4;
    const r = (o.r ?? 1) * base, side = (o.side ?? 0.35) * sg + v * 0.17;
    let pos, look = T.clone(), fov = 35;
    switch (shot.cam) {
      case "wide": pos = new THREE.Vector3(Math.sin(side) * r + sg * lerp(-1.2, 1.2, e), T.y + 1.6 + v * 0.3, Math.cos(side) * r - lerp(0, 1.5, e)).add(T.clone().setY(0)); fov = 38; break;
      case "medium": pos = new THREE.Vector3(Math.sin(side) * r, T.y + 0.25, Math.cos(side) * r).add(T.clone().setY(0)).add(new THREE.Vector3(0, 0, -lerp(0, 0.8, e))); fov = 32; break;
      case "close": pos = new THREE.Vector3(Math.sin(side + sg * 0.25 * e) * r, T.y + 0.12, Math.cos(side + sg * 0.25 * e) * r).add(T.clone().setY(0)); fov = 30; break;
      case "macro": pos = new THREE.Vector3(Math.sin(side) * r * lerp(1.15, 0.85, e), T.y + 0.04, Math.cos(side) * r * lerp(1.15, 0.85, e)).add(T.clone().setY(0)); fov = 26; break;
      case "insert": pos = new THREE.Vector3(Math.sin(side) * r, T.y + 0.3 * lerp(1, .6, e), Math.cos(side) * r * lerp(1.1, .9, e)).add(T.clone().setY(0)); fov = 28; break;
      case "track": pos = new THREE.Vector3(lerp(-2.4, 2.4, p) * sg, T.y + 0.1, r).add(T.clone().setY(0)); look = T.clone().add(new THREE.Vector3(sg * lerp(-0.6, 1.2, p), 0, 0)); fov = 32; break;
      case "orbit": { const a = side + sg * lerp(-0.6, 0.6, p); pos = new THREE.Vector3(Math.sin(a) * r, T.y + 0.5, Math.cos(a) * r).add(T.clone().setY(0)); fov = 32; break; }
      case "crane": pos = new THREE.Vector3(Math.sin(side) * r * 0.6, lerp(T.y + 0.5, T.y + 5.5, e), Math.cos(side) * r).add(T.clone().setY(0)); fov = 36; break;
      case "pov": pos = T.clone(); look = T.clone().add(new THREE.Vector3(Math.sin(side * 0.6 + lerp(-0.1, 0.1, p)), -0.15, 1)); fov = 50; break;
      default: pos = T.clone().add(new THREE.Vector3(0, 1, 4));
    }
    const h = handheld(shot.t ?? 0, o.shake ?? (shot.cam === "wide" || shot.cam === "crane" ? 0.01 : 0.006), v * 3.1);
    pos.x += h[0]; pos.y += h[1]; pos.z += h[2];
    return { pos, look, fov };
  }
  function place(camera, m) { camera.position.copy(m.pos); camera.fov = m.fov; camera.updateProjectionMatrix(); camera.lookAt(m.look); camera.updateMatrixWorld(); return camera; }
  return { ENV, stage, room, dotMatrix: (w, h, cols, rows, o) => _dotMatrix(THREE, w, h, cols, rows, o), dotText: _dotText, cageLamp, beam, dust, streaks, ledPanel, camMove, place, hash1, clamp };
}
