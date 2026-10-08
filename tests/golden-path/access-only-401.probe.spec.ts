// LANE — EVERY guardAccessOnly HANDLER IS DRIVEN FOR 401 (dynamic, derived).
//
// `guardAccessOnly` gates the routes that read or write local state without
// taking the spend bucket: foundry, sound, publish, ads/articles reads, file
// downloads. Before this probe, 13 of 14 foundry routes (and most of the rest)
// were asserted gated only by a source match (client-api-auth), or by the few
// handlers imaging-auth / foundry-routes / articles-ui happened to import. A
// handler whose guard line is deleted, or moved below a side effect, stayed
// green.
//
// The set is WALKED, never listed: every `route.ts` under app/api is read, its
// comments stripped, and each exported HTTP-method handler whose own body calls
// `guardAccessOnly(` is imported and invoked as a plain function with NO
// credentials. Two postures are driven: no secret configured (fails closed) and
// a secret configured but not presented (missing). Both must be 401.
//
// Nothing here can spend: the guard is the first act, and a handler that got
// past it would be a defect this probe reports by name.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";

import { keepEnv, stripComments } from "./_helpers";

const ROOT = join(process.cwd(), "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
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
  url: string;
  params: Record<string, string | string[]>;
}

/** Text of each exported handler: from its `export` to the next column-0 `}`. */
function handlerBodies(code: string): Map<Method, string> {
  const out = new Map<Method, string>();
  for (const m of METHODS) {
    const re = new RegExp(String.raw`^export\s+(?:async\s+)?(?:function\s+${m}\b|const\s+${m}\b)`, "m");
    const hit = re.exec(code);
    if (!hit) continue;
    const rest = code.slice(hit.index);
    const end = rest.search(/\r?\n}/);
    out.set(m, end < 0 ? rest : rest.slice(0, end));
  }
  return out;
}

function discover(): { targets: Target[]; routeFiles: number; unattributed: string[] } {
  const targets: Target[] = [];
  const unattributed: string[] = [];
  const files = walk(ROOT);
  for (const abs of files) {
    const file = abs.slice(process.cwd().length + 1).split("\\").join("/");
    const code = stripComments(readFileSync(abs, "utf8"));
    if (!/guardAccessOnly\s*\(/.test(code)) continue;
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
    let attributed = 0;
    for (const [method, body] of handlerBodies(code)) {
      if (!/guardAccessOnly\s*\(/.test(body)) continue;
      attributed++;
      targets.push({ key: `${method} ${file}`, file, method, url, params });
    }
    if (!attributed) unattributed.push(file);
  }
  return { targets, routeFiles: files.length, unattributed };
}

// THE FLOOR. A walk that derives the gated set from "calls guardAccessOnly" has
// one blind spot: deleting the guard from a handler removes it from the set, and
// the probe shrinks instead of failing (seeded 2026-10-06 on
// foundry/training/[id]/verdicts: 100 passed, 49 handlers walked). So the set
// that exists today is recorded, and a recorded handler that stops calling the
// guard is a named failure. The set may GROW without touching this list; a
// handler leaves it only by a deliberate edit here, in the same diff that
// changes its gate.
const FLOOR: readonly string[] = [
  "GET app/api/ads/render/[id]/file/route.ts",
  "GET app/api/ads/render/[id]/route.ts",
  "GET app/api/articles/route.ts",
  "GET app/api/articles/[runId]/file/[...path]/route.ts",
  "POST app/api/articles/[runId]/reject/route.ts",
  "GET app/api/articles/[runId]/route.ts",
  "GET app/api/cut/export/file/route.ts",
  "GET app/api/foundry/extract/route.ts",
  "GET app/api/foundry/extract/[id]/commit/route.ts",
  "POST app/api/foundry/extract/[id]/commit/route.ts",
  "GET app/api/foundry/extract/[id]/route.ts",
  "PUT app/api/foundry/extract/[id]/verdicts/route.ts",
  "GET app/api/foundry/file/route.ts",
  "GET app/api/foundry/runs/route.ts",
  "GET app/api/foundry/runs/[id]/commit/route.ts",
  "POST app/api/foundry/runs/[id]/commit/route.ts",
  "GET app/api/foundry/runs/[id]/route.ts",
  "PUT app/api/foundry/runs/[id]/verdicts/route.ts",
  "GET app/api/foundry/styles/route.ts",
  "GET app/api/foundry/training/route.ts",
  "POST app/api/foundry/training/[id]/commit/route.ts",
  "GET app/api/foundry/training/[id]/route.ts",
  "PUT app/api/foundry/training/[id]/verdicts/route.ts",
  "GET app/api/imaging/budget/route.ts",
  "GET app/api/music-video/export/file/route.ts",
  "GET app/api/publish/channels/route.ts",
  "GET app/api/publish/exports/route.ts",
  "POST app/api/publish/metrics/refresh/route.ts",
  "GET app/api/publish/metrics/route.ts",
  "GET app/api/publish/schedule/route.ts",
  "POST app/api/publish/schedule/route.ts",
  "PATCH app/api/publish/schedule/[id]/route.ts",
  "DELETE app/api/publish/schedule/[id]/route.ts",
  "GET app/api/sound/groups/route.ts",
  "PUT app/api/sound/groups/route.ts",
  "GET app/api/sound/hunts/route.ts",
  "PATCH app/api/sound/hunts/[id]/route.ts",
  "GET app/api/sound/insights/route.ts",
  "GET app/api/sound/lessons/route.ts",
  "POST app/api/sound/lessons/route.ts",
  "GET app/api/sound/takes/route.ts",
  "POST app/api/sound/takes/route.ts",
  "DELETE app/api/sound/takes/route.ts",
  "GET app/api/sound/takes/[id]/file/route.ts",
  "PATCH app/api/sound/takes/[id]/route.ts",
  "GET app/api/spend/route.ts",
  "POST app/api/turns/[id]/cancel/route.ts",
  "GET app/api/turns/[id]/route.ts",
  "GET app/api/video/clips/route.ts",
  "GET app/api/video/clips/[id]/file/route.ts",
  "GET app/api/video/clips/[id]/route.ts",
];

const found = discover();

test("walk: the gated-handler set is derived, non-empty, and fully attributed to a method", () => {
  console.log(`[access-only] ${found.routeFiles} route files walked, ${found.targets.length} guardAccessOnly handlers`);
  expect(found.routeFiles, "the walk read no route.ts - the root moved").toBeGreaterThan(0);
  expect(found.targets.length, "the walk found no guardAccessOnly handler").toBeGreaterThan(0);
  expect(found.unattributed, "guardAccessOnly appears in a route file but in no exported handler body").toEqual([]);
});

test("floor: every handler recorded as access-gated still calls guardAccessOnly", () => {
  const live = new Set(found.targets.map((t) => t.key));
  expect(FLOOR.filter((k) => !live.has(k)), "recorded as gated, no longer calls guardAccessOnly").toEqual([]);
});

test("skip map: every entry names a handler that still exists, with a real reason", () => {
  const keys = new Set(found.targets.map((t) => t.key));
  for (const [k, why] of Object.entries(SKIP)) {
    const file = k.split(" ")[1];
    expect(existsSync(join(process.cwd(), file)), `${k}: route file is gone`).toBe(true);
    expect(keys.has(k), `${k}: no longer a guardAccessOnly handler - drop the skip`).toBe(true);
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
for (const t of found.targets) {
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
      const hasBody = t.method !== "GET" && t.method !== "DELETE";
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
