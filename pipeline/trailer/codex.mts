// One image from one `codex exec` turn on the operator's ChatGPT seat (built-in image_gen, 1672x941 measured).
// The prompt goes in on stdin: `-i` takes several files and would swallow an argument. Writes <dir>/<name>.png and
// <dir>/<name>.log, and one line to <dir>/ledger.jsonl.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function codexImage(dir: string, name: string, prompt: string, refs: string[], timeoutMs?: number): Promise<boolean> {
  const out = path.join(dir, `${name}.png`);
  fs.rmSync(out, { force: true });
  const missing = refs.filter((r) => !fs.existsSync(r));
  if (missing.length) { console.error(`${name}: missing reference ${missing.join(", ")}`); return Promise.resolve(false); }
  const full = `Use your built-in image_gen tool to make exactly ONE image, wide 16:9 landscape (the widest landscape size you have). ${prompt} After generating, copy the image file into the current working directory as ${name}.png and print its pixel size. Do nothing else.`;
  const log = fs.openSync(path.join(dir, `${name}.log`), "w");
  const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", `"${dir}"`, ...refs.flatMap((r) => ["-i", `"${r}"`]), "--", "-"];
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    // shell: the npm shim is a .cmd on Windows, and spawn refuses a .cmd without one
    const p = spawn("codex", args, { shell: true, stdio: ["pipe", log, log], windowsHide: true });
    if (p.stdin !== null) p.stdin.end(full);
    // the child is the shell, so only a tree kill reaches codex itself
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => { spawn("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true }); }, timeoutMs);
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fs.closeSync(log);
      const ok = code === 0 && fs.existsSync(out);
      const line = { id: name, ok, code, seconds: Math.round((Date.now() - t0) / 1000), refs: refs.length, at: new Date().toISOString() };
      fs.appendFileSync(path.join(dir, "ledger.jsonl"), JSON.stringify(line) + "\n");
      console.log(`${name}: ${ok ? "ok" : `FAILED (see ${path.join(dir, name + ".log")})`} in ${line.seconds} s`);
      resolve(ok);
    };
    p.on("error", () => finish(-1));
    p.on("close", finish);
  });
}
