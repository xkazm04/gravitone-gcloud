// THE ROUTE POPULATION, DERIVED FROM THE FILESYSTEM.
//
// imaging-auth.probe.spec.ts proved a list of routes beats a hand-kept one: it
// carried four when it was written and the repo had ten, and one of the missing
// six was UNGATED. Its walk lives inside that file, so every other probe that
// wants "all the money routes" would have to copy it. This is the walk, shared.
//
// A route is a MONEY route when its source calls `guardRequest(` - the door
// lib/apiAuth.ts reserves for routes that spend a vendor balance or local
// compute (`guardAccessOnly` / `checkAccess` routes spend nothing and are not
// rate-counted). The obligation to be driven is therefore read off the route's
// own choice of door: a new `app/api/x/route.ts` that calls `guardRequest`
// joins the population by existing, with no list edit.
//
// imaging-auth.probe.spec.ts still carries its own copy of the walk; moving it
// onto this module is a follow-up that touches a file outside this lane.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { stripComments } from "./_helpers";

export type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export interface MoneyRoute {
  /** Repo-relative file, forward slashes: `app/api/imaging/generate/route.ts`. */
  file: string;
  /** The URL path with dynamic segments left in brackets: `/api/articles/[runId]/approve`. */
  path: string;
  /** Names of the dynamic segments, in order. */
  params: string[];
  /** Every HTTP method the module exports, with its handler. */
  handlers: Record<string, Handler>;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every `route.ts` under app/api, repo-relative with forward slashes. */
export function routeFiles(root: string = process.cwd()): string[] {
  const apiDir = join(root, "app", "api");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") found.push(relative(root, full).split("\\").join("/"));
    }
  };
  walk(apiDir);
  // A walk that finds nothing reports "no money routes" in a voice
  // indistinguishable from success. Prove it read the tree first.
  if (found.length < 8) throw new Error(`the route walk found ${found.length} route(s) - it is reading the wrong tree`);
  return found.sort();
}

/** The routes whose code (comments stripped) calls `guardRequest(`. */
export function moneyRouteFiles(root: string = process.cwd()): string[] {
  return routeFiles(root).filter((rel) => /\bguardRequest\s*\(/.test(stripComments(readFileSync(join(root, rel), "utf8"))));
}

/** `app/api/a/[id]/b/route.ts` -> `/api/a/[id]/b`. */
export function urlPathOf(file: string): string {
  return "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
}

/** Import every money route and read its exported handlers off the module, so
 *  the methods driven are the ones the route really exposes. */
export async function loadMoneyRoutes(root: string = process.cwd()): Promise<MoneyRoute[]> {
  const out: MoneyRoute[] = [];
  for (const file of moneyRouteFiles(root)) {
    const abs = join(root, file);
    if (!existsSync(abs)) throw new Error(`${file} vanished between the walk and the import`);
    // `require`, not `import()`: Playwright's transform (the `@/` alias, the .ts
    // loader) is hooked into CommonJS resolution, and a dynamic import() of an
    // absolute path goes around it - the route's own `@/lib/apiAuth` then fails.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(abs) as Record<string, unknown>;
    const path = urlPathOf(file);
    const handlers: Record<string, Handler> = {};
    for (const m of METHODS) if (typeof mod[m] === "function") handlers[m] = mod[m] as Handler;
    if (!Object.keys(handlers).length) throw new Error(`${file} calls guardRequest but exports no HTTP handler`);
    out.push({ file, path, params: [...path.matchAll(/\[(\w+)\]/g)].map((m) => m[1]), handlers });
  }
  return out;
}

/** The URL a request at `route` should carry: dynamic segments filled with an
 *  id that names nothing, so an admitted call is a not-found, never real work. */
export function concretePath(route: MoneyRoute): string {
  return route.path.replace(/\[(\w+)\]/g, "no-such-$1");
}

/** The second argument a handler with dynamic segments takes. */
export function routeContext(route: MoneyRoute): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(Object.fromEntries(route.params.map((p) => [p, `no-such-${p}`]))) };
}
