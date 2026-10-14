// Rebuild docs/next/prototype/data/ - the reference set the approved prototype pages load.
//
//   node docs/next/prototype/tools/rebuild-data.mts [--registry ../ai-registry]
//
// The pages in ../app/ are committed; their 20 MB of data is not (owner's decision,
// docs/next/migration-plan.md §8.4). This script regenerates it from what this machine has:
// downscaled real media from foundry-out/ (stage_media.py, needs Python + Pillow), the real
// styles and registry topics (build_data.py), and the app's deterministic fixture universe
// (`npm run fixtures`). foundry-out/ is per machine, so a second machine's set can differ in
// which runs it shows; the pages label every item real / fixture / illustrative either way.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const data = resolve(here, "../data");
const argRegistry = process.argv.indexOf("--registry");
const registry = resolve(repo, argRegistry > 0 ? (process.argv[argRegistry + 1] ?? "../ai-registry") : "../ai-registry");

function run(cmd: string, args: readonly string[]): void {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: repo, stdio: "inherit", shell: process.platform === "win32" });
}

if (!existsSync(join(repo, "foundry-out"))) {
  console.error("rebuild-data: foundry-out/ is missing on this machine - the media set has nothing to stage.");
  process.exit(2);
}
if (!existsSync(join(registry, "knowledge"))) {
  console.error(`rebuild-data: no registry at ${registry} - pass --registry <path>.`);
  process.exit(2);
}

rmSync(data, { recursive: true, force: true });
mkdirSync(join(data, "media"), { recursive: true });
run("python", [join(here, "stage_media.py"), join(data, "media")]);
run("python", [join(here, "build_data.py"), repo, registry, data]);
run("npm", ["run", "fixtures"]);
cpSync(join(repo, "fixtures-out"), join(data, "fixtures"), { recursive: true });
rmSync(join(repo, "fixtures-out"), { recursive: true, force: true });
console.log(`rebuild-data: wrote ${data}`);
