// The token gate.  node pipeline/check-tokens.mts [--root <dir>]   (npm run tokens:check)
//   (a) drift: the committed outputs must equal a fresh render of source.json.
//   (b) raw values: *.module.css under packages/ and app/(studio)/ may name a design value only
//       through a token (rules and allow-list: packages/ui/src/tokenLint.ts).
// Exit 0 clean, 1 findings or drift, 2 the scan itself cannot be trusted (bad source, or module
// stylesheets exist that the walk did not reach).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintCss } from "../packages/ui/src/tokenLint.ts";
import { REGEN_COMMAND, renderCss, renderTs } from "../packages/ui/src/tokenRender.ts";
import { parseSource, tokenNames } from "../packages/ui/src/tokenSource.ts";

const argRoot = process.argv[process.argv.indexOf("--root") + 1];
const root =
  process.argv.includes("--root") && argRoot
    ? resolve(argRoot)
    : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["packages", "app/(studio)"];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const src = parseSource(readFileSync(join(root, "packages/ui/tokens/source.json"), "utf8"));
if (!src.ok) {
  console.error(`tokens:check: source.json invalid: ${src.error}`);
  process.exit(2);
}
const allowed = tokenNames(src.value);
let failed = false;

// (a) drift
const committed: ReadonlyArray<readonly [string, string]> = [
  ["packages/ui/src/tokens.css", renderCss(src.value)],
  ["packages/ui/src/tokens.ts", renderTs(src.value)],
];
let drifted = 0;
for (const [rel, fresh] of committed) {
  const path = join(root, rel);
  const have = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (have !== fresh) {
    drifted++;
    console.error(`DRIFT ${rel}: ${have === null ? "missing" : "differs from a fresh render"}`);
  }
}
if (drifted > 0) {
  console.error(`tokens:check: ${drifted} generated file(s) drifted. Run: ${REGEN_COMMAND}`);
  failed = true;
}
console.log(`drift: ${committed.length - drifted}/${committed.length} outputs current, ${allowed.size} tokens`);

// (b) raw values
const existing = SCAN_ROOTS.filter((r) => existsSync(join(root, r)));
let walked = 0;
let unreached = 0;
let declarations = 0;
let varRefs = 0;
let findings = 0;
for (const r of existing) {
  for (const file of listFiles(join(root, r))) {
    const rel = relative(root, file).split("\\").join("/");
    if (/\.module\.css$/.test(rel)) {
      walked++;
      const res = lintCss(readFileSync(file, "utf8"), allowed);
      declarations += res.declarations;
      varRefs += res.varRefs;
      for (const f of res.findings) {
        findings++;
        console.error(`${rel}:${f.line} ${f.kind} ${f.text}`);
      }
    } else if (/\.module\.[a-z]+$/i.test(rel)) {
      // A module stylesheet in a form the walk does not lint (.scss, .CSS): never a silent pass.
      unreached++;
      console.error(`UNREACHED ${rel}: module stylesheet the lint does not read`);
    }
  }
}
console.log(
  `raw values: roots present ${existing.length}/${SCAN_ROOTS.length}, files walked ${walked}, ` +
    `declarations ${declarations}, var() refs ${varRefs}, findings ${findings}` +
    (walked === 0 && unreached === 0 ? " - nothing to check" : ""),
);
if (unreached > 0) process.exit(2);
if (findings > 0) failed = true;
process.exit(failed ? 1 : 0);
