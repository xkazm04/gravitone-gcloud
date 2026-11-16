// Assemble a /music-clip film from its generated clips (clips.mts) on the beat grid, with the master under it.
//
//   npx tsx pipeline/music-clip/assemble.mts <clip dir> <out.mp4> [--size 1920x1080] [--fps 24] [--dry]
//       [--clips <subdir>] [--assembly <file>]
//
// Each keyframe's t is snapped to the nearest beat in timeline.json; clip i fills [cut_i, cut_i+1) (the last to
// the track's end). By default a clip plays from its own 0 s; a clip shorter than its span is slowed to fill it
// (LTX stops at 10 s, Stay Here's climb spans run 11.6 s). music-clip/assembly.json may name, per id, the source
// window to use - { "K25": { "in": 0, "out": 6.5 } } - which is stretched or squeezed into the span: that is how
// a clip whose end drifts (a puppet melting into a black card) is trimmed to its clean part.
// --clips takes the clips from clips/<subdir>/ and --assembly reads another windows file, so two engines' takes
// (Break the Sequence: LTX in clips/s1000, MiniMax H3 in clips/h3) each make a cut; an entry's "dir" picks one
// clip from another subdir of clips/ - a mixed cut, scene by scene.
// Cuts are frame-exact against the track (frames counted from rounded cumulative times, never per clip).
// The archive is NVENC h264 (cut.mts's settings) + AAC 384k from the lossless master; deliver.mts makes the upload copy.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = flag("--dry");
const [W, H] = (opt("--size") ?? "1920x1080").split("x").map(Number);
const fps = Number(opt("--fps") ?? 24);
const clipsSub = opt("--clips") ?? "";
const ovArg = opt("--assembly");
const [dir, outArg] = argv;
if (!dir || !outArg) { console.error("usage: assemble.mts <clip dir> <out.mp4> [--size 1920x1080] [--fps 24] [--dry]"); process.exit(2); }

const clip = path.join(dir, "music-clip");
const out = path.resolve(outArg);
const tl = JSON.parse(fs.readFileSync(path.join(clip, "timeline.json"), "utf8")) as { beats: { t: number }[]; track: { durationS: number } };
const frames = (JSON.parse(fs.readFileSync(path.join(clip, "keyframes.json"), "utf8")).frames as { id: string; t: number }[]).sort((a, b) => a.t - b.t);
const ovPath = ovArg ? path.resolve(ovArg) : path.join(clip, "assembly.json");
const ov: Record<string, { in?: number; out?: number; dir?: string }> = fs.existsSync(ovPath) ? JSON.parse(fs.readFileSync(ovPath, "utf8")) : {};
const audio = fs.readdirSync(dir).find((f) => /\.(wav|flac)$/i.test(f)) ?? fs.readdirSync(dir).find((f) => /\.mp3$/i.test(f));
if (!audio) { console.error("no audio in " + dir); process.exit(2); }

const probe = (f: string) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());
// nearest beat within half a beat; past the grid (an outro the tracker stops in) the keyframe's own t stands
const halfBeat = (tl.beats[tl.beats.length - 1].t - tl.beats[0].t) / (tl.beats.length - 1) / 2;
const snap = (t: number) => {
  if (t === 0) return 0;
  const b = tl.beats.reduce((m, x) => Math.abs(x.t - t) < Math.abs(m - t) ? x.t : m, tl.beats[0].t);
  return Math.abs(b - t) <= halfBeat ? b : t;
};
const end = tl.track.durationS;
const cuts = frames.map((f) => snap(f.t));
for (let i = 1; i < cuts.length; i++) if (cuts[i] <= cuts[i - 1]) { console.error(`${frames[i].id} snaps onto ${frames[i - 1].id}'s beat`); process.exit(2); }
const F = (t: number) => Math.round(t * fps);

const plan = frames.map((f, i) => {
  const file = path.join(clip, "clips", ov[f.id]?.dir ?? clipsSub, `${f.id}.mp4`);
  if (!fs.existsSync(file)) { console.error(`missing ${file}`); process.exit(2); }
  const len = probe(file);
  const n = F(cuts[i + 1] ?? end) - F(cuts[i]);
  const span = n / fps;
  const a = ov[f.id]?.in ?? 0, b = Math.min(len, ov[f.id]?.out ?? Math.min(len, a + span));
  return { id: f.id, file, at: cuts[i], n, span, a, b, rate: (b - a) / span };
});
for (const p of plan) console.log(`${p.id} ${p.at.toFixed(3)}s +${p.span.toFixed(2)}s  src ${p.a.toFixed(2)}-${p.b.toFixed(2)}${Math.abs(p.rate - 1) > 0.005 ? `  x${p.rate.toFixed(2)}` : ""}`);
if (dry) process.exit(0);

const chains = plan.map((p, i) =>
  `[${i}:v]trim=start=${p.a}:end=${p.b},setpts=(PTS-STARTPTS)/${p.rate.toFixed(6)},fps=${fps},` +
  `scale=-2:${H}:flags=lanczos,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop=${p.n},trim=end_frame=${p.n},setpts=PTS-STARTPTS[v${i}]`);
const graph = `${chains.join(";")};${plan.map((_, i) => `[v${i}]`).join("")}concat=n=${plan.length}:v=1:a=0[v]`;
const gf = path.join(path.dirname(out), path.basename(out) + ".graph.txt");
fs.writeFileSync(gf, graph);
const args = ["-v", "error", "-stats", "-y", ...plan.flatMap((p) => ["-i", p.file]), "-i", path.join(dir, audio),
  "-/filter_complex", gf, "-map", "[v]", "-map", `${plan.length}:a`, "-t", String(end),
  "-c:v", "h264_nvenc", "-preset", "p5", "-cq", "19", "-pix_fmt", "yuv420p", "-r", String(fps),
  "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-movflags", "+faststart", out];
const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
fs.rmSync(gf, { force: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${out}: ${probe(out).toFixed(2)} s, ${(fs.statSync(out).size / 1e6).toFixed(0)} MB`);
