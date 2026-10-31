// /music-clip END TO END through the real CLI (`npx tsx pipeline/music-clip.mts`,
// spawned without a shell), in a temp folder: a 30 s tone as the track, the
// fixture timeline as the analysis (WP1's analyser is not called - the analyze
// verb itself is exercised only for its no-spend refusal), then board a, the
// pick, board t with one three.js scene shot on the GPU (and one treatment
// with none), the t pick, board b with a canvas hero, the pack, a one-stack
// comparison and the stack pick that lands final.mp4. Chromium photographs
// every board; the test checks the PNGs exist and are not trivially small. Set MUSIC_CLIP_KEEP=<dir>
// to keep the folder for looking at the sheets.

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtureTimeline } from "../../lib/music-clip/fixtures/timeline.ts";
import { sha1File, writeClipJson, writeState } from "../../lib/music-clip/folder.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
const NPX = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"), path.join(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npx-cli.js")].find((p) => fs.existsSync(p)) as string;

async function cli(...args: string[]): Promise<{ code: number; json: Record<string, unknown> }> {
  try {
    const { stdout } = await run(process.execPath, [NPX, "--no-install", "tsx", "pipeline/music-clip.mts", ...args, "--json"], { cwd: ROOT, timeout: 120_000, windowsHide: true, env: { ...process.env, GRAVITONE_STORE_PATH: path.join(tmpdir(), "music-clip-never.sqlite") } });
    return { code: 0, json: JSON.parse(stdout.trim().split("\n").pop() as string) };
  } catch (e) {
    const x = e as { code?: number; stdout?: string };
    return { code: typeof x.code === "number" ? x.code : -1, json: JSON.parse((x.stdout ?? "{}").trim().split("\n").pop() || "{}") };
  }
}

const HERO = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{width:100vw;height:100vh;display:block}</style></head>
<body><canvas id="c" width="1280" height="720"></canvas><script>
var T = window.__TIMELINE__;
var c = document.getElementById("c"), g = c.getContext("2d");
window.render = function (t) {
  var i = Math.max(0, Math.min(T.intensity.length - 1, Math.round(t * T.fps) - Math.round(T.sliceStartS * T.fps)));
  var low = T.bands.low[i] || 0, k = T.intensity[i] || 0;
  var last = 0; for (var j = 0; j < T.beats.length; j++) if (T.beats[j].t <= t) last = T.beats[j].t;
  var since = t - last, x = ((t - T.hero.startS) / (T.hero.endS - T.hero.startS)) * 1280;
  g.fillStyle = "rgb(" + Math.round(40 + 180 * k) + ",20,30)"; g.fillRect(0, 0, 1280, 720);
  g.strokeStyle = "#ff7a3d"; g.lineWidth = 6; g.beginPath(); g.arc(640, 360, 80 + 220 * Math.exp(-since * 4) * (0.5 + low), 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#e8e6e1"; g.fillRect(x - 3, 650, 6, 50);
  g.font = "600 44px sans-serif"; g.fillText(t.toFixed(2) + " s", 40, 80);
};
</script></body></html>`;

// A tiny lit three.js world on the gpuShot contract: import map into the clip
// folder's vendor/three, __TIMELINE__ read, render(t) pure in t, __READY__ last.
const SCENE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js","three/addons/":"../../vendor/three/examples/jsm/"}}</script></head>
<body><script type="module">
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
const T = window.__TIMELINE__;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const s = new THREE.Scene(); s.fog = new THREE.FogExp2(0x1b1b1e, 0.06); s.background = new THREE.Color(0x1b1b1e);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const units = [];
for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a2c1c, metalness: 0.7, roughness: 0.35 })); m.position.set((i - 4) * 1.4, 0, -i * 0.3); s.add(m); units.push(m); }
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x222226 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1; s.add(floor);
const key = new THREE.PointLight(0xe86a33, 80); key.position.set(-3, 4, 4); s.add(key); s.add(new THREE.AmbientLight(0x404050, 0.6));
const c = new EffectComposer(r); c.addPass(new RenderPass(s, cam)); c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.4, 0.2));
window.render = (t) => {
  const k = T.intensity[Math.min(T.intensity.length - 1, Math.round(t * T.fps))] || 0;
  cam.position.set(Math.sin(t * 0.2) * 3, 1.2, 9 - t * 0.15); cam.lookAt(0, 0, -2);
  units.forEach((u, i) => { u.rotation.y = t * 0.3 + i * 0.4; u.scale.y = 0.6 + k; });
  key.intensity = 40 + 120 * k; c.render();
};
window.__READY__ = true;
</script></body></html>`;

const treatment = (id: string, name: string) => ({
  id, name, logline: "unit 7 stops and the line follows", characters: "nine visored units, numbered chests", characterTech: "three.js boxes, instanced",
  signatureDevice: "one endless push down the line", motif: "the visor light: white, red, green",
  plot: [
    { sectionId: "s1", beat: "bar 1 beat 1: the line is dark", shot: "slow push" },
    { sectionId: "s2", beat: "bar 5 beat 1: unit 7 stops", shot: "push, key from the left" },
    { sectionId: "s3", beat: "bar 9 beat 1: the row turns", shot: "orbit, cut on downbeats" },
    { sectionId: "s4", beat: "bar 13 beat 1: green", shot: "rise and hold" },
  ],
  transitions: [{ grid: "section", move: "fly through the shutter" }, { grid: "downbeat", move: "hard cut" }],
  shotLengthS: { verse: 3, chorus: 1, bridge: 6 }, post: ["bloom", "grain", "vignette"], risk: "the row reads as a screensaver",
  keyframes: [{ t: 4, sectionId: "s1", caption: "the dark line" }, { t: 12, sectionId: "s2", caption: "unit 7 stops" }, { t: 20, sectionId: "s3", caption: "the row turns" }, { t: 27, sectionId: "s4", caption: "green" }],
});

const direction = (id: string, name: string, palette: string[]) => ({ id, name, animation: "beat-locked push-ins", palette, type: "condensed grotesk, all caps", story: "a factory floor wakes on the downbeat", transitions: ["hard cut on bar", "white flash 2f"], risk: "flash rate in the chorus" });

describe("music-clip CLI end to end", () => {
  let d = "";
  beforeAll(() => {
    d = process.env["MUSIC_CLIP_KEEP"] ?? fs.mkdtempSync(path.join(tmpdir(), "music-clip-cli-"));
    fs.mkdirSync(d, { recursive: true });
    const mp3 = path.join(d, "Fixture Song.mp3");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=30:sample_rate=48000", "-c:a", "libmp3lame", "-q:a", "6", mp3], { windowsHide: true });
    fs.writeFileSync(path.join(d, "lyrics.txt"), "[Verse 1]\nIron wakes beneath the floor\n[Chorus]\nBreak the sequence\n");
    fs.writeFileSync(path.join(d, "style.txt"), "industrial metal, 120 BPM");
  }, 60_000);
  afterAll(() => {
    if (!process.env["MUSIC_CLIP_KEEP"]) fs.rmSync(d, { recursive: true, force: true });
  });

  it("analyze with neither --yes nor --dry refuses and spends nothing", async () => {
    const r = await cli("analyze", d);
    expect(r.code).toBe(2);
    expect(r.json["refused"]).toBe(true);
    expect((r.json["plan"] as string[]).at(-1)).toBe("pass --yes to spend one Gemini call, --dry for none");
    expect(fs.existsSync(path.join(d, "music-clip", "timeline.json"))).toBe(false);
  }, 120_000);

  it("walks board a, pick, board b, pack, compare and the stack pick", async () => {
    const mp3 = path.join(d, "Fixture Song.mp3");
    writeClipJson(d, "timeline.json", fixtureTimeline(sha1File(mp3), "Fixture Song.mp3"));
    writeState(d, { v: 1, stage: "analyzed", trackSha1: sha1File(mp3), picks: {}, updatedAt: new Date().toISOString() });

    // Refusals first: 11 directions and a bad palette, every violation named.
    const eleven = Array.from({ length: 11 }, (_, i) => direction(`d-${i}`, `D ${i}`, ["#000000"]));
    eleven[2] = direction("d-2", "D 2", ["#zzzzzz"]);
    writeClipJson(d, "directions.json", { v: 1, directions: eleven });
    const refused = await cli("board", "a", d);
    expect(refused.code).toBe(1);
    expect(String(refused.json["error"])).toMatch(/11 directions; at most 10.*"#zzzzzz" is not #rrggbb/);

    writeClipJson(d, "directions.json", {
      v: 1,
      directions: [direction("rust-choir", "Rust Choir", ["#1b1b1e", "#8a2c1c", "#e86a33", "#f2d0a4"]), direction("cold-grid", "Cold Grid", ["#0b1020", "#1f6feb", "#9ecbff"]), direction("paper-riot", "Paper Riot", ["#f4f1e8", "#111111", "#e63946"])],
    });
    fs.mkdirSync(path.join(d, "music-clip", "board-a"), { recursive: true });
    fs.writeFileSync(path.join(d, "music-clip", "board-a", "rust-choir.html"), `<!DOCTYPE html><html><body style="margin:0;height:100vh;background:radial-gradient(circle at 30% 40%,#e86a33,#8a2c1c 40%,#1b1b1e 75%)"><svg viewBox="0 0 160 90" style="width:100%;height:100%"><g stroke="#f2d0a4" stroke-width="1.5" fill="none"><circle cx="80" cy="45" r="20"/><circle cx="80" cy="45" r="32"/></g></svg></body></html>`);
    const a = await cli("board", "a", d);
    expect(a.code).toBe(0);
    expect(a.json["stage"]).toBe("board-a");
    expect(a.json["warnings"]).toEqual(["cold-grid: no board-a/cold-grid.html, palette card drawn", "paper-riot: no board-a/paper-riot.html, palette card drawn"]);
    expect(fs.statSync(path.join(d, "music-clip", "board-a-sheet.png")).size).toBeGreaterThan(20_000);
    const boardA = fs.readFileSync(path.join(d, "music-clip", "board-a.html"), "utf8");
    expect(boardA).toContain('data-direction="rust-choir"');
    expect(boardA).not.toMatch(/(src|href)="https?:/);

    const bad = await cli("pick", d, "a:nope");
    expect(bad.code).toBe(1);
    expect(String(bad.json["error"])).toContain("valid: rust-choir, cold-grid, paper-riot");
    const p1 = await cli("pick", d, "a:rust-choir");
    const state1 = fs.readFileSync(path.join(d, "music-clip", "state.json"), "utf8");
    const p2 = await cli("pick", d, "a:rust-choir");
    expect([p1.json["changed"], p2.json["changed"]]).toEqual([true, false]);
    expect(fs.readFileSync(path.join(d, "music-clip", "state.json"), "utf8")).toBe(state1);

    // Board T: board b refuses before a treatment is picked.
    expect(String((await cli("board", "b", d)).json["error"])).toMatch(/board b needs a treatment/);
    writeClipJson(d, "treatments.json", { v: 1, direction: "rust-choir", treatments: [{ ...treatment("x", "X"), keyframes: [{ t: 31, sectionId: "s4", caption: "late" }] }] });
    expect(String((await cli("board", "t", d)).json["error"])).toMatch(/keyframes\[0\]\.t 31 is outside the track/);
    writeClipJson(d, "treatments.json", { v: 1, direction: "rust-choir", treatments: [treatment("one-who-stops", "The One Who Stops"), treatment("assembly-birth", "Assembly Birth")] });
    fs.mkdirSync(path.join(d, "music-clip", "board-t", "one-who-stops"), { recursive: true });
    fs.writeFileSync(path.join(d, "music-clip", "board-t", "one-who-stops", "scene.html"), SCENE);
    const bt = await cli("board", "t", d);
    expect(bt.code).toBe(0);
    expect(bt.json["stage"]).toBe("board-t");
    expect(bt.json["warnings"]).toEqual(["assembly-birth: no board-t/assembly-birth/scene.html, text only"]);
    const shots = bt.json["treatments"] as { id: string; shot: string; frames: string[]; renderer?: string; msPerFrame?: number; errors: string[] }[];
    expect(shots.map((x) => [x.id, x.shot, x.frames.length])).toEqual([["one-who-stops", "now", 4], ["assembly-birth", "none", 0]]);
    expect(shots[0]?.errors).toEqual([]);
    console.log(`board t renderer: ${shots[0]?.renderer}  ${shots[0]?.msPerFrame} ms/frame`);
    expect(shots[0]?.renderer).not.toMatch(/SwiftShader|unknown|no webgl2/);
    for (const f of shots[0]?.frames ?? []) expect(fs.statSync(path.join(d, "music-clip", f)).size).toBeGreaterThan(20_000);
    expect(fs.statSync(path.join(d, "music-clip", "board-t-sheet.png")).size).toBeGreaterThan(50_000);
    const boardT = fs.readFileSync(path.join(d, "music-clip", "board-t.html"), "utf8");
    expect(boardT).toContain('data-treatment="assembly-birth"');
    expect(boardT).toContain('src="board-t/one-who-stops/frames/k-4.00.png"');
    expect(boardT).not.toMatch(/(src|href)="https?:/);
    // --only re-shoots nothing but the one named; the other's frames are reused.
    expect((await cli("board", "t", d, "--only", "nope")).json["error"]).toMatch(/valid: one-who-stops, assembly-birth/);
    const only = await cli("board", "t", d, "--only", "assembly-birth");
    expect((only.json["treatments"] as { shot: string }[]).map((x) => x.shot)).toEqual(["reused", "none"]);
    expect((await cli("pick", d, "t:nope")).json["error"]).toMatch(/valid: one-who-stops, assembly-birth/);
    expect((await cli("pick", d, "t:one-who-stops")).json["stage"]).toBe("picked-t");

    writeClipJson(d, "story.json", {
      v: 1,
      direction: "rust-choir",
      treatment: "one-who-stops",
      sections: [
        { id: "s1", title: "Cold pulse", beat: "the floor is dark", visual: "one lamp", cutsPerBar: 0.5 },
        { id: "s2", title: "Chug", beat: "machines start", visual: "pistons", cutsPerBar: 1 },
        { id: "s3", title: "Hook", beat: "the wall breaks", visual: "sparks on the downbeat", cutsPerBar: 2 },
        { id: "s4", title: "Afterglow", beat: "embers", visual: "slow pull out", cutsPerBar: 0.5 },
      ],
      hero: { sectionId: "s3", startS: 16, endS: 22 },
    });
    fs.mkdirSync(path.join(d, "music-clip", "board-b"), { recursive: true });
    fs.writeFileSync(path.join(d, "music-clip", "board-b", "hero.html"), HERO);
    const b = await cli("board", "b", d);
    expect(b.code).toBe(0);
    expect(b.json["stage"]).toBe("board-b");
    expect(b.json["framesDiffer"]).toBe(true);
    expect(b.json["lint"]).toEqual([]);
    expect(fs.statSync(path.join(d, "music-clip", "board-b-sheet.png")).size).toBeGreaterThan(20_000);

    expect((await cli("pick", d, "b:cold-grid")).json["error"]).toMatch(/valid: rust-choir/);
    expect((await cli("pack", d)).code).toBe(1);
    expect((await cli("pick", d, "b:rust-choir")).json["stage"]).toBe("picked-b");
    const pk = await cli("pack", d);
    expect(pk.code).toBe(0);
    expect(pk.json["stage"]).toBe("bakeoff");
    expect(pk.json["warnings"]).toEqual([]);

    const stackDir = path.join(d, "music-clip", "bakeoff", "kernel");
    fs.mkdirSync(stackDir, { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x8a2c1c:s=320x180:d=1", "-pix_fmt", "yuv420p", path.join(stackDir, "full.mp4")], { windowsHide: true });
    writeClipJson(d, "bakeoff/kernel/result.json", { v: 1, stack: "kernel", fullMp4: "full.mp4", proofMp4: "full.mp4", renderSeconds: 12.5, framesPerSecond: 72 });
    const cmp = await cli("compare", d);
    expect(cmp.json["stacks"]).toEqual([{ stack: "kernel", present: true }, { stack: "hyperframes", present: false }, { stack: "remotion", present: false }]);
    expect((await cli("pick", d, "stack:remotion")).code).toBe(1);
    const fin = await cli("pick", d, "stack:kernel");
    expect(fin.json["stage"]).toBe("final");
    expect(fs.existsSync(path.join(d, "music-clip", "final.mp4"))).toBe(true);

    const st = await cli("status", d);
    expect(st.json["stage"]).toBe("final");
    expect((st.json["artifacts"] as Record<string, boolean>)["final.mp4"]).toBe(true);
  }, 600_000);
});
