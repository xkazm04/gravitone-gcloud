// film/core/textures.js - the procedural texture/material library (seeded; generated once before READY).
// Ported verbatim from board-t/unit-0451/scene.html (the approved 4K look): system fonts only, every 2D canvas
// on the CPU rasteriser (willReadFrequently) so the pixels are identical between page loads.
import { mulberry, lerp, sm } from "./env.js";

export function createTextures(THREE, renderer) {
const FONT = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
// willReadFrequently keeps every 2D canvas on the CPU rasteriser: GPU-raster canvases differed between page loads (purity)
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", { willReadFrequently: true })]; }
const MAXANI = renderer.capabilities.getMaxAnisotropy();
function tex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXANI; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
function dataTex(c, rep) { const t = new THREE.CanvasTexture(c); t.anisotropy = MAXANI; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
// stencil text on a plane (white/red paint), alpha
function stencilTex(lines, { w = 1024, h = 256, size = 120, color = "#e8e8e8", track = 18, align = "center", weather = true } = {}) {
  const [c, g] = canvas(w, h); g.clearRect(0, 0, w, h);
  g.fillStyle = color; g.textBaseline = "middle"; g.textAlign = align; g.font = `900 ${size}px ${FONT}`; g.letterSpacing = track + "px";
  const lh = h / lines.length;
  lines.forEach((s, i) => g.fillText(s, align === "center" ? w / 2 : 10, lh * (i + .5)));
  if (weather) { const r = mulberry(lines.join().length * 77); g.globalCompositeOperation = "destination-out"; for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * .7})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3); } }
  return tex(c);
}
// dot-matrix LED: text rasterised small, then one dot per pixel
function ledCanvas(lines, cols, rows, { on = "#ff2a20", off = "#1a0505", dot = 8, font = 13 } = {}) {
  const [, sg] = canvas(cols, rows); sg.fillStyle = "#000"; sg.fillRect(0, 0, cols, rows);
  sg.fillStyle = "#fff"; sg.textBaseline = "middle"; sg.font = `700 ${font}px Arial, Helvetica, sans-serif`;
  const lh = rows / lines.length;
  lines.forEach((l, i) => { const [txt, al, col] = Array.isArray(l) ? l : [l, "center"]; sg.textAlign = al || "center"; sg.letterSpacing = "1px"; sg.fillStyle = col || "#fff"; sg.fillText(txt, al === "left" ? 2 : cols / 2, lh * (i + .5) + 1); });
  const px = sg.getImageData(0, 0, cols, rows).data;
  const [c, g] = canvas(cols * dot, rows * dot); g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4; const v = px[i + 1] / 255; const rr = px[i] / 255;
    let col = off;
    if (v > .45 || rr > .45) col = (typeof on === "function") ? on(px[i], px[i + 1], px[i + 2]) : on;
    g.fillStyle = col; g.beginPath(); g.arc(x * dot + dot / 2, y * dot + dot / 2, dot * .38, 0, 7); g.fill();
  }
  return c;
}
// ---------- materials ----------
function noiseCanvas(w, h, seed, fn) { const [c, g] = canvas(w, h); const img = g.createImageData(w, h); const r = mulberry(seed); fn(img.data, w, h, r); g.putImageData(img, 0, 0); return c; }
function vnoise(w, h, r, scale) { // tileable value noise grid
  const gw = Math.ceil(w / scale), gh = Math.ceil(h / scale); const grid = []; for (let i = 0; i < gw * gh; i++) grid.push(r());
  return (x, y) => { const fx = x / scale, fy = y / scale; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = fx - x0, ty = fy - y0; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const G = (i, j) => grid[((j % gh + gh) % gh) * gw + ((i % gw + gw) % gw)];
    return lerp(lerp(G(x0, y0), G(x0 + 1, y0), sx), lerp(G(x0, y0 + 1), G(x0 + 1, y0 + 1), sx), sy); };
}
// floor: wet concrete with puddles; colour and roughness from one noise
const floorCol = noiseCanvas(2048, 2048, 11, (d, w, h, r) => { const n1 = vnoise(w, h, r, 256), n2 = vnoise(w, h, r, 48), n3 = vnoise(w, h, r, 8);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = .55 * n1(x, y) + .3 * n2(x, y) + .15 * n3(x, y); const c = 30 + v * 38 + (r() - .5) * 10; const i = (y * w + x) * 4; d[i] = c; d[i + 1] = c * .98; d[i + 2] = c * .96; d[i + 3] = 255; } });
const floorRough = noiseCanvas(512, 512, 12, (d, w, h, r) => { const n1 = vnoise(w, h, r, 90), n2 = vnoise(w, h, r, 20);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = .7 * n1(x, y) + .3 * n2(x, y); const wet = sm(.52, .6, v); const c = 255 * lerp(.85, .08, wet); const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255; } });
const floorMat = new THREE.MeshStandardMaterial({ map: tex(floorCol, [14, 14]), roughnessMap: dataTex(floorRough, [9, 9]), roughness: 1, metalness: 0.15, color: 0x8a8a8a });
// ---------- procedural PBR sets (seeded; generated once at load) ----------
// height canvas -> tangent-space normal map (OpenGL convention, +Y up after flipY)
function normalFromHeight(hc, k) {
  const w = hc.width, h = hc.height, src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h); const img = g.createImageData(w, h), d = img.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * k, dy = (H(x, y + 1) - H(x, y - 1)) / 255 * k;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * .5 + .5) * 255; d[i + 1] = (dy / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
// one tile = TILE metres of hull: panel seams, rivets, dents, brushed grain, scratches, grime, oil streaks, edge wear
const TILE = 0.5, TS = 2048;
function hullSet(seed, o) {
  const r = mulberry(seed), S = TS;
  const [hc, hg] = canvas(S, S), [cc, cg] = canvas(S, S), [rc, rg] = canvas(S, S);
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  cg.fillStyle = o.base; cg.fillRect(0, 0, S, S);
  rg.fillStyle = `rgb(${o.rough},${o.rough},${o.rough})`; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, rad = 80 + r() * 320; const gr = cg.createRadialGradient(x, y, 0, x, y, rad); const a = r() * .12; gr.addColorStop(0, r() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * .6})`); gr.addColorStop(1, "rgba(0,0,0,0)"); cg.fillStyle = gr; cg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 5000; i++) { const y = r() * S, x = r() * S, L = 40 + r() * 300; const v = r() < .5 ? 0 : 255; hg.strokeStyle = `rgba(${v},${v},${v},${.04 + r() * .05})`; hg.lineWidth = 1; hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + L, y + (r() - .5) * 3); hg.stroke(); }
  for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, rad = 30 + r() * 140; const gr = hg.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${.25 + r() * .3})`); gr.addColorStop(1, "rgba(0,0,0,0)"); hg.fillStyle = gr; hg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const seams = [[0, 0, S, 0], [0, 0, 0, S]];
  seams.push([S * (.3 + r() * .4), 0, 0, S]); seams[2][2] = seams[2][0];
  const y1 = S * (.25 + r() * .2), y2 = S * (.62 + r() * .2); seams.push([0, y1, S, y1], [0, y2, S, y2]);
  for (const [x0, y0, x1, y1_] of seams) {
    const vert = x0 === x1;
    const line = (g, w, st) => { g.strokeStyle = st; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1_); g.stroke(); if (x0 === 0 && vert) { g.beginPath(); g.moveTo(S, y0); g.lineTo(S, y1_); g.stroke(); } if (y0 === 0 && !vert) { g.beginPath(); g.moveTo(x0, S); g.lineTo(x1, S); g.stroke(); } };
    line(hg, 7, "#000");
    cg.save(); cg.filter = "blur(10px)"; line(cg, 22, "rgba(8,6,4,.75)"); cg.restore();
    line(cg, 5, "rgba(0,0,0,.9)");
    rg.save(); rg.filter = "blur(8px)"; line(rg, 24, "rgba(230,230,230,.8)"); rg.restore();
    const L = Math.hypot(x1 - x0, y1_ - y0), n = Math.floor(L / 96);
    for (let k = 0; k < n; k++) { const u = (k + .5) / n; for (const e of [-22, 22]) {
      const x = x0 + (x1 - x0) * u + (vert ? e : 0), y = y0 + (y1_ - y0) * u + (vert ? 0 : e);
      if (x < 12 || y < 12 || x > S - 12 || y > S - 12) continue;
      const gr = hg.createRadialGradient(x - 2, y - 2, 0, x, y, 10); gr.addColorStop(0, "#fff"); gr.addColorStop(.7, "#c8c8c8"); gr.addColorStop(1, "rgba(128,128,128,0)"); hg.fillStyle = gr; hg.beginPath(); hg.arc(x, y, 10, 0, 7); hg.fill();
      cg.fillStyle = "rgba(20,16,12,.55)"; cg.beginPath(); cg.arc(x, y, 11, 0, 7); cg.fill(); cg.fillStyle = o.rivet; cg.beginPath(); cg.arc(x - 1, y - 1, 7, 0, 7); cg.fill();
      if (r() < .45) { const gr2 = cg.createLinearGradient(x, y, x, y + 60 + r() * 220); gr2.addColorStop(0, "rgba(10,8,5,.55)"); gr2.addColorStop(1, "rgba(10,8,5,0)"); cg.fillStyle = gr2; cg.fillRect(x - 3, y, 6, 280); }
    } }
  }
  for (let i = 0; i < o.chips; i++) { const x = r() * S, y = r() * S, w = 2 + r() * 14, h = 1 + r() * 8, a = r() * 3; cg.fillStyle = o.chip; cg.beginPath(); cg.ellipse(x, y, w, h, a, 0, 7); cg.fill(); hg.fillStyle = "rgba(0,0,0,.35)"; hg.beginPath(); hg.ellipse(x, y, w, h, a, 0, 7); hg.fill(); rg.fillStyle = "rgba(60,60,60,.8)"; rg.beginPath(); rg.ellipse(x, y, w, h, a, 0, 7); rg.fill(); }
  for (let i = 0; i < 420; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, L = 20 + r() * 180; const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
    cg.strokeStyle = `rgba(190,195,200,${.15 + r() * .35})`; cg.lineWidth = 1 + r(); cg.beginPath(); cg.moveTo(x, y); cg.lineTo(x2, y2); cg.stroke();
    hg.strokeStyle = "rgba(0,0,0,.4)"; hg.lineWidth = 1.2; hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x2, y2); hg.stroke();
    rg.strokeStyle = "rgba(40,40,40,.6)"; rg.lineWidth = 1.5; rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x2, y2); rg.stroke(); }
  for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, L = 100 + r() * 500; const gr = cg.createLinearGradient(x, y, x, y + L); gr.addColorStop(0, `rgba(12,9,6,${.25 + r() * .35})`); gr.addColorStop(1, "rgba(12,9,6,0)"); cg.fillStyle = gr; cg.fillRect(x, y, 3 + r() * 9, L); rg.fillStyle = "rgba(200,200,200,.25)"; rg.fillRect(x, y, 8, L * .6); }
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXANI; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1 / TILE, 1 / TILE); return t; };
  return { map: mk(cc, true), normalMap: mk(normalFromHeight(hc, o.nk || 4), false), roughnessMap: mk(rc, false) };
}
function rubberSet(seed) {
  const r = mulberry(seed), S = 1024; const [hc, hg] = canvas(S, S), [cc, cg] = canvas(S, S);
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S); cg.fillStyle = "#1b1c1e"; cg.fillRect(0, 0, S, S);
  for (let i = 0; i < 20000; i++) { const v = r() < .5 ? 0 : 255; hg.fillStyle = `rgba(${v},${v},${v},.25)`; hg.fillRect(r() * S, r() * S, 2, 2); }
  for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rad = 20 + r() * 90; const gr = cg.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(60,55,50,${r() * .25})`); gr.addColorStop(1, "rgba(0,0,0,0)"); cg.fillStyle = gr; cg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXANI; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(4, 4); return t; };
  return { map: mk(cc, true), normalMap: mk(normalFromHeight(hc, 2), false) };
}
const floorDetail = (() => { const r = mulberry(91), S = 2048; const [hc, hg] = canvas(S, S); hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 60000; i++) { hg.fillStyle = `rgba(0,0,0,${r() * .5})`; hg.beginPath(); hg.arc(r() * S, r() * S, .5 + r() * 2.5, 0, 7); hg.fill(); }
  for (let i = 0; i < 40; i++) { let x = r() * S, y = r() * S; hg.strokeStyle = "rgba(0,0,0,.7)"; hg.lineWidth = 1 + r() * 1.5; hg.beginPath(); hg.moveTo(x, y); for (let k = 0; k < 30; k++) { x += (r() - .5) * 40; y += (r() - .3) * 30; hg.lineTo(x, y); } hg.stroke(); }
  const t = new THREE.CanvasTexture(normalFromHeight(hc, 3)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXANI; t.repeat.set(86, 86); return t; })();
floorMat.normalMap = floorDetail; floorMat.normalScale.set(0.7, 0.7);

// painted lane lines
function laneCanvas() { const [c, g] = canvas(64, 1024); g.clearRect(0, 0, 64, 1024); for (let y = 0; y < 1024; y += 128) { g.fillStyle = "rgba(235,235,235,.85)"; g.fillRect(8, y, 48, 80); } const r = mulberry(5); g.globalCompositeOperation = "destination-out"; for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r()})`; g.fillRect(r() * 64, r() * 1024, 2, 2); } return c; }
// corrugated steel shutter with hazard band and stencil
function shutterCanvas(label, line2) { const [c, g] = canvas(1024, 2048); g.scale(2, 2);
  for (let y = 0; y < 1024; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, "#3a3b3e"); gr.addColorStop(.5, "#55575b"); gr.addColorStop(1, "#202124"); g.fillStyle = gr; g.fillRect(0, y, 512, 16); }
  for (let x = -100; x < 600; x += 70) { g.fillStyle = "#b8161a"; g.beginPath(); g.moveTo(x, 940); g.lineTo(x + 35, 940); g.lineTo(x + 75, 1024); g.lineTo(x + 40, 1024); g.fill(); }
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 930, 512, 8);
  g.fillStyle = "#e6e6e6"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 120px ${FONT}`; g.letterSpacing = "14px"; g.fillText(label, 256, 300);
  if (line2) { g.font = `900 40px ${FONT}`; g.letterSpacing = "10px"; g.fillText(line2, 256, 420); }
  const r = mulberry(label.charCodeAt(0) * 13 + 7); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < .5 ? "20,10,5" : "90,60,40"},${r() * .35})`; g.fillRect(r() * 512, r() * 1024, 1 + r() * 6, 1 + r() * 20); }
  return c; }
function bumpStripes() { const [c, g] = canvas(8, 256); for (let y = 0; y < 256; y++) { const v = 128 + 127 * Math.sin(y / 256 * Math.PI * 2 * 16); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, 8, 1); } return dataTex(c); }
const BUMP = bumpStripes();
// hull: dark gunmetal; dark: blackened steel (joints, pelvis, pack); paint: chipped off-white pads; rubber: waist bellows
const HULL = hullSet(4511, { base: "#4d5056", rivet: "#7a7d82", chip: "rgba(150,155,160,.6)", rough: 105, chips: 350, nk: 2.5 });
const DARK = hullSet(4512, { base: "#1d1e21", rivet: "#3b3d41", chip: "rgba(95,98,102,.6)", rough: 140, chips: 300, nk: 2.5 });
const PAINT = hullSet(4513, { base: "#82848a", rivet: "#6d7073", chip: "rgba(45,47,50,.95)", rough: 205, chips: 900, nk: 2.5 });
const RUB = rubberSet(4514);
const robotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.78, roughness: 1, ...HULL, normalScale: new THREE.Vector2(0.9, 0.9) });
const darkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.65, roughness: 1, ...DARK, normalScale: new THREE.Vector2(0.9, 0.9) });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 1, ...PAINT, normalScale: new THREE.Vector2(0.8, 0.8) });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.05, roughness: 0.82, ...RUB });
// visor: LED segments with dark gaps and fine scanlines, so the strip resolves at 4K
const visorTex = (() => { const [c, g] = canvas(1024, 128); g.fillStyle = "#fff"; g.fillRect(0, 0, 1024, 128);
  for (let x = 0; x < 1024; x += 32) { g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x, 0, 4, 128); }
  for (let y = 0; y < 128; y += 8) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, y, 1024, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXANI; return t; })();
const visorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: visorTex });
// chest plate serial atlas 8x8; cell 0 = 0451, cell 1 = 0452
const SERIALS = []; { const r = mulberry(451); SERIALS.push("0451", "0452"); while (SERIALS.length < 64) SERIALS.push(String(Math.floor(r() * 9000) + 1000).padStart(4, "0")); }
const atlas = (() => { const [c, g] = canvas(4096, 2048); g.scale(2, 2); for (let k = 0; k < 64; k++) { const cx = (k % 8) * 256, cy = Math.floor(k / 8) * 128;
  g.fillStyle = "#6a6c70"; g.fillRect(cx, cy, 256, 128); g.fillStyle = "#b31a1a"; g.fillRect(cx, cy + 104, 256, 10);
  g.fillStyle = "#f0f0f0"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 78px ${FONT}`; g.letterSpacing = "6px"; g.fillText(SERIALS[k], cx + 128, cy + 56);
  // stencil bridges: plate colour cut through each glyph
  g.fillStyle = "#6a6c70"; for (let q = 0; q < 4; q++) { const gx = cx + 128 + (q - 1.5) * 52; g.fillRect(gx - 1.5, cy + 22, 3, 14); g.fillRect(gx - 1.5, cy + 76, 3, 14); }
  // rivets in the plate corners
  for (const [px, py] of [[10, 10], [246, 10], [10, 96], [246, 96]]) { g.fillStyle = "#3b3c40"; g.beginPath(); g.arc(cx + px, cy + py, 5, 0, 7); g.fill(); g.fillStyle = "#9a9ca0"; g.beginPath(); g.arc(cx + px - 1, cy + py - 1, 3, 0, 7); g.fill(); }
  const r = mulberry(k + 3); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(30,20,15,${r() * .5})`; g.fillRect(cx + r() * 256, cy + r() * 128, .5 + r() * 2, .5 + r() * 6); }
  for (let i = 0; i < 3; i++) { const x = cx + r() * 256; const gr = g.createLinearGradient(0, cy, 0, cy + 128); gr.addColorStop(0, "rgba(15,10,6,0)"); gr.addColorStop(1, `rgba(15,10,6,${.2 + r() * .3})`); g.fillStyle = gr; g.fillRect(x, cy + r() * 60, 2 + r() * 5, 128); } }
  return tex(c); })();
const plateMat = new THREE.MeshStandardMaterial({ map: atlas, metalness: 0.4, roughness: 0.5 });
plateMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aCell;")
    .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + vec2(mod(aCell, 8.0), 7.0 - floor(aCell / 8.0))) / 8.0;\n#endif");
};
const dotTex = (() => { const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.4, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function envFrom(cols) { const es = new THREE.Scene(); es.background = new THREE.Color(0);
  cols.forEach(([c, x, y, z, w, h]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); });
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(es, 0.03); pm.dispose(); return rt.texture; }
function beamMat(col) { return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uCol: { value: new THREE.Color(col) }, uI: { value: 1 } },
  vertexShader: "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=uv.y; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
  fragmentShader: "uniform vec3 uCol; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(abs(dot(vN,vV)),2.0); float a=f*pow(clamp(vY,0.0,1.0),1.6)*0.11*uI; gl_FragColor=vec4(uCol*a,1.0);} " }); }

  // extra shared helpers for sets
  function makeMat(o) { return new THREE.MeshStandardMaterial(o); }
  return { FONT, canvas, MAXANI, tex, dataTex, stencilTex, ledCanvas, noiseCanvas, vnoise, floorCol, floorRough, floorMat, normalFromHeight, TILE, hullSet, rubberSet,
    floorDetail, laneCanvas, shutterCanvas, bumpStripes, BUMP, HULL, DARK, PAINT, RUB, robotMat, darkMat, whiteMat, rubberMat, visorTex, visorMat, SERIALS, atlas, plateMat,
    dotTex, envFrom, beamMat, makeMat };
}
