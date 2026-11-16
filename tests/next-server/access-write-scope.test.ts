// AN ACCESS WRITE IS AN `act` (gt-authz, operator verdict 2026-11-11). route()'s "access" guard
// fronts reads (file bytes, the ledger, the event stream) and writes (cover uploads, take saves,
// /api/import, /api/suno/connect DELETE). A write needs a token whose scope admits `act` and a
// sign-in verified against a key set the server could confirm; a read keeps the read token and the
// stale-JWKS grace. The token is minted in a real kernel in a temp file and judged by the resolver
// every route uses; the JWKS is the stub tests/next-server/tokens.ts serves, taken down mid-test.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-access-write-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  for (const k of ["IMAGING_ACCESS_SECRET", "PRINCIPAL_MODE", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"]) delete process.env[k];
  return dir;
});

import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ok, type Result } from "@gt/domain/errors";
import { mintToken } from "@gt/kernel/token";

import { __resetRateLimit } from "../../lib/apiAuth.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { __setJwksFetch } from "../../lib/principal.ts";
import { route } from "../../app/_server/route.ts";
import { SESSION_COOKIE } from "../../app/_server/session.ts";
import { installSigner, uninstallSigner, type Signer } from "./tokens.ts";

const OPERATOR = { kind: "operator", id: "operator" } as const;
const ORIGIN = "http://127.0.0.1:3181";
const HOUR = 3_600_000;

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

let signer: Signer;
let readToken: string;
let actToken: string;

beforeAll(async () => {
  signer = await installSigner();
  const store = must(kernel()).store;
  readToken = must(store.tx((t) => mintToken(t, { name: "watcher", scope: "read" }, OPERATOR))).token;
  actToken = must(store.tx((t) => mintToken(t, { name: "athena", scope: "act" }, OPERATOR))).token;
});
afterEach(() => {
  __resetRateLimit();
  delete process.env["PRINCIPAL_MODE"];
  vi.restoreAllMocks();
});
afterAll(() => {
  uninstallSigner();
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const readRoute = route({ guard: "access", bodyCap: 0 }, async ({ who }) => ok({ kind: who?.kind }));
const writeRoute = route({ guard: "access", bodyCap: 100 }, async ({ who }) => ok({ kind: who?.kind, wrote: true }));

let ip = 0;
function at(method: "GET" | "POST", headers: Record<string, string>): Request {
  return new Request(`${ORIGIN}/api/thing`, { method, headers: { origin: ORIGIN, host: "127.0.0.1:3181", "x-forwarded-for": `10.44.0.${++ip}`, ...headers } });
}
const detail = async (r: Response): Promise<unknown> => ((await r.json()) as { detail?: unknown }).detail;

describe("a read-scope token", () => {
  it("is refused on an access write (403 token-scope) and still reads", async () => {
    const write = await writeRoute(at("POST", { authorization: `Bearer ${readToken}` }));
    expect(write.status).toBe(403);
    expect(await detail(write)).toBe("token-scope");
    const read = await readRoute(at("GET", { authorization: `Bearer ${readToken}` }));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ kind: "cli-token" });
  });

  it("an act token writes", async () => {
    const write = await writeRoute(at("POST", { authorization: `Bearer ${actToken}` }));
    expect(write.status).toBe(200);
    expect(await write.json()).toEqual({ kind: "cli-token", wrote: true });
  });
});

describe("a sign-in verified only against a stale key set", () => {
  // The key set is fetched two hours ago (max-age 3600), then Google goes away: the cached set is
  // past its life and cannot be refreshed. A read may lean on it for a day; a write may not.
  async function staleKeys(): Promise<string> {
    const t0 = Date.now() - 2 * HOUR;
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    signer = await installSigner();
    const warm = await readRoute(at("GET", { cookie: `${SESSION_COOKIE}=${await signer.sign()}` }));
    expect(warm.status).toBe(200);
    now.mockRestore();
    __setJwksFetch(async () => {
      throw new TypeError("fetch failed (test: JWKS outage)");
    });
    return signer.sign();
  }

  it("is refused on an access write (503 jwks-unavailable) and still reads - the session cookie", async () => {
    const cookie = `${SESSION_COOKIE}=${await staleKeys()}`;
    const read = await readRoute(at("GET", { cookie }));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ kind: "firebase" });
    const write = await writeRoute(at("POST", { cookie }));
    expect(write.status).toBe(503);
    expect(await detail(write)).toBe("jwks-unavailable");
    signer = await installSigner();
  });

  it("is refused on an access write and still reads - a presented ID token in verified mode", async () => {
    process.env["PRINCIPAL_MODE"] = "verified";
    const authorization = `Bearer ${await staleKeys()}`;
    expect((await readRoute(at("GET", { authorization }))).status).toBe(200);
    const write = await writeRoute(at("POST", { authorization }));
    expect(write.status).toBe(503);
    expect(await detail(write)).toBe("jwks-unavailable");
    signer = await installSigner();
  });
});

describe("the per-op door", () => {
  it("is /api/mcp alone: every other access write is guarded as an act", () => {
    const app = join(import.meta.dirname, "../../app");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && readFileSync(p, "utf8").includes("perOpScope: true")) files.push(relative(app, p).replaceAll("\\", "/"));
      }
    };
    walk(app);
    expect(files).toEqual(["api/mcp/route.ts"]);
  });
});
