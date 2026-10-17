// THE FOUR KEPT v1 FILE ROUTES, AT THEIR DOOR (Phase 6 L67).
//
// /api/sound/takes/[id]/file, /api/articles/[runId]/file/[...path], /api/sound/mv/jobs/[id]/file
// and /api/foundry/file outlive the v1 pages: the studio's Board, audio desk and Library point
// an <img>/<audio>/<video>/<iframe> at them. Such an element sends no header, and the studio
// sends no `k=` either - it holds the session cookie, which v1's door (lib/apiAuth.ts
// guardAccessOnly) never read. So each route now asks route()'s guard again when v1's refused
// and nothing was presented. Pinned, per route:
//   - nothing presented, no cookie: 401 (the door still fails closed);
//   - the session cookie alone: past the door (the store's own 404 for an id that is not there);
//   - a WRONG `k` beside a good cookie: 401 - a presented credential is judged alone and never
//     falls through to the cookie (route()'s rule, which the fallback must not loosen);
//   - the right `k`: past the door, as the v1 pages still send it until wave C.
// The bytes (ranges, 416, ETag) are serveFile()'s, pinned by serveFile.test.ts and, per route,
// by the sound-store, mv-queue, foundry-strips and articles-ui probes.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-file-doors-"));
  process.env["SOUND_STORE_DIR"] = p.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = p.join(dir, "ledger.json");
  process.env["ARTICLES_STORE_DIR"] = p.join(dir, "articles");
  process.env["GRAVITONE_STORE_PATH"] = p.join(dir, "kernel.sqlite");
  return dir;
});

import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { SESSION_COOKIE } from "../../app/_server/session.ts";
import { GET as takeFile } from "../../app/api/sound/takes/[id]/file/route.ts";
import { GET as articleFile } from "../../app/api/articles/[runId]/file/[...path]/route.ts";
import { GET as mvFile } from "../../app/api/sound/mv/jobs/[id]/file/route.ts";
import { GET as foundryFile } from "../../app/api/foundry/file/route.ts";
import { installSigner, uninstallSigner, type Signer } from "./tokens.ts";

const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
let signer: Signer;
let cwd: string;

beforeAll(async () => {
  for (const k of ENV) delete process.env[k];
  signer = await installSigner();
  // /api/foundry/file resolves foundry-out/ from the working directory.
  cwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), "gt-file-doors-cwd-")));
});
afterEach(() => {
  __resetRateLimit();
  delete process.env[ACCESS_SECRET_VAR];
});
afterAll(() => {
  const here = process.cwd();
  process.chdir(cwd);
  rmSync(here, { recursive: true, force: true });
  rmSync(ROOT, { recursive: true, force: true });
  uninstallSigner();
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

type Door = { readonly name: string; readonly call: (query: string, headers: Record<string, string>) => Promise<Response> };

const at = (p: string, query: string, headers: Record<string, string>): Request => new Request(`http://127.0.0.1:3255${p}${query === "" ? "" : `${p.includes("?") ? "&" : "?"}${query}`}`, { headers });

const DOORS: readonly Door[] = [
  { name: "take file", call: (q, h) => takeFile(at("/api/sound/takes/st-nobody/file", q, h), { params: Promise.resolve({ id: "st-nobody" }) }) },
  { name: "article file", call: (q, h) => articleFile(at("/api/articles/no-run/file/post/index.html", q, h), { params: Promise.resolve({ runId: "no-run", path: ["post", "index.html"] }) }) },
  { name: "mv file", call: (q, h) => mvFile(at("/api/sound/mv/jobs/mv-nobody/file?kind=video", q, h), { params: Promise.resolve({ id: "mv-nobody" }) }) },
  { name: "foundry file", call: (q, h) => foundryFile(at("/api/foundry/file?run=no-run&path=x.png", q, h)) },
];

describe.each(DOORS)("$name", ({ call }) => {
  it("fails closed: nothing presented and no cookie is 401", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    expect((await call("", {})).status).toBe(401);
  });

  it("admits the studio's session cookie when nothing else was presented", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const r = await call("", { cookie: `${SESSION_COOKIE}=${await signer.sign()}` });
    // Past the door: the store answers for an id it does not hold.
    expect(r.status).not.toBe(401);
    expect([400, 404]).toContain(r.status);
  });

  it("judges a presented `k` alone: a wrong one never falls through to a good cookie", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const r = await call("k=wrong", { cookie: `${SESSION_COOKIE}=${await signer.sign()}` });
    expect(r.status).toBe(401);
  });

  it("refuses an expired cookie", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const r = await call("", { cookie: `${SESSION_COOKIE}=${await signer.sign({ exp: Math.floor(Date.now() / 1000) - 5 })}` });
    expect(r.status).toBe(401);
  });

  it("still admits the right `k`, which the v1 pages send until wave C", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const r = await call("k=right", {});
    expect(r.status).not.toBe(401);
  });
});
