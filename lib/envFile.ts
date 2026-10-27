import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// THE ENV FILES A PLAIN-`node` PROCESS READS FOR ITSELF (spark night-load-band). Next loads
// .env and .env.local for the app; a CLI or the worker started from a shell or a logon task gets
// only what that shell exported. The worker started at logon (pipeline/worker-service.ps1) is
// exactly such a process, and without its keys every vendor-backed drive it runs would fail as
// "unauthenticated" an hour into a night.
//
// The rules are pipeline/scout.mts `loadEnv`'s (itself pipeline/foundry/extract.mts's): .env
// first, then .env.local; a blank line, a `#` comment and a line without `=` are skipped; an
// empty value sets nothing; and an EXPORTED value always wins - a file never clobbers what the
// shell said, so `GRAVITONE_STORE_PATH=<temp> npm run worker` still points at the temp store.
// Three departures, each deliberate: a value wrapped in matching quotes loses them, a leading BOM
// is ignored (Notepad writes one), and .env.local overrides .env - the copies let the FIRST file
// win, which is the reverse of Next's order for the same two files, so a key set in both read
// differently in the app and in a CLI. The exported value still beats both.
//
// Sixteen CLIs carry their own copy of that loop today; they may adopt this one, and none is
// migrated here (out of this spark's scope).

/** Strip one pair of matching surrounding quotes. */
function unquote(v: string): string {
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1);
  return v;
}

/**
 * Read `files` under `root` into `env`, never clobbering a key it held before the call (a later
 * file overrides an earlier one). Returns the NAMES it set, in file order - never a value, so the caller may log what it read.
 */
export function loadEnvFiles(
  root: string,
  files: readonly string[] = [".env", ".env.local"],
  env: Record<string, string | undefined> = process.env,
): string[] {
  const set: string[] = [];
  const exported = new Set(Object.keys(env).filter((k) => env[k] !== undefined));
  for (const f of files) {
    const at = path.join(root, f);
    if (!existsSync(at)) continue;
    for (const raw of readFileSync(at, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = raw.trim();
      if (line === "" || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = unquote(line.slice(i + 1).trim());
      if (k === "" || v === "" || exported.has(k)) continue;
      env[k] = v;
      if (!set.includes(k)) set.push(k);
    }
  }
  return set;
}
