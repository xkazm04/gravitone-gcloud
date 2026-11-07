/**
 * The listening page for one track, on this machine only.
 *
 *   node pipeline/track-mirror/server.mts foundry-out/track-mirror/tears [--port 3199]
 *
 * Outside Gravitone on purpose (spark track-mirror, stage 1). A local server rather than a hosted page
 * because the reference is someone else's recording and every YuE2 take here is a cover of it: nothing
 * leaves this box. Verdicts land in <track>/verdicts.json, so a session can read them.
 *
 * A dropped Suno take is saved and measured by the same compare.py as the YuE2 takes.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENV = process.env.TRACK_MIRROR_PYTHON ?? "C:/Users/kazda/ai/tools/track-mirror-venv/Scripts/python.exe";
const track = resolve(process.argv[2] ?? "");
const port = process.argv.includes("--port") ? Number(process.argv[process.argv.indexOf("--port") + 1]) : 3199;
const MAX_UPLOAD = 60_000_000;
const AUDIO_DIRS = ["source", "yue2", "suno"];
const AUDIO_TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".flac": "audio/flac", ".wav": "audio/wav", ".m4a": "audio/mp4" };

if (!existsSync(join(track, "analysis.json"))) {
  console.error(`${track} has no analysis.json`);
  process.exit(2);
}

// The first *-44k.wav in source/ is the reference to measure against; its mp3 sits beside it, same stem.
function sourceStem(): string {
  const wav = readdirSync(join(track, "source")).filter((f) => f.endsWith("-44k.wav")).sort()[0];
  if (!wav) throw new Error(`no *-44k.wav in ${join(track, "source")}`);
  return wav.slice(0, -"-44k.wav".length);
}

function json<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

interface Figures {
  closeness?: number;
  reference_lufs?: number;
  reference_entry_s?: number;
}

function takesIn(folder: string, tool: string, id: string) {
  if (!existsSync(folder)) return [];
  const audio = readdirSync(folder).filter((f) => extname(f) in AUDIO_TYPES && !f.includes("-"));
  return audio
    .map((file) => {
      const stem = file.slice(0, -extname(file).length);
      return {
        id: `${id}/${stem}`,
        tool,
        prompt: id,
        label: stem,
        url: `/audio/${tool}/${id}/${file}`,
        figures: json<Figures | null>(join(folder, `${stem}.figures.json`), null),
      };
    })
    .sort((a, b) => (b.figures?.closeness ?? -1) - (a.figures?.closeness ?? -1));
}

function state(): unknown {
  const analysis = json<{
    duration_s?: number;
    tempo?: { bpm: number };
    key?: { key: string };
    bands?: unknown;
    energy_curve_2s_db?: number[];
    rolloff_hz?: number;
  }>(join(track, "analysis.json"), {});
  const withTakes = (tool: string, file: string) =>
    json<{ prompts: { id: string }[] }>(join(track, file), { prompts: [] }).prompts.map((p) => ({ ...p, takes: takesIn(join(track, tool, p.id), tool, p.id) }));
  const yue2 = withTakes("yue2", "yue2-prompts.json");
  // Every take's figures carry the reference's own, so any one will do.
  const suno = withTakes("suno", "suno-prompts.json");
  const anyFigures = [...yue2, ...suno].flatMap((p) => p.takes).find((t) => t.figures)?.figures ?? ({} as Figures);
  return {
    source: {
      title: basename(track),
      url: `/audio/source/${sourceStem()}.mp3`,
      duration_s: analysis.duration_s,
      bpm: analysis.tempo?.bpm,
      key: analysis.key?.key,
      bands: analysis.bands,
      rolloff_hz: analysis.rolloff_hz,
      energy: analysis.energy_curve_2s_db,
      lufs: anyFigures.reference_lufs,
      entry_s: anyFigures.reference_entry_s,
    },
    suno,
    sunoDefaults: json<{ defaults?: string }>(join(track, "suno-prompts.json"), {}).defaults,
    yue2,
    verdicts: json(join(track, "verdicts.json"), {}),
  };
}

function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        fail(new Error(`upload is past ${limit} bytes`));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => done(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

function saveVerdict(takeId: string, verdict: unknown): void {
  const path = join(track, "verdicts.json");
  const all = json<Record<string, unknown>>(path, {});
  all[takeId] = { ...(verdict as object), at: new Date().toISOString() };
  // Written whole then renamed, so a killed server cannot leave half a verdict file.
  writeFileSync(`${path}.tmp`, JSON.stringify(all, null, 1));
  renameSync(`${path}.tmp`, path);
}

function measure(audio: string, out: string): Promise<string | null> {
  return new Promise((done) => {
    const child = spawn(
      VENV,
      ["-I", join(HERE, "compare.py"), join(track, "analysis.json"), audio, out, "--audio-ref", join(track, "source", `${sourceStem()}-44k.wav`)],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => done(e.message));
    child.on("close", (code) => done(code === 0 ? null : err.slice(-500)));
  });
}

async function uploadTake(req: IncomingMessage, res: ServerResponse, promptId: string, name: string): Promise<void> {
  const ids = json<{ prompts: { id: string }[] }>(join(track, "suno-prompts.json"), { prompts: [] }).prompts.map((p) => p.id);
  if (!ids.includes(promptId)) return send(res, 404, { error: `no prompt ${promptId}` });
  const ext = extname(name).toLowerCase();
  if (!(ext in AUDIO_TYPES)) return send(res, 415, { error: `${ext || "no extension"}: mp3, flac, wav or m4a` });
  const bytes = await body(req, MAX_UPLOAD);
  const folder = join(track, "suno", promptId);
  mkdirSync(folder, { recursive: true });
  const taken = existsSync(folder) ? readdirSync(folder).filter((f) => extname(f) in AUDIO_TYPES).length : 0;
  const stem = `take${taken + 1}`;
  const audio = join(folder, stem + ext);
  writeFileSync(audio, bytes);
  const failure = await measure(audio, join(folder, `${stem}.figures.json`));
  send(res, 200, { id: `${promptId}/${stem}`, measured: failure === null, error: failure });
}

function serveAudio(req: IncomingMessage, res: ServerResponse, rel: string): void {
  const path = resolve(track, rel);
  const inside = AUDIO_DIRS.some((dir) => path.startsWith(join(track, dir) + sep));
  if (!inside || !(extname(path) in AUDIO_TYPES) || !existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const data = readFileSync(path);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  const headers = { "content-type": AUDIO_TYPES[extname(path)], "accept-ranges": "bytes" };
  if (range) {
    const start = Number(range[1] || 0);
    const stop = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${stop}/${data.length}`, "content-length": stop - start + 1 });
    res.end(data.subarray(start, stop + 1));
    return;
  }
  res.writeHead(200, { ...headers, "content-length": data.length });
  res.end(data);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(join(HERE, "page.html")));
    }
    if (req.method === "GET" && url.pathname === "/page.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      return res.end(readFileSync(join(HERE, "page.js")));
    }
    if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, state());
    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      return serveAudio(req, res, decodeURIComponent(url.pathname.slice("/audio/".length)));
    }
    if (req.method === "POST" && url.pathname === "/api/verdict") {
      const { takeId, verdict } = JSON.parse((await body(req, 100_000)).toString("utf8"));
      saveVerdict(String(takeId), verdict);
      return send(res, 200, { ok: true });
    }
    const upload = /^\/api\/suno\/([A-Za-z0-9]+)$/.exec(url.pathname);
    if (req.method === "POST" && upload) return await uploadTake(req, res, upload[1], url.searchParams.get("name") ?? "");
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
