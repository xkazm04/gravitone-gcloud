#!/usr/bin/env node
//
// dev-guard — run a long-lived dev command so that its ENTIRE process tree dies
// with it, and (optionally) trip a circuit breaker if node processes storm.
//
// WHY THIS EXISTS. Turbopack executes JS loaders in node subprocess workers, and
// Windows does not cascade a kill down a process tree: stopping `next dev`, or
// closing the terminal, leaves those workers parked. The sibling `kp` repo
// measured the failure mode this guards against — one `dev:inspect` run with an
// unconditioned `*.tsx` loader stranded ~2,800 node processes holding 15.8 GB.
// Two things stop it here: the Turbopack rule carries a `condition` so the
// loader is never dispatched for node_modules or Next internals (next.config.ts),
// and this guard reaps whatever the dev server spawned on every exit path.
//
// Only `dev:inspect` needs it — a plain `npm run dev` registers no loader and so
// spawns no loader workers — but nothing here is inspector-specific.
//
// Usage:  node pipeline/dev-guard.mjs [KEY=value ...] <command> [args...]
//   e.g.  node pipeline/dev-guard.mjs DEV_INSPECT=1 DEV_GUARD_MAX_NODE=150 next dev
//
// Leading `KEY=value` arguments are consumed as environment for the child. That
// is deliberately in place of a `cross-env` dependency: `DEV_INSPECT=1 next dev`
// in an npm script is a POSIX-ism that cmd.exe does not understand, and this repo
// is developed on Windows.
//
// Env (may be passed as leading KEY=value or set in the shell):
//   DEV_GUARD_MAX_NODE  enable the storm breaker: abort when the node process
//                       count rises more than this far above the count measured
//                       at launch (default: off).
//   DEV_GUARD_POLL_MS   breaker poll interval in ms (default 8000).

import { spawn, spawnSync } from "node:child_process";

const argv = process.argv.slice(2);

// Consume leading KEY=value pairs as child environment.
const env = { ...process.env };
while (argv.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
  const arg = argv.shift();
  const eq = arg.indexOf("=");
  env[arg.slice(0, eq)] = arg.slice(eq + 1);
}

if (argv.length === 0) {
  console.error(
    "dev-guard: no command given\n" +
      "  usage: node pipeline/dev-guard.mjs [KEY=value ...] <command> [args...]",
  );
  process.exit(2);
}

const isWin = process.platform === "win32";
const MAX_NODE_DELTA = env.DEV_GUARD_MAX_NODE ? Number(env.DEV_GUARD_MAX_NODE) : null;
const POLL_MS = Number(env.DEV_GUARD_POLL_MS) || 8000;

// shell:true lets Windows resolve the `.cmd` shims npm puts on PATH for scripts
// (`next`), without hardcoding node_modules/.bin paths.
const child = spawn(argv[0], argv.slice(1), { stdio: "inherit", shell: true, env });

let reaped = false;
function reapTree() {
  if (reaped || child.pid == null) return;
  reaped = true;
  if (isWin) {
    // /T = the whole tree (shell -> next -> every compile/loader worker),
    // /F = force. This is the cascade Windows will not do on its own.
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* group already gone */ }
    try { child.kill("SIGTERM"); } catch { /* already exited */ }
  }
}

// Every exit path, so the dev tree can never outlive this guard: Ctrl-C, a
// terminal close, `kill`, or this process ending normally.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sig, () => { reapTree(); process.exit(130); });
}
process.on("exit", reapTree);

child.on("exit", (code, signal) => {
  reapTree();
  process.exit(signal ? 1 : (code ?? 0));
});
child.on("error", (err) => {
  console.error(`dev-guard: failed to launch '${argv.join(" ")}': ${err.message}`);
  process.exit(1);
});

// ---- optional storm circuit breaker -----------------------------------------
// Counts node processes via Get-Process / pgrep — deliberately NOT `tasklist`,
// which crawls once the process table is already huge, i.e. exactly when the
// count is needed. Compared against the launch baseline so node processes from
// other projects cannot cause a false trip.
function nodeCount() {
  try {
    const r = isWin
      ? spawnSync("powershell", ["-NoProfile", "-Command", "(Get-Process node -ErrorAction SilentlyContinue).Count"], { encoding: "utf8", timeout: 5000 })
      : spawnSync("pgrep", ["-c", "node"], { encoding: "utf8", timeout: 5000 });
    return parseInt(String(r.stdout || "").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

if (MAX_NODE_DELTA != null && Number.isFinite(MAX_NODE_DELTA)) {
  const baseline = nodeCount();
  const timer = setInterval(() => {
    const n = nodeCount();
    if (n - baseline > MAX_NODE_DELTA) {
      console.error(
        `\n[dev-guard] node processes spiked to ${n} (baseline ${baseline}, ` +
          `+${n - baseline} > ${MAX_NODE_DELTA}). Worker storm — reaping the dev tree and aborting.`,
      );
      clearInterval(timer);
      reapTree();
      process.exit(1);
    }
  }, POLL_MS);
  timer.unref?.();
}
