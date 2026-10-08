// GENERATE THE FIXTURE UNIVERSE — a complete, schema-derived, deterministic
// dataset for every surface except Articles:
//
//   npm run fixtures                  # wipe fixtures-out/ and regenerate all
//   npm run fixtures -- --only sound  # one generator (sound | publish | foundry | browser)
//   npm run fixtures -- --keep        # do not wipe first
//
// WHAT IT FEEDS (and run it with NEXT_PUBLIC_GRAVITONE_DATA=fixtures, which
// `npm run dev:fixtures` sets — lib/fixtures/mode.ts):
//
//   sound.ts    Sound lab · Library › Audio · Board › Triage    fixtures-out/sound/
//   publish.ts  Calendar · Board › Publish                      fixtures-out/publish/, music-video-exports/
//   foundry.ts  Foundry (forge · extract · dojo) · Board        fixtures-out/runs|extract|training|catalogue/
//   browser.ts  Library › Styles/Assets · Board › Proofs,
//               Adoption, Alternatives                          fixtures-out/browser.json
//
// WHAT IT NEVER TOUCHES: foundry-out/ (real work), pipeline/foundry/*.json and
// pipeline/sound/ledger.json (git-tracked evidence), and the Articles store —
// the one surface whose data is real in both universes.
//
// DETERMINISTIC: every generator draws from its own seeded stream (kit.ts), and
// every timestamp is an offset from the moment of generation. Same checkout,
// same universe, shifted to "now".

import { existsSync, rmSync } from "node:fs";

import { OUT } from "./kit";

// The lib modules a generator imports read this at load time; it must be set
// before they are imported, so the generators are loaded dynamically below.
process.env.NEXT_PUBLIC_GRAVITONE_DATA = "fixtures";

const GENERATORS = ["sound", "publish", "foundry", "browser"] as const;
type Name = (typeof GENERATORS)[number];

const args = process.argv.slice(2);
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] as Name) : null;
if (only && !GENERATORS.includes(only)) {
  console.error(`unknown generator "${only}" — one of: ${GENERATORS.join(", ")}`);
  process.exit(2);
}

if (!only && !args.includes("--keep") && existsSync(OUT)) {
  rmSync(OUT, { recursive: true, force: true });
  console.log(`cleared ${OUT}`);
}

for (const name of GENERATORS) {
  if (only && only !== name) continue;
  const t0 = Date.now();
  const mod = (await import(`./${name}.ts`)) as { generate: () => Promise<string> | string };
  const summary = await mod.generate();
  console.log(`${name.padEnd(8)} ${summary}  (${Date.now() - t0} ms)`);
}
console.log(`\nfixtures written to ${OUT}\nrun the app on it:  npm run dev:fixtures`);
