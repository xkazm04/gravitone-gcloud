import "server-only";

import { execFile, spawn, type ChildProcess } from "node:child_process";

// THE WSL DOOR'S PROCESS PLUMBING (spark yue2-song-lab, WP1): one bounded spawn of `wsl.exe` with an
// argument ARRAY and no shell on the Windows side, its stdout/stderr kept as bounded tails, and a kill that
// reaches BOTH sides. ./wsl.ts is the only caller; the seams are injectable so no test needs WSL.
//
// WHY TWO KILLS: `wsl.exe` is only a relay. On this box (WSL2, 2026-11-04) a taskkill of the relay
// also took its Linux tree down - a plain child, one ignoring HUP and TERM, and a setsid'd group alike
// (sp-yue2-scratch/wp1/control*.mjs) - but that is WSL's behaviour, not a contract, and a survivor
// would be a 10 GB model holding the GPU. So the Linux side is ALSO killed by pid: it is launched through `setsid sh -c 'echo "yue2-pid $$"; exec "$@"'`: the first stdout
// line names the Linux pid, which is also the process GROUP id (setsid made it a session leader, and
// `exec` keeps the pid through python's own re-exec). A stop sends `wsl.exe -d <distro> --exec kill -KILL
// -- -<pid>` (the whole group: python, its ffmpeg and nvidia-smi children) AND taskkills the relay. A stop
// that lands before the pid line has arrived waits up to PID_GRACE_MS for it, then kills the relay alone.

/** What is kept of each stream: the answer is one line at the end, the reason the last lines of stderr. */
export const KEEP_BYTES = 64 * 1024;
/** How long a stop waits for the Linux pid line before it kills the Windows relay alone. */
export const PID_GRACE_MS = 2_000;
/** After a stop, how long to wait for `close` before answering anyway. */
const CLOSE_GRACE_MS = 10_000;

/**
 * The Linux-side launcher: a constant script (never built from input), the real command arriving as
 * positional arguments, so `"$@"` hands each one to exec unsplit and unexpanded.
 */
export const LAUNCH_SCRIPT = 'echo "yue2-pid $$"; exec "$@"';
const PID_LINE = /^yue2-pid (\d+)\r?$/;

export type SpawnFn = (file: string, args: readonly string[]) => ChildProcess;

export type SpawnSeams = {
  readonly spawn: SpawnFn;
  /** End the Windows-side tree of `child` (taskkill /T /F on win32, a signal elsewhere). */
  readonly killTree: (child: ChildProcess) => void;
};

export type Collected = {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  /** The spawn itself failed (ENOENT: no wsl.exe). */
  readonly error?: string;
  /** The Linux pid (= process group) the launcher reported, when it did. */
  readonly linuxPid?: number;
};

export type CollectOptions = {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  /** The command runs under LAUNCH_SCRIPT: read the pid line and kill the Linux group on a stop. */
  readonly distro?: string;
};

/** The real spawn: no shell, no console window, UTF-8 from wsl.exe's own messages. */
export const realSpawn: SpawnFn = (file, args) =>
  spawn(file, [...args], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WSL_UTF8: "1" } });

/** taskkill on the LIVE relay pid first (the tree cannot be walked once it exited), a signal as fallback. */
export function realKillTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {
      if (child.exitCode === null && !child.killed) child.kill();
    });
    return;
  }
  child.kill("SIGKILL");
}

/** The kill of the Linux group, as its own relay; fire-and-forget (its failure means the group is gone). */
export function wslKillArgs(distro: string, pid: number): string[] {
  return ["-d", distro, "--exec", "kill", "-KILL", "--", `-${pid}`];
}

export const lastLine = (s: string): string => s.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
export const stderrTail = (s: string): string => s.trim().split(/\r?\n/).slice(-3).join(" | ");

/** Spawn `file args`, bounded by a timeout and an abort signal, and collect both streams' tails. */
export function collect(seams: SpawnSeams, file: string, args: readonly string[], opts: CollectOptions): Promise<Collected> {
  return new Promise((resolve) => {
    let out = "";
    let errText = "";
    let head = "";
    let headDone = opts.distro === undefined;
    let linuxPid: number | undefined;
    let timedOut = false;
    let aborted = false;
    let stopping = false;
    let pendingKill = false;
    let settled = false;
    let child: ChildProcess;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const finish = (code: number | null, error?: string): void => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      opts.signal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({ code, stdout: out, stderr: errText, timedOut, aborted, ...(error === undefined ? {} : { error }), ...(linuxPid === undefined ? {} : { linuxPid }) });
    };
    const killWindows = (): void => {
      try {
        seams.killTree(child);
      } catch (e) {
        errText = `${errText}\nkill: ${e instanceof Error ? e.message : String(e)}`.slice(-KEEP_BYTES);
      }
    };
    const killLinux = (pid: number): void => {
      if (opts.distro === undefined) return;
      try {
        const k = seams.spawn("wsl.exe", wslKillArgs(opts.distro, pid));
        k.on("error", () => undefined);
        k.stdout?.resume();
        k.stderr?.resume();
      } catch (e) {
        errText = `${errText}\nwsl kill: ${e instanceof Error ? e.message : String(e)}`.slice(-KEEP_BYTES);
      }
    };
    const stop = (why: "timeout" | "abort"): void => {
      if (stopping || settled) return;
      stopping = true;
      if (why === "timeout") timedOut = true;
      else aborted = true;
      timers.push(setTimeout(() => finish(child.exitCode), CLOSE_GRACE_MS));
      if (opts.distro === undefined) return killWindows();
      if (linuxPid !== undefined) {
        killLinux(linuxPid);
        return killWindows();
      }
      pendingKill = true;
      timers.push(
        setTimeout(() => {
          if (!pendingKill) return;
          pendingKill = false;
          killWindows();
        }, PID_GRACE_MS),
      );
    };
    const onAbort = (): void => stop("abort");

    try {
      child = seams.spawn(file, args);
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", timedOut, aborted, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    timers.push(setTimeout(() => stop("timeout"), opts.timeoutMs));
    if (opts.signal?.aborted === true) stop("abort");
    else opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (b: Buffer) => {
      let text = b.toString("utf8");
      if (!headDone) {
        head += text;
        const nl = head.indexOf("\n");
        if (nl < 0 && head.length < 256) return;
        headDone = true;
        const first = nl < 0 ? head : head.slice(0, nl);
        const m = PID_LINE.exec(first);
        text = m ? head.slice(nl + 1) : head;
        if (m) {
          linuxPid = Number(m[1]);
          if (pendingKill) {
            pendingKill = false;
            killLinux(linuxPid);
            killWindows();
          }
        }
      }
      out = (out + text).slice(-KEEP_BYTES);
    });
    child.stderr?.on("data", (b: Buffer) => {
      errText = (errText + b.toString("utf8")).slice(-KEEP_BYTES);
    });
    child.on("error", (e) => finish(null, e.message));
    child.on("close", (code) => {
      if (!headDone) out = head.slice(-KEEP_BYTES);
      finish(code);
    });
  });
}
