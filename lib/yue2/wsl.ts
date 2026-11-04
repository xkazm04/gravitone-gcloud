import "server-only";

import { err, type Result } from "@gt/domain/errors";

// THE SONG LAB'S ENGINE DOOR (spark yue2-song-lab, WP0 stub -> WP1). The YuE2 scripts
// (pipeline/yue2/*.py) run inside WSL in two venvs (generation; scoring + post), spawned as
// `wsl.exe -d <distro> -- <venv python> <script> <args...>` WITHOUT a shell: an argument is one
// element of an array, never a string the shell re-splits (repo law, 2026-10-24). The scripts speak
// the audio sidecar's contract: the last stdout line is JSON, `{ok:true,...}` or
// `{ok:false,error,kind}`. Env: YUE2_WSL_DISTRO (default Ubuntu), YUE2_HOME (default ~/yue2-lab),
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
  readonly wsl: boolean;
  readonly distro: string;
  readonly genVenv: boolean;
  readonly evalVenv: boolean;
  readonly gpu?: string;
  readonly ffmpeg: boolean;
  /** The one command that would fix the first missing piece. */
  readonly hint?: string;
};

/** Run one lab script in WSL. Refused when local binaries are off (lib/deployment canSpawnLocalBinaries). */
export async function runYue2(op: Yue2Op, args: readonly string[], options: Yue2RunOptions): Promise<Result<Yue2Answer>> {
  void op;
  void args;
  void options;
  return err("unavailable", "yue2: the WSL door is not built yet (WP1)");
}

/** Probe WSL, both venvs, the GPU and ffmpeg. Never throws; an unreachable WSL is `wsl: false`. */
export async function yue2Doctor(): Promise<Result<Yue2Doctor>> {
  return err("unavailable", "yue2: doctor is not built yet (WP1)");
}

/** A Windows path as the WSL side sees it (C:\x\y -> /mnt/c/x/y). Pure. */
export function toWslPath(windowsPath: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!m) return windowsPath.replace(/\\/g, "/");
  return `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, "/")}`;
}
