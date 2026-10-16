// THE LOADER HOOKS a plain-`node` process needs to import lib/ (Phase 4: shared by
// pipeline/ledger-sync.mts and workers/runner.mts; moved here from ledger-sync).
//
// lib/ is written for a bundler: extensionless imports, `@/` paths, parameter
// properties (lib/foundry/runStore.ts FoundryError) that type STRIPPING refuses,
// bare JSON imports, and `import "server-only"`, which outside Next throws by design.
// These hooks give the process what Next gives the server: `server-only` resolves to
// its empty server entry (next/dist/compiled/server-only, as playwright.config.ts does
// for the node lane), a bare path finds its .ts/.tsx, a repo TypeScript file is
// TRANSFORMED (node:module stripTypeScriptTypes, mode "transform"), and repo JSON
// loads as JSON. Import this module FIRST, then import lib/ dynamically: a static
// import is resolved before any module body runs, hooks included.

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_ONLY = pathToFileURL(path.join(ROOT, "node_modules", "next", "dist", "compiled", "server-only", "empty.js")).href;
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

function probe(abs: string): string | null {
  if (isFile(abs)) return abs;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (isFile(abs + ext)) return abs + ext;
  return null;
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: SERVER_ONLY, shortCircuit: true };
    let abs: string | null = null;
    if (spec.startsWith("@/")) abs = path.join(ROOT, spec.slice(2));
    else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:") === true) abs = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    const hit = abs === null ? null : probe(abs);
    return hit === null ? next(spec, ctx) : { url: pathToFileURL(hit).href, shortCircuit: true };
  },
  load(url, ctx, next) {
    // lib/ imports JSON bare, as a bundler allows; Node wants `with { type: "json" }`.
    if (url.startsWith("file:") && url.endsWith(".json") && !url.includes("/node_modules/")) return { format: "json", source: readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    if (!url.startsWith("file:") || !/\.(ts|tsx|mts)$/.test(url) || url.includes("/node_modules/")) return next(url, ctx);
    const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform", sourceUrl: url });
    return { format: "module", source, shortCircuit: true };
  },
});
