import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// THE SCOUT TESTS' WORLD - imported FIRST by every scout-* test: every root a
// scout night touches is a temp directory before anything under lib/ is imported
// (extract's EXTRACT_ROOT is read when its module loads), so no test writes
// foundry-out/ or pipeline/foundry/styles.json. Every tool is a stub and every
// fetch a fake: nothing here reaches a network, a binary or a vendor.

export const ROOT = mkdtempSync(path.join(os.tmpdir(), "gt-scout-"));
process.env["SCOUT_STORE_DIR"] = path.join(ROOT, "scout");
process.env["SCOUT_CHANNELS_DIR"] = path.join(ROOT, "scout-channels");
process.env["EXTRACT_STORE_DIR"] = path.join(ROOT, "extract");
process.env["FOUNDRY_DIR"] = path.join(ROOT, "catalogue");
process.env["GRAVITONE_STORE_PATH"] = path.join(ROOT, "kernel.sqlite");
// `open` writes the registry digest; pointed at nothing, it reads no registry and logs no consult
// into the checkout's .ai/consults.jsonl (the manifest's ../ai-registry exists beside a main checkout).
process.env["AI_REGISTRY_DIR"] = path.join(ROOT, "no-registry");
mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }), "utf8");

export function disposeRoot(): void {
  rmSync(ROOT, { recursive: true, force: true });
}

/** A JPEG as far as a header reader can tell (SOF0, 64x48): what the stub ffmpeg "writes". */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);

/** A PNG header of the given size: enough for imageDims and the sniff. */
export function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** A public address for every host: safeFetch's checks run, and pass, offline. */
export const resolve = async (): Promise<{ address: string }[]> => [{ address: "93.184.216.34" }];

const W = 160;
const H = 90;
function noise(seed: number): Buffer {
  const b = Buffer.alloc(W * H);
  let x = seed;
  for (let i = 0; i < b.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x & 0xff;
  }
  return b;
}
/** The five cuts the stub finds: a shot, a fade, the shot again, a dissolve's smear, a second shot. */
export const FRAMES = [
  { at: 1.0, px: noise(7) },
  { at: 2.5, px: Buffer.alloc(W * H, 128) },
  { at: 4.0, px: noise(7) },
  { at: 6.2, px: Buffer.from(Array.from({ length: W * H }, (_, i) => Math.floor(((i % W) * 255) / (W - 1)))) },
  { at: 9.75, px: noise(99) },
];

export type Call = { readonly bin: string; readonly args: readonly string[] };
type SpawnResult = { ok: true; stdout: Buffer; stderr: string } | { ok: false; error: string };

/**
 * yt-dlp, ffprobe and ffmpeg as the ingest engine calls them, answered from FRAMES.
 * `fail` names a tool that exits non-zero with `stderr` as its last line.
 */
export function stubTools(o: { readonly durationS?: number; readonly fail?: "yt-dlp" | "ffmpeg" | "ffprobe"; readonly stderr?: string } = {}) {
  const calls: Call[] = [];
  const duration = o.durationS ?? 95.5;
  const spawn = async (bin: string, args: readonly string[]): Promise<SpawnResult> => {
    calls.push({ bin, args });
    if (o.fail === bin) return { ok: false, error: o.stderr ?? `${bin} failed` };
    if (args.includes("--version") || args.includes("-version")) return { ok: true, stdout: Buffer.from(`${bin} version 9.9
`), stderr: "" };
    if (bin === "yt-dlp") {
      if (args.includes("--skip-download")) return { ok: true, stdout: Buffer.from(`${duration}\n`), stderr: "" };
      // A stub never writes where the engine did not point it: no `-o`, no file (2026-10-22 a stray
      // abc123.mp4 landed in the checkout's root from a call that carried none).
      if (!args.includes("-o")) return { ok: false, error: "yt-dlp stub: no -o template" };
      const tmpl = args[args.indexOf("-o") + 1] ?? "";
      const file = path.join(path.dirname(tmpl), "abc123.mp4");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "not really a video");
      return { ok: true, stdout: Buffer.from(`${file}\n`), stderr: "" };
    }
    if (bin === "ffprobe") return { ok: true, stdout: Buffer.from(`${duration}\n`), stderr: "" };
    if (bin === "ffmpeg" && args.includes("rawvideo")) return { ok: true, stdout: Buffer.concat(FRAMES.map((f) => f.px)), stderr: "" };
    if (bin === "ffmpeg") {
      const pattern = args[args.length - 1] ?? "";
      if (!pattern.includes("%05d") || !path.isAbsolute(pattern)) return { ok: false, error: `ffmpeg stub: not a frame pattern: ${pattern}` };
      FRAMES.forEach((_, i) => writeFileSync(pattern.replace("%05d", String(i + 1).padStart(5, "0")), JPEG));
      const stderr = FRAMES.map((f, i) => `[Parsed_showinfo_1 @ 0000] n:${i} pts:${f.at * 1000} pts_time:${f.at} duration:1`).join("\n");
      return { ok: true, stdout: Buffer.alloc(0), stderr };
    }
    if (args.includes("--version") || args.includes("-version")) return { ok: true, stdout: Buffer.from(`${bin} version 9.9\n`), stderr: "" };
    return { ok: false, error: `unexpected ${bin}` };
  };
  return { calls, spawn, deps: { spawn, bins: { ytdlp: "yt-dlp", ffmpeg: "ffmpeg", ffprobe: "ffprobe" }, resolve } };
}

/** The web as a map of URL -> body; anything else is a 404. Installed over globalThis.fetch. */
export function fakeWeb(pages: Readonly<Record<string, { body: Buffer | string; type: string }>>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const p = pages[url];
    if (p === undefined) return new Response("gone", { status: 404 });
    return new Response(typeof p.body === "string" ? p.body : new Uint8Array(p.body), { status: 200, headers: { "content-type": p.type } });
  }) as typeof fetch;
}
