// STYLE CONTRACT - hold /kit to the approved prototype's pixels (plan §6 Phase 1 exit, §9.6.1).
//
//   node pipeline/style-contract.mts                    capture every page, then check /kit
//   node pipeline/style-contract.mts --check-only       check against the committed contracts
//   node pipeline/style-contract.mts --page floor ...   only the named pages (repeatable)
//   node pipeline/style-contract.mts --app http://localhost:3184
//                                                       use a running app instead of starting one
//
// The measuring instrument is the contest skill's style-contract.py (ai-registry,
// skills/contest/scripts): `capture` reads the computed style of every named ROLE on the
// winner, `check` reads the same roles on the port and prints every property that moved past
// its tolerance. It takes one URL per run, so the roles live one file per prototype page,
// docs/next/style-contract/roles.<page>.json, each carrying its own `page` block: the winner's
// path under docs/next/prototype/, the port's path, and the interaction each side needs before
// measuring (`drive` on the prototype, `portDrive` on the app - the Board's toast only exists
// after an act, and the two sides reach it through different controls). The Python tool reads
// only `roles` and ignores the rest.
//
// What this script owns, and nothing more: serving the prototype as static files (its pages
// load ../data/, so the server root is docs/next/prototype, not app/), regenerating that
// gitignored data when it is missing, starting `next dev` when no app was named, and turning
// seven verdicts into one exit code. It never edits the Python tool - a role that needs an
// interaction is driven from here.
//
// `next dev` appends its dist dir's types to tsconfig.json's `include`; the lines it added are
// removed on the way out, and the dist dir with them, so a run leaves the tree as it found it.
//
// EXIT 0 every page held its contract · 1 a deviation or a missing role · 2 could not run
// (no roles files, no python, no tool, a server that never answered).

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { errorMessage } from "@gt/domain/errors";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/next/style-contract");
const PROTOTYPE = path.join(ROOT, "docs/next/prototype");
const TOOL = process.env.STYLE_CONTRACT_TOOL ?? path.resolve(ROOT, "../ai-registry/skills/contest/scripts/style-contract.py");
const PYTHON = process.env.PYTHON ?? "python";
const PROTO_PORT = Number(process.env.STYLE_CONTRACT_PROTO_PORT ?? 3194);
const APP_PORT = Number(process.env.STYLE_CONTRACT_APP_PORT ?? 3184);
const DIST = ".next-style-contract";
const WIDTH = "1440x900";

type PageSpec = { winner: string; port: string; drive: string[]; portDrive: string[] };
type Verdict = { page: string; status: number; tail: string };

class CouldNotRun extends Error {}

function args(argv: readonly string[]): { checkOnly: boolean; pages: string[]; app: string | null } {
  const pages: string[] = [];
  let checkOnly = false;
  let app: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check-only") checkOnly = true;
    else if (a === "--page") pages.push(argv[++i] ?? "");
    else if (a === "--app") app = argv[++i] ?? null;
    else throw new CouldNotRun(`unknown argument ${a}`);
  }
  return { checkOnly, pages, app };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function readPage(file: string): PageSpec {
  const doc: unknown = JSON.parse(readFileSync(file, "utf8"));
  const page = typeof doc === "object" && doc !== null && "page" in doc ? doc.page : null;
  if (typeof page !== "object" || page === null || !("winner" in page) || typeof page.winner !== "string") {
    throw new CouldNotRun(`${path.relative(ROOT, file)}: no page.winner`);
  }
  const port = "port" in page && typeof page.port === "string" ? page.port : "/kit";
  return {
    winner: page.winner,
    port,
    drive: strings("drive" in page ? page.drive : []),
    portDrive: strings("portDrive" in page ? page.portDrive : []),
  };
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
};

// The prototype as the owner opened it: plain files, no build, no rewriting.
function serveStatic(root: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const size = statSync(file).size;
    // Media elements ask for byte ranges and hold a 200 stream open while paused, which keeps
    // the page from ever reaching network-idle; answering the range lets them settle.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range !== null) {
      const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
      const end = range[1] !== "" && range[2] !== "" ? Math.min(size - 1, Number(range[2])) : size - 1;
      res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function answers(url: string, seconds: number): Promise<boolean> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.ok) return true;
    } catch {
      // not up yet: the loop is the retry, and the deadline is the failure
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function startApp(port: number): ChildProcess {
  return spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_PUBLIC_DEV_AUTH: "1", NEXT_DIST_DIR: DIST },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}

function stopApp(app: ChildProcess): void {
  if (app.pid === undefined) return;
  // npx under a shell is a tree on Windows; killing the shell alone leaves next running.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else app.kill("SIGTERM");
}

const TSCONFIG = path.join(ROOT, "tsconfig.json");

// Undo what `next dev` did to the tree: its include lines in tsconfig.json and its dist dir.
// Next rewrites the whole file (and its final line ending), so when nothing but our lines
// changed, the text read before the run goes back byte for byte; when another session edited
// the file meanwhile, only our lines come out and its edit stands.
function tidy(before: string): void {
  const lines = readFileSync(TSCONFIG, "utf8").split("\n");
  const kept: string[] = [];
  for (const l of lines) {
    if (l.includes(`"${DIST}/`)) continue;
    // The entry before a removed tail keeps a comma that now precedes `]`: drop that one.
    if (/^\s*\]/.test(l) && kept.length > 0) kept[kept.length - 1] = (kept[kept.length - 1] ?? "").replace(/,(\s*)$/, "$1");
    kept.push(l);
  }
  const norm = (s: string): string => s.replace(/\r\n/g, "\n").trimEnd();
  const now = kept.join("\n");
  if (norm(now) === norm(before)) writeFileSync(TSCONFIG, before);
  else if (kept.length !== lines.length) writeFileSync(TSCONFIG, now);
  rmSync(path.join(ROOT, DIST), { recursive: true, force: true });
}

// Asynchronous on purpose: the prototype's server lives in this process, and a synchronous
// child would starve it - the browser would wait on a server that cannot answer.
function tool(mode: "capture" | "check", url: string, roles: string, contract: string, drive: readonly string[]): Promise<Verdict> {
  const child = spawn(PYTHON, [TOOL, mode, url, roles, contract, "--width", WIDTH, ...drive.map((d) => `--drive=${d}`)], {
    cwd: ROOT,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  let out = "";
  child.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
  child.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
  return new Promise((resolve) => {
    child.on("close", (code) => resolve({ page: path.basename(roles), status: code ?? 2, tail: out.trimEnd() }));
    child.on("error", (e) => resolve({ page: path.basename(roles), status: 2, tail: e.message }));
  });
}

// ONE EQUIVALENCE THE INSTRUMENT DOES NOT KNOW. style-contract.py compares a colour as a
// string, and Chrome serialises the same sRGB colour two ways: a literal computes to
// `rgba(103, 232, 249, 0.32)`, while `color-mix()` and relative colour - how @gt/ui derives a
// tone's border from its hue (ADMISSION.md rejects per-hue literal roles) - compute to
// `color(srgb 0.403922 0.909804 0.976471 / 0.32)`. Same pixel, two strings, one false
// deviation per derived colour. A row is set aside here only when BOTH sides parse as sRGB
// and agree on every 8-bit channel within 1/255; it is printed, never hidden, and every other
// row stands. The fix belongs in the tool's differs() - reported to the registry.
function rgba8(v: string): readonly number[] | null {
  const lit = /^rgba?\(([^)]*)\)$/.exec(v.trim());
  if (lit !== null) {
    const n = (lit[1] ?? "").split(",").map((x) => Number(x.trim()));
    if (n.length < 3 || n.some((x) => Number.isNaN(x))) return null;
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, (n[3] ?? 1) * 255].map(Math.round);
  }
  const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(v.trim());
  if (srgb === null) return null;
  return [srgb[1], srgb[2], srgb[3], srgb[4] ?? "1"].map((x) => Math.round(Number(x) * 255));
}

function sameColour(a: string, b: string): boolean {
  const x = rgba8(a);
  const y = rgba8(b);
  return x !== null && y !== null && x.every((c, i) => Math.abs(c - (y[i] ?? -9)) <= 1);
}

type Adjudged = { real: string[]; notation: string[]; missing: number; counted: number };

// The table style-contract.py prints: role (at least 14 wide), property (20), winner (34), port.
function adjudge(out: string): Adjudged {
  const lines = out.split(/\r?\n/);
  const head = lines.findIndex((l) => /^role\s+property\s+winner\s+port$/.test(l));
  const real: string[] = [];
  const notation: string[] = [];
  for (const l of head < 0 ? [] : lines.slice(head + 1)) {
    if (l.trim() === "" || l.startsWith("  accepted by the owner")) break;
    const role = l.split(" ")[0] ?? "";
    const rest = l.slice(Math.max(14, role.length) + 1);
    (sameColour(rest.slice(21, 55).trim(), rest.slice(56).trim()) ? notation : real).push(l);
  }
  return {
    real,
    notation,
    missing: lines.filter((l) => l.startsWith("  MISSING ")).length,
    counted: Number(/^(\d+) deviation\(s\) from the winner's contract across \d+ role\(s\)$/.exec(lines.at(-1) ?? "")?.[1] ?? Number.NaN),
  };
}

async function main(): Promise<number> {
  const opt = args(process.argv.slice(2));
  if (!existsSync(TOOL)) throw new CouldNotRun(`no style-contract.py at ${TOOL} (set STYLE_CONTRACT_TOOL)`);
  if (spawnSync(PYTHON, ["-c", "import playwright"], { stdio: "ignore" }).status !== 0) {
    throw new CouldNotRun(`${PYTHON} cannot import playwright (pip install playwright && playwright install chromium)`);
  }
  const files = readdirSync(DIR).filter((f) => /^roles\.[\w-]+\.json$/.test(f)).sort();
  const pages = files.map((f) => f.slice("roles.".length, -".json".length)).filter((p) => opt.pages.length === 0 || opt.pages.includes(p));
  if (pages.length === 0) throw new CouldNotRun(`no roles.<page>.json under ${path.relative(ROOT, DIR)} matched`);

  if (!existsSync(path.join(PROTOTYPE, "data/gravitone.js"))) {
    console.log("style-contract: the prototype's data/ is missing - regenerating it");
    const r = spawnSync(process.execPath, [path.join(PROTOTYPE, "tools/rebuild-data.mts")], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new CouldNotRun("rebuild-data.mts failed; the prototype pages cannot render without data/");
  }

  const proto = await serveStatic(PROTOTYPE, PROTO_PORT);
  const tsBefore = readFileSync(TSCONFIG, "utf8");
  const app = opt.app === null ? startApp(APP_PORT) : null;
  const appBase = opt.app ?? `http://localhost:${APP_PORT}`;
  try {
    if (!(await answers(`${appBase}/kit`, 240))) throw new CouldNotRun(`${appBase}/kit never answered`);
    const verdicts: Verdict[] = [];
    for (const p of pages) {
      const roles = path.join(DIR, `roles.${p}.json`);
      const contract = path.join(DIR, `contract.${p}.json`);
      const spec = readPage(roles);
      if (!opt.checkOnly) {
        const cap = await tool("capture", `http://127.0.0.1:${PROTO_PORT}/${spec.winner}`, roles, contract, spec.drive);
        console.log(`\n== ${p} · capture  ${spec.winner}\n${cap.tail}`);
        if (cap.status !== 0) throw new CouldNotRun(`capture of ${p} failed`);
        if (/NOT FOUND on the winner/.test(cap.tail)) verdicts.push({ page: p, status: 1, tail: "a winner selector matched nothing" });
      }
      if (!existsSync(contract)) throw new CouldNotRun(`no ${path.relative(ROOT, contract)} - run without --check-only first`);
      const chk = await tool("check", `${appBase}${spec.port}`, roles, contract, spec.portDrive);
      console.log(`\n== ${p} · check    ${spec.port}\n${chk.tail}`);
      const a = adjudge(chk.tail);
      if (Number.isNaN(a.counted)) throw new CouldNotRun(`check of ${p} did not finish`);
      // The tool's own count must equal what was read here, or this parse is the defect.
      const read = a.real.length + a.notation.length + a.missing;
      if (a.counted !== read) throw new CouldNotRun(`check of ${p}: the tool counted ${a.counted}, the table read ${read}`);
      if (a.notation.length > 0) console.log(`  ${a.notation.length} row(s) above are one sRGB colour in two notations (rgba vs color(srgb)) - not counted`);
      const n = a.real.length + a.missing;
      verdicts.push({ page: p, status: n === 0 ? 0 : 1, tail: `${n} deviation(s), ${a.notation.length} notation-only` });
    }
    console.log("\nstyle-contract:");
    for (const v of verdicts) console.log(`  ${v.status === 0 ? "held " : "MOVED"}  ${v.page.padEnd(10)} ${v.tail}`);
    const bad = verdicts.filter((v) => v.status !== 0).length;
    console.log(`${pages.length} page(s) walked, ${bad} with deviations`);
    return bad === 0 ? 0 : 1;
  } finally {
    proto.close();
    if (app !== null) {
      stopApp(app);
      tidy(tsBefore);
    }
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`style-contract: ${errorMessage(e)}`);
    process.exit(2);
  },
);
