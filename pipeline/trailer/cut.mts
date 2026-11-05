// The cut of a /trailer-clip: H3 clips and their own sound, in the order of edit.json, with black held as true silence.
//
//   npx tsx pipeline/trailer/cut.mts <folder> <out.mp4> [--edit edit.json] [--dry]
//
// <folder>/music-clip/edit.json:
//   { "scenes": [ { "id": "S01", "in": 0.4, "out": 5.0, "rate": 1, "gainDb": 3, "fadeIn": 0, "fadeOut": 0.3, "dir": "h3" },
//                 { "black": 3.5 } ] }
//
// assemble.mts is the wrong tool here for two measured reasons. It maps the track's audio and throws the clips' away,
// and it plays an H3 render at about 1.8x inside a bar, which is fine under a master and audible as pitch under a
// clip's own sound. So rate defaults to 1 and any other rate keeps its pitch through atempo. H3's sound comes out at
// 32 kHz stereo and its level swings by clip (Unlatched, h3-v2: mean -42.2 dB to -14.0 dB), so gainDb is per scene,
// and --dry prints each clip's measured level to set it from.
//
// Native sound only, by the operator's order of work (2026-11-05): prove the trailer on H3's own audio first; a custom
// layer (probably ElevenLabs) gets designed after that, against this cut. Cuts are frame-exact from rounded cumulative times.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n: string) => { const i = argv.indexOf(n); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dry = flag("--dry");
const editArg = opt("--edit") ?? "edit.json";
const [W, H] = (opt("--size") ?? "1920x1080").split("x").map(Number);
const fps = Number(opt("--fps") ?? 24);
const [dir, outArg] = argv;
if (!dir || !outArg) { console.error("usage: cut.mts <folder> <out.mp4> [--edit edit.json] [--dry]"); process.exit(2); }

const clip = path.join(path.resolve(dir), "music-clip");
const out = path.resolve(outArg);
type Scene = { id?: string; in?: number; out?: number; rate?: number; gainDb?: number; fadeIn?: number; fadeOut?: number; dir?: string; black?: number };
const scenes = (JSON.parse(fs.readFileSync(path.join(clip, editArg), "utf8")) as { scenes: Scene[] }).scenes;

const ff = (args: string[]) => spawnSync("ffprobe", ["-v", "error", ...args], { encoding: "utf8" }).stdout.trim();
const duration = (f: string) => Number(ff(["-show_entries", "format=duration", "-of", "csv=p=0", f]));
const hasAudio = (f: string) => ff(["-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", f]) !== "";
function meanDb(f: string): string {
  const e = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return e.match(/mean_volume: (-?[\d.]+|-inf) dB/)?.[1] ?? "?";
}

const F = (t: number) => Math.round(t * fps);
let clock = 0, input = 0;
const inputs: string[] = [];
const v: string[] = [], a: string[] = [];
let blacks = 0;
const errors: string[] = [];

scenes.forEach((s, i) => {
  if (s.black != null) {
    if (!(s.black > 0)) errors.push(`scene ${i}: black must be positive`);
    const n = F(clock + s.black) - F(clock), span = n / fps;
    v.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${span.toFixed(6)},setsar=1,format=yuv420p,trim=end_frame=${n},setpts=PTS-STARTPTS[v${i}]`);
    a.push(`anullsrc=r=48000:cl=stereo,atrim=end=${span.toFixed(6)},asetpts=PTS-STARTPTS[a${i}]`);
    blacks++;
    console.log(`${String(i).padStart(2)} black ${(F(clock) / fps).toFixed(2)}s +${span.toFixed(2)}s  silence`);
    clock += s.black;
    return;
  }
  const f = path.join(clip, "clips", s.dir ?? "", `${s.id}.mp4`);
  if (!s.id || !fs.existsSync(f)) { errors.push(`scene ${i}: no clip ${f}`); return; }
  const len = duration(f), from = s.in ?? 0, to = Math.min(len, s.out ?? len), rate = s.rate ?? 1;
  if (!(to > from)) { errors.push(`${s.id}: window ${from}-${to} is empty (clip runs ${len.toFixed(2)} s)`); return; }
  if (rate < 0.5 || rate > 2) { errors.push(`${s.id}: rate ${rate} is outside what atempo holds in one pass (0.5-2)`); return; }
  const seconds = (to - from) / rate;
  const n = F(clock + seconds) - F(clock), span = n / fps;
  const k = input++;
  inputs.push("-i", f);
  v.push(`[${k}:v]trim=start=${from}:end=${to},setpts=(PTS-STARTPTS)/${rate},fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop=${n},trim=end_frame=${n},setpts=PTS-STARTPTS[v${i}]`);
  // A short fade at each edge even where none is asked: butted waveforms click at a cut.
  const fin = Math.max(s.fadeIn ?? 0, 0.008), fout = Math.max(s.fadeOut ?? 0, 0.008);
  const tempo = rate === 1 ? "" : `atempo=${rate},`;
  const src = hasAudio(f) ? `[${k}:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,${tempo}aresample=48000,aformat=channel_layouts=stereo,` : "anullsrc=r=48000:cl=stereo,";
  a.push(`${src}volume=${s.gainDb ?? 0}dB,apad,atrim=end=${span.toFixed(6)},afade=t=in:d=${fin},afade=t=out:st=${Math.max(0, span - fout).toFixed(6)}:d=${fout},asetpts=PTS-STARTPTS[a${i}]`);
  console.log(`${String(i).padStart(2)} ${s.id} ${(F(clock) / fps).toFixed(2)}s +${span.toFixed(2)}s  src ${from.toFixed(2)}-${to.toFixed(2)}${rate !== 1 ? ` x${rate}` : ""}  mean ${dry ? meanDb(f) : "-"} dB  gain ${s.gainDb ?? 0}`);
  clock += seconds;
});
if (errors.length) { console.error(errors.join("\n")); process.exit(2); }
const total = F(clock) / fps;
console.log(`total ${total.toFixed(2)} s, ${scenes.length} scenes, ${blacks} black, native sound`);
if (dry) process.exit(0);

const refs = scenes.map((_, i) => `[v${i}][a${i}]`).join("");
const graph = `${[...v, ...a].join(";")};${refs}concat=n=${scenes.length}:v=1:a=1[v][mix];[mix]alimiter=limit=0.89[a]`;
const gf = out + ".graph.txt";
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(gf, graph);
const r = spawnSync("ffmpeg", ["-v", "error", "-stats", "-y", ...inputs,
  "-/filter_complex", gf, "-map", "[v]", "-map", "[a]", "-t", String(total),
  "-c:v", "h264_nvenc", "-preset", "p5", "-cq", "19", "-pix_fmt", "yuv420p", "-r", String(fps),
  "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-movflags", "+faststart", out], { stdio: "inherit" });
fs.rmSync(gf, { force: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${out}: ${duration(out).toFixed(2)} s, ${(fs.statSync(out).size / 1e6).toFixed(0)} MB`);
