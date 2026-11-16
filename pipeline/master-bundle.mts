// MASTER BUNDLE (spark audio-distribution) - a finished comparison trial copied NEXT TO ITS ORIGINALS, so the
// folder alone can be listened to here or carried to another device:
//
//   npx tsx pipeline/master-bundle.mts --trial <trial out dir> --to <the originals' folder>
//
// For every recipe in <trial>/compare.json: <to>/<recipe>/<stem>.<recipe>.wav (a master already there with
// the same size is left alone), then <to>/listen.html - the comparison page with every path RELATIVE to
// that folder (originals beside it, masters in the recipe subfolders), and <trial>/listen.html rewritten
// from the same compare.json. Only the subfolders and listen.html are written in <to>; the originals are
// never touched. Exit 0 done · 1 a master listed in compare.json is missing · 2 usage.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { comparePage, type Compare } from "../lib/audio/masterCompare.ts";

function usage(msg: string): never {
  console.error(`master-bundle: ${msg}\nusage: npx tsx pipeline/master-bundle.mts --trial <trial out dir> --to <the originals' folder>`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let trialDir: string | null = null;
let toDir: string | null = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--trial") trialDir = argv[++i] ?? usage("--trial needs a folder");
  else if (a === "--to") toDir = argv[++i] ?? usage("--to needs a folder");
  else usage(`unknown argument ${a ?? ""}`);
}
if (trialDir === null || toDir === null) usage("--trial and --to are required");
const trial = path.resolve(trialDir);
const to = path.resolve(toDir);
const json = path.join(trial, "compare.json");
if (!existsSync(json)) usage(`no compare.json in ${trial}`);
const compare = JSON.parse(readFileSync(json, "utf8")) as Compare;

let missing = 0;
let copied = 0;
const bundled: Compare = {
  ...compare,
  tracks: compare.tracks.map((t) => {
    if (path.resolve(path.dirname(t.input)) !== to) usage(`${t.input} is not in ${to}: the bundle sits beside its originals`);
    return {
      ...t,
      versions: t.versions.map((v) => {
        if (v.row.output === null) return v;
        if (!existsSync(v.row.output)) {
          console.error(`missing: ${v.row.output}`);
          missing++;
          return v;
        }
        const dest = path.join(to, v.recipe, path.basename(v.row.output));
        mkdirSync(path.dirname(dest), { recursive: true });
        const same = existsSync(dest) && statSync(dest).size === statSync(v.row.output).size;
        if (!same) {
          copyFileSync(v.row.output, dest);
          copied++;
        }
        return { ...v, row: { ...v.row, output: dest } };
      }),
    };
  }),
};

writeFileSync(path.join(to, "listen.html"), comparePage(bundled, to), "utf8");
writeFileSync(path.join(trial, "listen.html"), comparePage(compare, trial), "utf8");
console.log(`master-bundle: ${copied} copied into ${compare.recipes.map((r) => path.join(to, r)).join(", ")}; ${path.join(to, "listen.html")}${missing > 0 ? `; ${missing} missing` : ""}`);
process.exit(missing > 0 ? 1 : 0);
