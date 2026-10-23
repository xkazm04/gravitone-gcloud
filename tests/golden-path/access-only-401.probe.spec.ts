// LANE — EVERY GUARDED HANDLER UNDER app/api IS DRIVEN FOR 401 (dynamic, derived).
//
// Since Phase 6 L70 every route under app/api goes through the one wrapper,
// app/_server/route.ts `route({ guard })`; v1's `guardAccessOnly` door, which this
// probe walked until then (51 handlers: foundry, sound, publish, ads, articles,
// turns, video, spend and the file downloads), is called by no route - those
// routes were deleted with the v1 pages, and the four file routes that outlived
// them moved onto route()'s `access` guard. Before this probe, a handler whose
// guard was dropped stayed green unless some other probe happened to import it.
//
// The set is WALKED, never listed: every `route.ts` under app/api is read, its
// comments stripped, and each exported HTTP-method handler is attributed the guard
// its `route({ guard: "..." })` declares (inline, or through a `const x = route(...)`
// it re-exports). Every handler that is not `public` is imported and invoked as a
// plain function with NO credentials, in two postures: no secret configured (fails
// closed) and a secret configured but not presented (missing). Both must be 401.
// A handler that declares no guard at all is a named failure, as is a `public` one
// not in PUBLIC below.
//
// Nothing here can spend: the guard is route()'s first act, before the body is read,
// and a handler that got past it would be a defect this probe reports by name.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";

import { keepEnv, stripComments } from "./_helpers";

const ROOT = join(process.cwd(), "app", "api");
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH", "PATH"]);

// Handlers that cannot be driven in Node. Keyed `<method> <route file>`. Empty
// is the goal; an entry needs a reason that says what stops the drive.
const SKIP: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

interface Target {
  key: string;
  file: string; // posix, relative to repo root
  method: Method;
  guard: string;
  url: string;
  params: Record<string, string | string[]>;
}

/** Each exported method handler's guard: `export const M = route({ guard: "g"` inline, or
 *  `export const M = x` where `const x = route({ guard: "g"`. A method exported any other
 *  way is attributed `"none"` - a handler route() does not wrap. */
function handlerGuards(code: string): Map<Method, string> {
  const vars = new Map<string, string>();
  for (const m of code.matchAll(/\bconst\s+(\w+)\s*=\s*route\s*(?:<[^>]*>)?\s*\(\s*\{\s*guard:\s*"(\w+)"/g)) vars.set(m[1], m[2]);
  const out = new Map<Method, string>();
  for (const m of METHODS) {
    const hit = new RegExp(String.raw`^export\s+(?:async\s+)?(?:function\s+${m}\b|const\s+${m}\s*=\s*([^\n;]*))`, "m").exec(code);
    if (!hit) continue;
    const rhs = (hit[1] ?? "").trim();
    const inline = /^route\s*(?:<[^>]*>)?\s*\(\s*\{\s*guard:\s*"(\w+)"/.exec(rhs);
    out.set(m, inline ? inline[1] : (vars.get(rhs) ?? "none"));
  }
  return out;
}

function discover(): { targets: Target[]; routeFiles: number } {
  const targets: Target[] = [];
  const files = walk(ROOT);
  for (const abs of files) {
    const file = abs.slice(process.cwd().length + 1).split("\\").join("/");
    const code = stripComments(readFileSync(abs, "utf8"));
    const segs = file.replace(/^app\//, "").replace(/\/route\.ts$/, "").split("/");
    const params: Target["params"] = {};
    const urlSegs = segs.map((s) => {
      const c = /^\[\.\.\.(\w+)\]$/.exec(s);
      if (c) {
        params[c[1]] = ["x"];
        return "x";
      }
      const d = /^\[(\w+)\]$/.exec(s);
      if (d) {
        params[d[1]] = "x";
        return "x";
      }
      return s;
    });
    const url = `http://studio.local/${urlSegs.join("/")}`;
    for (const [method, guard] of handlerGuards(code)) targets.push({ key: `${method} ${file}`, file, method, guard, url, params });
  }
  return { targets, routeFiles: files.length };
}

/** Handlers that are public ON PURPOSE, each with the reason. The session route is the
 *  door a credential is made at; imaging-auth.probe names it, server-seam drives its own
 *  guarding (same-origin writes, a verified token before any cookie). */
const PUBLIC: Record<string, string> = {
  "POST app/api/session/route.ts": "exchanges a Firebase ID token for the session cookie: nobody holds a session before it",
  "GET app/api/session/route.ts": "answers whether this browser holds a session: the question a signed-out page asks",
  "PUT app/api/session/route.ts": "enters locally (lib/localEntry.ts): the door to the local owner, granted only on a loopback Host, unmanaged, legacy mode",
  "DELETE app/api/session/route.ts": "signs out: clears the cookie, which needs no credential to forget",
};

// THE FLOOR. A walk that derives the gated set from the declared guard has
// one blind spot: deleting the guard from a handler removes it from the set, and
// the probe shrinks instead of failing (seeded 2026-10-06 on
// foundry/training/[id]/verdicts: 100 passed, 49 handlers walked). So the set
// that exists today is recorded, and a recorded handler that stops declaring the
// guard is a named failure. The set may GROW without touching this list; a
// handler leaves it only by a deliberate edit here, in the same diff that
// changes its gate.
// Phase 6 L70: the v1 set retired with its routes; the four kept file routes moved from
// v1's door to route()'s `access` guard in the same diff that rewrapped them.
const FLOOR: readonly string[] = [
  "GET app/api/articles/[runId]/file/[...path]/route.ts",
  "GET app/api/blob/[sha]/route.ts",
  "HEAD app/api/blob/[sha]/route.ts",
  "GET app/api/events/stream/route.ts",
  "GET app/api/foundry/file/route.ts",
  "GET app/api/import/route.ts",
  "POST app/api/import/route.ts",
  "GET app/api/ledger/route.ts",
  "GET app/api/sound/mv/jobs/[id]/file/route.ts",
  "GET app/api/sound/takes/[id]/file/route.ts",
];

const found = discover();

const guarded = found.targets.filter((t) => t.guard !== "public");

test("walk: the handler set is derived, non-empty, and every handler declares a route() guard", () => {
  console.log(`[access-only] ${found.routeFiles} route files walked, ${found.targets.length} handlers, ${guarded.length} guarded`);
  expect(found.routeFiles, "the walk read no route.ts - the root moved").toBeGreaterThan(0);
  expect(guarded.length, "the walk found no guarded handler").toBeGreaterThan(0);
  expect(found.targets.filter((t) => t.guard === "none").map((t) => t.key), "a handler route() does not wrap").toEqual([]);
  expect(found.targets.filter((t) => t.guard === "public" && !(t.key in PUBLIC)).map((t) => t.key), "public with no stated reason").toEqual([]);
});

test("floor: every handler recorded as access-gated still declares guard: \"access\"", () => {
  const live = new Set(found.targets.filter((t) => t.guard === "access").map((t) => t.key));
  expect(FLOOR.filter((k) => !live.has(k)), "recorded as gated, no longer declares the access guard").toEqual([]);
});

test("public map and skip map: every entry names a handler that still exists, with a real reason", () => {
  const keys = new Map(found.targets.map((t) => [t.key, t.guard]));
  for (const [k, why] of Object.entries(PUBLIC)) {
    expect(keys.get(k), `${k}: no longer a public handler - drop the entry`).toBe("public");
    expect(why.length, `${k}: reason too thin`).toBeGreaterThan(40);
  }
  for (const [k, why] of Object.entries(SKIP)) {
    const file = k.split(" ")[1];
    expect(existsSync(join(process.cwd(), file)), `${k}: route file is gone`).toBe(true);
    expect(keys.has(k), `${k}: no longer a handler - drop the skip`).toBe(true);
    expect(why.length, `${k}: reason too thin`).toBeGreaterThan(40);
  }
});

// A dynamic import() is not rewritten by the runner's tsconfig-paths transform,
// so a route module's own `@/...` imports would not resolve. Map the alias the
// way tsconfig does (`@/*` -> repo root) for the length of this file.
type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const realResolve = mod._resolveFilename;
test.beforeAll(() => {
  mod._resolveFilename = function (request, ...rest) {
    const mapped = request.startsWith("@/") ? join(process.cwd(), request.slice(2)) : request;
    return realResolve.call(this, mapped, ...rest);
  };
});
test.afterAll(() => {
  mod._resolveFilename = realResolve;
});

const POSTURES: [string, (() => void)][] = [
  ["no secret configured", () => delete process.env[ACCESS_SECRET_VAR]],
  ["secret configured, none presented", () => (process.env[ACCESS_SECRET_VAR] = "access-only-probe-secret")],
];

let seq = 0;
for (const t of guarded) {
  if (SKIP[t.key]) continue;
  for (const [posture, arm] of POSTURES) {
    test(`${t.key} -> 401 (${posture})`, async () => {
      delete process.env.NEXT_PUBLIC_DEV_AUTH; // no dev bypass
      process.env.PATH = ""; // nothing a handler might spawn can resolve
      arm();
      __resetRateLimit();
      const loaded = (await import(`../../${t.file}`)) as Record<string, unknown>;
      const handler = loaded[t.method] as ((r: Request, ctx: unknown) => Promise<Response> | Response) | undefined;
      expect(typeof handler, `${t.key}: export missing`).toBe("function");
      const hasBody = t.method !== "GET" && t.method !== "HEAD" && t.method !== "DELETE";
      const req = new Request(t.url, {
        method: t.method,
        headers: { "x-forwarded-for": `10.77.${seq >> 8 & 255}.${seq++ & 255}`, ...(hasBody ? { "content-type": "application/json" } : {}) },
        ...(hasBody ? { body: "{}" } : {}),
      });
      const res = await handler!(req, { params: Promise.resolve(t.params) });
      expect(res.status, `${t.key} did not refuse an uncredentialed caller`).toBe(401);
    });
  }
}
