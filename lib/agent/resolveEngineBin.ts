// THE REVIEWER'S BINARY: finds the CLI for one reviewer engine, as an argv prefix.
//
// Split out of cliSeam.ts (the door, which re-exports this) because it is the
// per-engine resolver: the override variables, the Windows shim handling and the
// fallback install locations. The claude case delegates to resolveAgentBin, the
// writer's resolver in agentArgs.ts.

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveAgentBin } from "./agentArgs";
import type { ReviewerEngineName } from "./reviewerEngines";

/** `ARTICLES_<ENGINE>_BIN` overrides one engine's binary (`|`-separated argv);
 *  claude reviewers use the writer's ARTICLES_AGENT_BIN. */
const ENGINE_BIN_VAR = { codex: "ARTICLES_CODEX_BIN", agy: "ARTICLES_AGY_BIN" } as const;

const splitOverride = (o: string) => o.split("|").map((s) => (s === "node" ? process.execPath : existsSync(path.resolve(s)) ? path.resolve(s) : s));

/** The binary for one engine, as an argv prefix, spawned WITHOUT a shell. An
 *  npm `.cmd` shim cannot be spawned without one, so codex runs as
 *  `node <package>/bin/codex.js` (the contest runner's resolver). */
export function resolveEngineBin(engine: ReviewerEngineName, env: Record<string, string | undefined> = process.env): string[] {
  if (engine === "claude") return resolveAgentBin(env);
  const variable = ENGINE_BIN_VAR[engine];
  const override = env[variable]?.trim();
  if (override) return splitOverride(override);

  const win = process.platform === "win32";
  const exts = win ? [".exe", ".cmd", ""] : [""];
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const home = os.homedir();
  const local = env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const fallbacks: Record<typeof engine, string[]> = {
    codex: [],
    agy: [path.join(local, "agy", "bin", "agy.exe"), path.join(home, ".local", "bin", "agy")],
  };
  const candidates: string[] = [];
  for (const d of dirs) for (const e of exts) candidates.push(path.join(d, `${engine}${e}`));
  candidates.push(...fallbacks[engine]);
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (win && (/\.cmd$/i.test(c) || !path.extname(c))) {
      const script = engine === "codex" ? path.join(path.dirname(c), "node_modules", "@openai", "codex", "bin", "codex.js") : "";
      if (script && existsSync(script)) return [process.execPath, script];
      continue;
    }
    return [c];
  }
  throw new Error(`The \`${engine}\` CLI was not found on PATH (set ${variable} to point at it).`);
}
