// film/core/dotmatrix.js - (moved into core from sets/overseer-screen/dotmatrix.js; that path re-exports this file) a dot-matrix LED face as a shader over a low-res mask (one texel per LED),
// shared by the overseer face, the vent counter, the scanner panel and the lever read-out (same builder).
// Dots stay round at any resolution; colours are hard-classified (red / white / green / off) so anti-aliased text
// edges never light a dot in the wrong colour. Every effect is a uniform set from t: refresh band, row tear,
// rows dying, CRT collapse, gain. draw(key, fn) redraws the mask only when key changes.
export function dotMatrix(THREE, w, h, cols, rows, { gain = 1.0, offCol = [0.035, 0.006, 0.005], dot = 0.36 } = {}) {
  const cv = document.createElement("canvas"); cv.width = cols; cv.height = rows; const ctx = cv.getContext("2d", { willReadFrequently: true });
  const tx = new THREE.CanvasTexture(cv); tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMask: { value: tx }, uI: { value: gain }, uBand: { value: -1 }, uTear: { value: 0 }, uSeed: { value: 0 }, uDead: { value: 0 }, uLine: { value: 0 },
      uOff: { value: new THREE.Vector3(...offCol) }, uDot: { value: dot }, uGrid: { value: new THREE.Vector2(cols, rows) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D uMask; uniform float uI,uBand,uTear,uSeed,uDead,uLine,uDot; uniform vec3 uOff; uniform vec2 uGrid; varying vec2 vUv;
      float h(float n){ return fract(sin(n*127.1+uSeed*31.7)*43758.5453); }
      void main(){
        vec2 uv = vUv;
        float sq = mix(1.0, 0.012, uLine); uv.y = 0.5 + (uv.y - 0.5) / sq;
        float row = floor(uv.y * uGrid.y);
        uv.x += (h(row) > 0.72 ? (h(row + 7.0) - 0.5) * uTear : 0.0);
        vec2 cell = floor(uv * uGrid); vec2 f = fract(uv * uGrid) - 0.5;
        vec3 m = texture2D(uMask, (cell + 0.5) / uGrid).rgb;
        float inside = step(0.0, uv.y) * step(uv.y, 1.0) * step(0.0, uv.x) * step(uv.x, 1.0);
        float alive = step(uDead, (row + 0.5) / uGrid.y) * inside;
        float r = length(f);
        float dotm = smoothstep(uDot + 0.06, uDot - 0.06, r);
        float halo = smoothstep(0.75, 0.0, r) * 0.1;
        float band = uBand < 0.0 ? 0.0 : exp(-pow((1.0 - vUv.y - uBand) * 9.0, 2.0)) * 0.9;
        vec3 c = uOff * dotm * (1.0 + band * 2.0) * alive + m * uI * alive * (dotm * (1.0 + band) + halo);
        // the CRT line a collapsing picture leaves: one lit row across the middle
        float ln = uLine * smoothstep(0.012, 0.0, abs(vUv.y - 0.5)) * smoothstep(0.0, 0.25, min(vUv.x, 1.0 - vUv.x) * (0.6 + uLine));
        c += vec3(1.0, 0.06, 0.045) * uI * ln * (dotm + halo) * 1.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const U = mat.uniforms;
  // HDR LED colours (linear): red #ff1e1e, white, green #3dff7a
  const PAL = { r: [1, 0.06, 0.045], w: [0.95, 0.92, 0.9], g: [0.1, 1, 0.3] };
  let last = null;
  mesh.draw = (key, fn) => {
    if (key === last) return; last = key;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cols, rows);
    fn(ctx, cols, rows);
    const id = ctx.getImageData(0, 0, cols, rows), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B); let c = null;
      if (mx > 100) c = (G > 1.4 * R && G > 1.4 * B) ? PAL.g : (R > 1.6 * G && R > 1.6 * B) ? PAL.r : PAL.w;
      d[i] = c ? Math.round(c[0] * 255) : 0; d[i + 1] = c ? Math.round(c[1] * 255) : 0; d[i + 2] = c ? Math.round(c[2] * 255) : 0; d[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0); tx.needsUpdate = true;
  };
  mesh.U = U;
  return mesh;
}
/** text helper for draw(): centred bold pixel text */
export function text(ctx, s, x, y, px, col = "#fff", align = "center", track = 1, maxW = 0) {
  ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.letterSpacing = track + "px"; ctx.fillStyle = col;
  ctx.font = `900 ${px}px Arial, Helvetica, sans-serif`;
  if (maxW) while (px > 5 && ctx.measureText(s).width > maxW) { px -= 1; ctx.font = `900 ${px}px Arial, Helvetica, sans-serif`; }
  // centre by measurement (canvas centring with letterSpacing drifts left by one glyph)
  if (align === "center") { const wd = ctx.measureText(s).width - track; ctx.textAlign = "left"; ctx.fillText(s, Math.round(x - wd / 2), y); }
  else ctx.fillText(s, x, y);
}
