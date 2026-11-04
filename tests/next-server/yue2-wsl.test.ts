// THE SONG LAB'S WSL DOOR (lib/yue2/wsl.ts + ./wslSpawn.ts) WITHOUT WSL. Every `wsl.exe` the door spawns
// is replaced by a fake: a real child process (this Node binary running a few lines of script) that plays
// the part the arguments ask for - `-l -q` lists distros, the doctor's probe prints its key=value lines,
// `printenv HOME` prints a home, `kill` is recorded, and an op echoes its argv, answers a fixed last line,
// sleeps until it is killed, or ends when its stdin closes. So the argument array, the last-line rules, the kind mapping, the doctor's
// hints and both kills are asserted on real processes, and no test needs WSL or the GPU.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 20_000 });

import { forgetWslHome, runYue2With, toWslPath, yue2Argv, yue2DoctorWith, type Yue2Deps } from "../../lib/yue2/wsl.ts";
import { LAUNCH_SCRIPT, PID_GRACE_MS, realKillTree, realSpawn } from "../../lib/yue2/wslSpawn.ts";

type Call = { readonly file: string; readonly args: readonly string[]; readonly child: ChildProcess };

const node = (script: string, args: readonly string[]): ChildProcess =>
  spawn(process.execPath, ["-e", script, "--", ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

const ECHO_ARGV = 'console.log("yue2-pid 4242"); console.log("log line"); console.log(JSON.stringify({ ok: true, argv: process.argv.slice(1) }));';
const SLEEP = (pidLine: boolean): string => `${pidLine ? 'console.log("yue2-pid 4242");' : ""} setTimeout(() => {}, 60000);`;
const SAY = (line: string, code: number): string => `console.log("yue2-pid 4242"); console.log("working"); console.log(${JSON.stringify(line)}); process.exitCode = ${code};`;
const PROBE_ALL = 'for (const l of ["home=/srv/lab", "gen=1", "eval=1", "gpu=GPU 0: NVIDIA GeForce RTX 4090", "ffmpeg=/srv/lab/yue2-lab/.eval-bin/ffmpeg"]) console.log(l);';

type Fake = { readonly op?: string; readonly list?: string; readonly probe?: string; readonly noWsl?: boolean };

function fakeDeps(fake: Fake, over: Partial<Yue2Deps> = {}): { deps: Yue2Deps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: Yue2Deps = {
    spawn: (file, args) => {
      let child: ChildProcess;
      if (fake.noWsl === true) child = spawn("yue2-no-such-binary-for-tests", [], { windowsHide: true });
      else if (args[0] === "-l") child = node(fake.list ?? 'console.log("docker-desktop"); console.log("Ubuntu");', args);
      else if (args.includes("yue2-doctor")) child = node(fake.probe ?? PROBE_ALL, args);
      else if (args.includes("printenv")) child = node('console.log("/srv/lab");', args);
      else if (args.includes("kill")) child = node("", args);
      else child = node(fake.op ?? ECHO_ARGV, args);
      calls.push({ file, args, child });
      return child;
    },
    killTree: realKillTree,
    canSpawn: () => true,
    posture: () => "this machine may spawn local binaries",
    env: {},
    repoRoot: "C:\\repo root\\gt",
    ...over,
  };
  forgetWslHome();
  return { deps, calls };
}

const alive = (pid: number | undefined): boolean => {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function gone(pid: number | undefined): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !alive(pid);
}

describe("yue2 WSL door: the argument array", () => {
  it("spawns wsl.exe --exec through the setsid launcher, never the login shell", async () => {
    const { deps, calls } = fakeDeps({});
    const r = await runYue2With(deps, "score", ["--in", "/mnt/c/x/take.flac", "--lyrics", "/mnt/c/x/l.txt"], { timeoutMs: 10_000 });
    expect(r.ok).toBe(true);
    expect(calls[0]?.args).toEqual(["-d", "Ubuntu", "--exec", "printenv", "HOME"]);
    const run = calls[1];
    expect(run?.file).toBe("wsl.exe");
    expect(run?.args).toEqual([
      "-d", "Ubuntu", "--exec", "setsid", "-w", "sh", "-c", LAUNCH_SCRIPT, "yue2",
      "/srv/lab/yue2-lab/.venv-eval/bin/python", "/mnt/c/repo root/gt/pipeline/yue2/score.py",
      "--in", "/mnt/c/x/take.flac", "--lyrics", "/mnt/c/x/l.txt",
    ]);
    expect(run?.args).not.toContain("--");
  });

  it("gen runs the gen venv; env overrides pick the distro, home and pythons (home is then not asked)", async () => {
    const { deps, calls } = fakeDeps({}, { env: { YUE2_WSL_DISTRO: "Lab", YUE2_HOME: "/srv/lab", YUE2_PY_GEN: "/opt/py" } });
    const r = await runYue2With(deps, "gen", ["--seed", "1"], { timeoutMs: 10_000 });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.slice(0, 2)).toEqual(["-d", "Lab"]);
    expect(calls[0]?.args.slice(9)).toEqual(["env", "YUE2_HOME=/srv/lab", "/opt/py", "/mnt/c/repo root/gt/pipeline/yue2/gen.py", "--seed", "1"]);
    expect(yue2Argv("U", { home: "/h", homeSet: false, genPy: "/g", evalPy: "/e" }, "/s.py", ["a"], "/e").slice(9)).toEqual(["/e", "/s.py", "a"]);
  });

  it("THE SPACE TEST: an argument with spaces and quotes arrives as ONE argv element", async () => {
    const { deps } = fakeDeps({}, { env: { YUE2_HOME: "/h" } });
    const nasty = ['a style with spaces "and quotes" and \'single\' ones', "$HOME;rm -rf *|&", "", "ünïcode"];
    const r = await runYue2With(deps, "post", ["--note", ...nasty], { timeoutMs: 10_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const argv = r.value["argv"] as string[];
    expect(argv.slice(-5)).toEqual(["--note", ...nasty]);
  });

  it("refuses an argument wsl.exe would rewrite (a backslash), before spawning anything", async () => {
    const { deps, calls } = fakeDeps({});
    const r = await runYue2With(deps, "score", ["--in", "C:\\x\\take.flac"], { timeoutMs: 10_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid");
    expect(calls).toHaveLength(0);
  });

  it("toWslPath maps a drive path and leaves a WSL path alone", () => {
    expect(toWslPath("C:\\Users\\a b\\x.flac")).toBe("/mnt/c/Users/a b/x.flac");
    expect(toWslPath("/srv/lab/x")).toBe("/srv/lab/x");
  });
});

describe("yue2 WSL door: the last line", () => {
  const run = (line: string, code: number) => runYue2With(fakeDeps({ op: SAY(line, code) }, { env: { YUE2_HOME: "/h" } }).deps, "score", [], { timeoutMs: 10_000 });

  it("ok: the answer is the last line, the pid line and the logs are not", async () => {
    const r = await run('{"ok":true,"scores":{"wer":0.02}}', 0);
    expect(r).toEqual({ ok: true, value: { ok: true, scores: { wer: 0.02 } } });
  });

  it("maps the kinds like the audio sidecar: refused -> invalid, missing-module and failed -> unavailable", async () => {
    const refused = await run('{"ok":false,"error":"score.py: --in: no such file: /x","kind":"refused"}', 1);
    const missing = await run('{"ok":false,"error":"No module named \'jiwer\'","kind":"missing-module"}', 1);
    const failed = await run('{"ok":false,"error":"RuntimeError: CUDA","kind":"failed"}', 1);
    expect(refused.ok ? null : [refused.error.code, refused.error.message]).toEqual(["invalid", "yue2 score: score.py: --in: no such file: /x"]);
    expect(missing.ok ? null : missing.error.code).toBe("unavailable");
    expect(failed.ok ? null : [failed.error.code, failed.error.message]).toEqual(["unavailable", "yue2 score: RuntimeError: CUDA"]);
  });

  it("garbage, an empty answer, or ok with a failing exit is unavailable and never a throw", async () => {
    for (const [line, code] of [["Traceback (most recent call last):", 1], ["", 0], ['{"ok":true}', 1], ["{not json", 0]] as const) {
      const r = await run(line, code);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unavailable");
    }
  });
});

describe("yue2 WSL door: stopping kills both sides", () => {
  it("a timeout kills the sleeping child on Windows AND its Linux process group", async () => {
    const { deps, calls } = fakeDeps({ op: SLEEP(true) }, { env: { YUE2_HOME: "/h" } });
    const r = await runYue2With(deps, "gen", [], { timeoutMs: 400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/did not finish in 0 s; WSL process group 4242 and its relay were killed/);
    const child = calls.find((c) => c.args.includes("setsid"))?.child;
    expect(await gone(child?.pid)).toBe(true);
    expect(calls.find((c) => c.args.includes("kill"))?.args).toEqual(["-d", "Ubuntu", "--exec", "kill", "-KILL", "--", "-4242"]);
  });

  it("an abort does the same, and an already-aborted signal spawns nothing", async () => {
    const { deps, calls } = fakeDeps({ op: SLEEP(true) }, { env: { YUE2_HOME: "/h" } });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    const r = await runYue2With(deps, "post", [], { timeoutMs: 60_000, signal: ac.signal });
    expect(r.ok ? null : r.error.message).toMatch(/was aborted; WSL process group 4242/);
    expect(await gone(calls.find((c) => c.args.includes("setsid"))?.child.pid)).toBe(true);
    expect(calls.some((c) => c.args.includes("kill"))).toBe(true);
    const pre = fakeDeps({});
    const r2 = await runYue2With(pre.deps, "post", [], { timeoutMs: 1000, signal: AbortSignal.abort() });
    expect(r2.ok).toBe(false);
    expect(pre.calls).toHaveLength(0);
  });

  it("a child that never printed its pid line is killed on Windows after the grace", async () => {
    const { deps, calls } = fakeDeps({ op: SLEEP(false) }, { env: { YUE2_HOME: "/h" } });
    const t0 = Date.now();
    const r = await runYue2With(deps, "score", [], { timeoutMs: 200 });
    expect(r.ok ? null : r.error.message).toMatch(/the WSL relay was killed/);
    expect(Date.now() - t0).toBeLessThan(200 + PID_GRACE_MS + 5_000);
    expect(await gone(calls.find((c) => c.args.includes("setsid"))?.child.pid)).toBe(true);
    expect(calls.some((c) => c.args.includes("kill"))).toBe(false);
  });
});

describe("yue2 WSL door: the owner's death ends the Linux side (stdin EOF)", () => {
  // The fake plays the launcher's watcher: it prints the pid line and exits 137 when its stdin reaches EOF.
  const WATCH = 'console.log("yue2-pid 4242"); process.stdin.on("end", () => process.exit(137)); process.stdin.resume(); setInterval(Number, 60000);';
  const launched = (calls: Call[]) => calls.find((c) => c.args.includes("setsid"))?.child;

  it("a launched command's stdin is a pipe held open while it runs; closing it ends the child", async () => {
    const { deps, calls } = fakeDeps({ op: WATCH }, { env: { YUE2_HOME: "/h" } });
    const pending = runYue2With(deps, "score", [], { timeoutMs: 60_000 });
    for (let i = 0; i < 50 && launched(calls) === undefined; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 800));
    const child = launched(calls);
    expect(child?.stdin).not.toBeNull();
    expect(child?.stdin?.writableEnded).toBe(false);
    expect(alive(child?.pid)).toBe(true);
    child?.stdin?.end(); // what the pipe does when the Node owner dies
    expect(await gone(child?.pid)).toBe(true);
    const r = await pending;
    expect(r.ok ? "" : r.error.message).toMatch(/exited 137/);
  });

  it("a stop closes the held stdin too; calls outside the launcher get theirs ended at once", async () => {
    const { deps, calls } = fakeDeps({ op: SLEEP(true) });
    await runYue2With(deps, "gen", [], { timeoutMs: 400 });
    const printenv = calls.find((c) => c.args.includes("printenv"));
    expect(printenv?.child.stdin?.writableEnded).toBe(true);
    expect(launched(calls)?.stdin?.writableEnded).toBe(true);
    expect(calls.find((c) => c.args.includes("kill"))?.child.stdin?.writableEnded).toBe(true);
    const doc = fakeDeps({});
    await yue2DoctorWith(doc.deps);
    expect(doc.calls.every((c) => c.child.stdin?.writableEnded === true)).toBe(true);
  });

  it("the real spawn opens stdin as a pipe (not ignore), so Node holds the far side's EOF", async () => {
    const c = realSpawn(process.execPath, ["-e", "process.stdin.on('end', () => process.exit(0)); process.stdin.resume();"]);
    expect(c.stdin).not.toBeNull();
    c.stdin?.end();
    expect(await gone(c.pid)).toBe(true);
  });

  it("the launcher keeps stdin for an EOF watcher that kills its own group, and gives the command /dev/null", () => {
    const lines = LAUNCH_SCRIPT.split("\n");
    expect(lines[0]).toBe('echo "yue2-pid $$"');
    expect(lines).toContain("( while read -r _; do :; done; kill -KILL -$$ ) <&3 &");
    expect(lines).toContain('"$@" </dev/null 3<&- &');
    expect(lines.at(-1)).toBe('exit "$r"');
    expect(LAUNCH_SCRIPT).not.toMatch(/kill -KILL --/); // dash's builtin kill refuses `--`
  });

  const hasSh = spawnSync("sh", ["-c", "exit 0"], { windowsHide: true }).status === 0;
  it.skipIf(!hasSh)("under a real sh: the command's exit code passes through, and a closed stdin kills the command", async () => {
    const run = (cmd: readonly string[], endAfterMs?: number) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const c = spawn("sh", ["-c", LAUNCH_SCRIPT, "yue2", ...cmd], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
        if (endAfterMs !== undefined) setTimeout(() => c.stdin.end(), endAfterMs);
        c.on("close", (code) => resolve({ code, out }));
      });
    const done = await run([process.execPath, "-e", "console.log('hi'); process.exitCode = 3"]);
    expect(done.code).toBe(3);
    expect(done.out).toMatch(/^yue2-pid \d+\nhi\n$/);
    const eof = await run([process.execPath, "-e", "console.log(process.pid); setInterval(Number, 60000)"], 1_500);
    const cmdPid = Number(eof.out.split("\n")[1]);
    expect(cmdPid).toBeGreaterThan(0);
    const ended = await gone(cmdPid);
    if (!ended) process.kill(cmdPid); // a red run must not leak its command
    expect(ended).toBe(true);
  });
});

describe("yue2 WSL door: posture and the doctor", () => {
  it("local binaries off: a refusal sentence, nothing spawned, for runs and the doctor", async () => {
    const { deps, calls } = fakeDeps({}, { canSpawn: () => false, posture: () => "LOCAL_BINARIES=off forbids spawning a local binary on this machine" });
    const r = await runYue2With(deps, "gen", [], { timeoutMs: 1000 });
    const d = await yue2DoctorWith(deps);
    expect(r.ok ? null : r.error.code).toBe("unavailable");
    expect(r.ok ? "" : r.error.message).toBe("yue2 gen: LOCAL_BINARIES=off forbids spawning a local binary on this machine");
    expect(d.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("everything present: no hint, the GPU line, and the probe gets the overrides as $1..$3", async () => {
    const { deps, calls } = fakeDeps({}, { env: { YUE2_PY_EVAL: "/opt/eval" } });
    const d = await yue2DoctorWith(deps);
    expect(d).toEqual({ ok: true, value: { distro: "Ubuntu", wsl: true, genVenv: true, evalVenv: true, ffmpeg: true, gpu: "GPU 0: NVIDIA GeForce RTX 4090" } });
    expect(calls[1]?.args.slice(-4)).toEqual(["yue2-doctor", "", "", "/opt/eval"]);
  });

  it("names the first missing piece's fix: wsl, distro, gen venv, eval venv, gpu, ffmpeg", async () => {
    const hint = async (fake: Fake) => {
      const d = await yue2DoctorWith(fakeDeps(fake).deps);
      return d.ok ? d.value.hint : `error ${d.error.message}`;
    };
    const probe = (lines: string[]) => `for (const l of ${JSON.stringify(lines)}) console.log(l);`;
    expect(await hint({ noWsl: true })).toBe("wsl --install");
    expect(await hint({ list: 'console.log("docker-desktop")' })).toBe("wsl --install -d Ubuntu");
    expect(await hint({ probe: probe(["home=/srv/lab", "gen=0", "eval=1"]) })).toBe('wsl.exe -d Ubuntu --exec bash "/mnt/c/repo root/gt/pipeline/yue2/install-gen.sh"');
    expect(await hint({ probe: probe(["home=/srv/lab", "gen=1", "eval=0"]) })).toMatch(/install-eval\.sh"$/);
    expect(await hint({ probe: probe(["home=/srv/lab", "gen=1", "eval=1", "ffmpeg=/f"]) })).toBe("wsl --update");
    expect(await hint({ probe: probe(["home=/srv/lab", "gen=1", "eval=1", "gpu=GPU 0"]) })).toMatch(/install-eval\.sh"$/);
  });

  it("a run that cannot start (no wsl.exe, or a missing venv) answers unavailable WITH the doctor's fix", async () => {
    const noWsl = await runYue2With(fakeDeps({ noWsl: true }, { env: { YUE2_HOME: "/h" } }).deps, "score", [], { timeoutMs: 5000 });
    expect(noWsl.ok ? null : noWsl.error.code).toBe("unavailable");
    expect(noWsl.ok ? "" : noWsl.error.message).toMatch(/fix: wsl --install$/);
    const noVenv = fakeDeps({
      op: 'console.log("yue2-pid 7"); console.error("setsid: failed to execute /srv/lab/yue2-lab/.venv/bin/python: No such file or directory"); process.exitCode = 1;',
      probe: `for (const l of ${JSON.stringify(["home=/srv/lab", "gen=0", "eval=1"])}) console.log(l);`,
    });
    const r = await runYue2With(noVenv.deps, "gen", [], { timeoutMs: 5000 });
    expect(r.ok ? null : r.error.code).toBe("unavailable");
    expect(r.ok ? "" : r.error.message).toMatch(/No such file or directory; the generation venv is missing; fix: wsl\.exe -d Ubuntu --exec bash .*install-gen\.sh"$/);
  });
});
