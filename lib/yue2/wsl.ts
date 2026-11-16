import "server-only";

import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";

import { canSpawnLocalBinaries, describePosture } from "../deployment.ts";
import { collect, lastLine, LAUNCH_SCRIPT, realKillTree, realSpawn, stderrTail, type SpawnSeams } from "./wslSpawn.ts";

// THE SONG LAB'S ENGINE DOOR (spark yue2-song-lab, WP1). The YuE2 scripts (pipeline/yue2/*.py) run inside
// WSL in two venvs (generation; scoring + post). docs/yue2.md is the operator's page.
//
// THE SPAWN, measured 2026-11-04 on this box: `wsl.exe -d <distro> -- cmd args` hands the command line
// to the distro's login SHELL (an argument `q"x y` died with bash's "unexpected EOF"), so the door uses
// `--exec`, which runs the program directly: each element of the array arrives as one argv element,
// spaces, quotes, `$HOME`, `;|&` and `*` included. One thing wsl.exe still rewrites: a backslash in an
// unquoted argument is dropped (`back\slash` arrived as `backslash`), so an argument with a backslash is
// refused as `invalid` - paths go through toWslPath, and the scripts read text from files, not argv.
//
//   wsl.exe -d <distro> --exec setsid -w sh -c <LAUNCH_SCRIPT> yue2 [env YUE2_HOME=<h>] <python> <script> <args...>
//
// The launcher prints the Linux pid first so a stop kills the Linux group too (./wslSpawn.ts says why).
// The scripts speak the audio sidecar's contract: the LAST stdout line is JSON, `{ok:true,...}` or
// `{ok:false,error,kind}`; `refused` maps to `invalid`, the other kinds to `unavailable`
// (lib/audio/sidecar.ts). A run that answered no JSON is reported with its exit, the last three lines of
// stderr and, when the doctor finds a missing piece, the one command that fixes it.
// Env: YUE2_WSL_DISTRO (default Ubuntu), YUE2_HOME (a WSL path, default <WSL $HOME>/yue2-lab),
// YUE2_PY_GEN / YUE2_PY_EVAL (the two venv pythons, default <home>/.venv and <home>/.venv-eval).

/** The scripts the door can run, and which venv runs each. */
export const YUE2_OPS = ["doctor", "gen", "score", "post"] as const;
export type Yue2Op = (typeof YUE2_OPS)[number];

export type Yue2RunOptions = {
  readonly timeoutMs: number;
  /** Aborting kills the whole process tree inside and outside WSL. */
  readonly signal?: AbortSignal;
};

/** The script's last-line JSON on success; its own shape per op (pipeline/yue2 docs). */
export type Yue2Answer = { readonly ok: true; readonly [k: string]: unknown };

/** What `doctor` reports; every field false/absent is a reason the lab cannot run here. */
export type Yue2Doctor = {
  /** wsl.exe answered AND lists the distro. */
  readonly wsl: boolean;
  readonly distro: string;
  readonly genVenv: boolean;
  readonly evalVenv: boolean;
  /** The first line of `nvidia-smi -L` inside WSL. */
  readonly gpu?: string;
  readonly ffmpeg: boolean;
  /** The one command that would fix the first missing piece. */
  readonly hint?: string;
};

/** The seams a test replaces; production uses defaultDeps(). */
export type Yue2Deps = SpawnSeams & {
  readonly canSpawn: () => boolean;
  /** The posture's own sentence when `canSpawn` says no (lib/deployment describePosture). */
  readonly posture: () => string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The repo root on the Windows side (pipeline/yue2 lives under it). */
  readonly repoRoot: string;
};

const DOCTOR_STEP_MS = 30_000;

export function defaultDeps(): Yue2Deps {
  return { spawn: realSpawn, killTree: realKillTree, canSpawn: canSpawnLocalBinaries, posture: () => describePosture(), env: process.env, repoRoot: process.cwd() };
}

/** Run one lab script in WSL. Refused when local binaries are off (lib/deployment canSpawnLocalBinaries). */
export async function runYue2(op: Yue2Op, args: readonly string[], options: Yue2RunOptions): Promise<Result<Yue2Answer>> {
  return runYue2With(defaultDeps(), op, args, options);
}

/** Probe WSL, both venvs, the GPU and ffmpeg. Never throws; an unreachable WSL is `wsl: false`. */
export async function yue2Doctor(): Promise<Result<Yue2Doctor>> {
  return yue2DoctorWith(defaultDeps());
}

/** A Windows path as the WSL side sees it (C:\x\y -> /mnt/c/x/y). Pure. */
export function toWslPath(windowsPath: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!m) return windowsPath.replace(/\\/g, "/");
  return `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, "/")}`;
}

const distroOf = (deps: Yue2Deps): string => deps.env["YUE2_WSL_DISTRO"]?.trim() || "Ubuntu";
const set = (v: string | undefined): string | undefined => (v === undefined || v.trim() === "" ? undefined : v.trim());

/** WSL's $HOME per distro, read once (`printenv HOME`) and cached for the process. */
const homeCache = new Map<string, string>();

async function wslHome(deps: Yue2Deps, distro: string): Promise<string | undefined> {
  const cached = homeCache.get(distro);
  if (cached !== undefined) return cached;
  const r = await collect(deps, "wsl.exe", ["-d", distro, "--exec", "printenv", "HOME"], { timeoutMs: DOCTOR_STEP_MS });
  const home = lastLine(r.stdout);
  if (r.code !== 0 || !home.startsWith("/")) return undefined;
  homeCache.set(distro, home);
  return home;
}

/** Forget the cached WSL $HOME (tests; a distro reinstalled under another user). */
export function forgetWslHome(): void {
  homeCache.clear();
}

export type Yue2Layout = { readonly home: string; readonly homeSet: boolean; readonly genPy: string; readonly evalPy: string };

function layout(deps: Yue2Deps, wslHomeDir: string): Yue2Layout {
  const homeEnv = set(deps.env["YUE2_HOME"]);
  const home = homeEnv ?? `${wslHomeDir}/yue2-lab`;
  return {
    home,
    homeSet: homeEnv !== undefined,
    genPy: set(deps.env["YUE2_PY_GEN"]) ?? `${home}/.venv/bin/python`,
    evalPy: set(deps.env["YUE2_PY_EVAL"]) ?? `${home}/.venv-eval/bin/python`,
  };
}

/** The full wsl.exe argument array of one op (exported for the tests: this IS the contract's spawn). */
export function yue2Argv(distro: string, lay: Yue2Layout, script: string, args: readonly string[], python: string): string[] {
  const env = lay.homeSet ? ["env", `YUE2_HOME=${lay.home}`] : [];
  return ["-d", distro, "--exec", "setsid", "-w", "sh", "-c", LAUNCH_SCRIPT, "yue2", ...env, python, script, ...args];
}

export async function runYue2With(deps: Yue2Deps, op: Yue2Op, args: readonly string[], options: Yue2RunOptions): Promise<Result<Yue2Answer>> {
  if (!deps.canSpawn()) return err("unavailable", `yue2 ${op}: ${deps.posture()}`);
  if (op === "doctor") {
    const d = await yue2DoctorWith(deps);
    return d.ok ? ok({ ok: true, ...d.value }) : d;
  }
  const bad = args.find((a) => a.includes("\\") || a.includes("\0"));
  if (bad !== undefined) return err("invalid", `yue2 ${op}: the argument ${JSON.stringify(bad)} carries a backslash or NUL, which wsl.exe rewrites; pass WSL paths (toWslPath)`);
  if (options.signal?.aborted === true) return err("unavailable", `yue2 ${op}: aborted before it started`);
  const distro = distroOf(deps);
  const needHome = set(deps.env["YUE2_HOME"]) === undefined && set(deps.env[op === "gen" ? "YUE2_PY_GEN" : "YUE2_PY_EVAL"]) === undefined;
  const home = needHome ? await wslHome(deps, distro) : "";
  if (home === undefined) return withDoctor(deps, op, `could not read $HOME in WSL distro ${distro}`);
  const lay = layout(deps, home);
  const script = toWslPath(path.join(deps.repoRoot, "pipeline", "yue2", `${op}.py`));
  const python = op === "gen" ? lay.genPy : lay.evalPy;
  const r = await collect(deps, "wsl.exe", yue2Argv(distro, lay, script, args, python), { timeoutMs: options.timeoutMs, distro, ...(options.signal ? { signal: options.signal } : {}) });
  const said = stderrTail(r.stderr);
  if (r.error !== undefined) return withDoctor(deps, op, `wsl.exe could not start: ${r.error}`);
  const killed = r.linuxPid === undefined ? "the WSL relay was killed" : `WSL process group ${r.linuxPid} and its relay were killed`;
  if (r.timedOut) return err("unavailable", `yue2 ${op} did not finish in ${Math.round(options.timeoutMs / 1000)} s; ${killed}${said === "" ? "" : `: ${said}`}`);
  if (r.aborted) return err("unavailable", `yue2 ${op} was aborted; ${killed}`);
  return readAnswer(deps, op, r.code, lastLine(r.stdout), said);
}

/** The last stdout line under the sidecar's rules: a failure JSON keeps its sentence and kind. */
async function readAnswer(deps: Yue2Deps, op: Yue2Op, code: number | null, line: string, said: string): Promise<Result<Yue2Answer>> {
  const doc = parseLine(line);
  if (doc !== undefined && doc["ok"] === false && typeof doc["error"] === "string") {
    return err(doc["kind"] === "refused" ? "invalid" : "unavailable", `yue2 ${op}: ${doc["error"]}`);
  }
  if (doc !== undefined && doc["ok"] === true && code === 0) return ok(doc as Yue2Answer);
  const why = doc === undefined ? (line === "" ? "no answer" : `no JSON answer (last line: ${line.slice(0, 160)})`) : "an answer that contradicts its exit";
  return withDoctor(deps, op, `exited ${String(code)} with ${why}${said === "" ? "" : `: ${said}`}`);
}

function parseLine(line: string): Record<string, unknown> | undefined {
  if (!line.startsWith("{")) return undefined;
  try {
    const v: unknown = JSON.parse(line);
    return typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as { ok?: unknown }).ok === "boolean" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** An answerless failure: ask the doctor for the missing piece and its fix. */
async function withDoctor(deps: Yue2Deps, op: Yue2Op, reason: string): Promise<Result<Yue2Answer>> {
  const d = await yue2DoctorWith(deps);
  const fix = d.ok && d.value.hint !== undefined ? `; ${missingOf(d.value)}; fix: ${d.value.hint}` : "";
  return err("unavailable", `yue2 ${op}: ${reason}${fix}`);
}

function missingOf(d: Yue2Doctor): string {
  if (!d.wsl) return `WSL distro ${d.distro} is not reachable`;
  if (!d.genVenv) return "the generation venv is missing";
  if (!d.evalVenv) return "the scoring venv is missing";
  if (d.gpu === undefined) return "no GPU is visible inside WSL";
  return "ffmpeg is missing in the scoring venv";
}

/** The doctor's in-WSL probe: a constant script; the three overrides arrive as $1..$3 (empty = default). */
const PROBE_SCRIPT = [
  'h=${1:-$HOME/yue2-lab}; gp=${2:-$h/.venv/bin/python}; ep=${3:-$h/.venv-eval/bin/python}',
  'echo "home=$HOME"',
  '[ -x "$gp" ] && echo gen=1 || echo gen=0',
  '[ -x "$ep" ] && echo eval=1 || echo eval=0',
  'n=$(command -v nvidia-smi || echo /usr/lib/wsl/lib/nvidia-smi); g=$("$n" -L 2>/dev/null | head -n 1); [ -n "$g" ] && echo "gpu=$g"',
  'f=$h/.eval-bin/ffmpeg; [ -x "$f" ] || f=$("$ep" -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())" 2>/dev/null)',
  '[ -n "$f" ] && "$f" -version >/dev/null 2>&1 && echo "ffmpeg=$f"',
  "exit 0",
].join("\n");

export async function yue2DoctorWith(deps: Yue2Deps): Promise<Result<Yue2Doctor>> {
  if (!deps.canSpawn()) return err("unavailable", `yue2 doctor: ${deps.posture()}`);
  const distro = distroOf(deps);
  const base = { distro, genVenv: false, evalVenv: false, ffmpeg: false } as const;
  const list = await collect(deps, "wsl.exe", ["-l", "-q"], { timeoutMs: DOCTOR_STEP_MS });
  if (list.error !== undefined || list.code !== 0) return ok({ ...base, wsl: false, hint: "wsl --install" });
  const names = list.stdout.replace(/\0/g, "").split(/\r?\n/).map((s) => s.trim().toLowerCase());
  if (!names.includes(distro.toLowerCase())) return ok({ ...base, wsl: false, hint: `wsl --install -d ${distro}` });
  const probe = await collect(deps, "wsl.exe", ["-d", distro, "--exec", "sh", "-c", PROBE_SCRIPT, "yue2-doctor", deps.env["YUE2_HOME"] ?? "", deps.env["YUE2_PY_GEN"] ?? "", deps.env["YUE2_PY_EVAL"] ?? ""], { timeoutMs: DOCTOR_STEP_MS });
  const kv = new Map<string, string>();
  for (const line of probe.stdout.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const home = kv.get("home");
  if (probe.code !== 0 || home === undefined) return ok({ ...base, wsl: false, hint: `wsl --install -d ${distro}` });
  homeCache.set(distro, home);
  const gpu = kv.get("gpu");
  const found = { ...base, wsl: true, genVenv: kv.get("gen") === "1", evalVenv: kv.get("eval") === "1", ffmpeg: kv.has("ffmpeg"), ...(gpu ? { gpu } : {}) };
  const hint = hintFor(deps, distro, found);
  return ok(hint === undefined ? found : { ...found, hint });
}

const quoted = (s: string): string => (/\s/.test(s) ? `"${s}"` : s);

function hintFor(deps: Yue2Deps, distro: string, d: Omit<Yue2Doctor, "hint">): string | undefined {
  const homeEnv = set(deps.env["YUE2_HOME"]);
  const install = (which: "gen" | "eval"): string =>
    ["wsl.exe", "-d", distro, "--exec", ...(homeEnv ? ["env", `YUE2_HOME=${homeEnv}`] : []), "bash", quoted(`${toWslPath(deps.repoRoot)}/pipeline/yue2/install-${which}.sh`)].join(" ");
  if (!d.genVenv) return install("gen");
  if (!d.evalVenv) return install("eval");
  if (d.gpu === undefined) return "wsl --update";
  if (!d.ffmpeg) return install("eval");
  return undefined;
}
