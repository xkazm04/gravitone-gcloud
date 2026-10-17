// THE ARTICLE FILE ROUTE, PAST ITS DOOR (Phase 6 L70).
//
// /api/articles/<runId>/file/<path> outlived the /articles pages: the Board's article packet
// (lib/decision/v1/sources/article.ts) frames the drafted post from it. Its door is pinned with
// the other three kept file routes in file-doors.test.ts; what is pinned here is what it serves,
// carried over from the retired articles-ui probe (case 7) when the pages and the seven JSON
// routes beside it were deleted:
//   - the post goes out under a CSP that loads nothing from the network and runs no script, and
//     an SVG figure the same way - the post was written by a model that read the open web;
//   - nothing outside post/, check/ and medium/ is served: not run.json, not the agent's
//     prompts, not landing.log, and not a `..` or a backslash that would resolve outside;
//   - the post is served byte-for-byte: v1 rewrote every relative src/href to carry `?k=`
//     (carryKey), which went with the query credential, so a `k` on the URL changes nothing.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-article-file-"));
  process.env["ARTICLES_STORE_DIR"] = p.join(dir, "articles");
  process.env["GRAVITONE_STORE_PATH"] = p.join(dir, "kernel.sqlite");
  return dir;
});

import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { runDir } from "../../lib/articles/store.ts";
import { GET as articleFile } from "../../app/api/articles/[runId]/file/[...path]/route.ts";

const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const RUN = "2026-10-17-file-door";
const POST = '<html><body><img src="figures/01.svg"><a href="#src-1">x</a></body></html>';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  const dir = runDir(RUN);
  mkdirSync(path.join(dir, "post", "figures"), { recursive: true });
  mkdirSync(path.join(dir, "agent"), { recursive: true });
  writeFileSync(path.join(dir, "post", "index.html"), POST);
  writeFileSync(path.join(dir, "post", "figures", "01.svg"), SVG);
  writeFileSync(path.join(dir, "run.json"), "{}");
  writeFileSync(path.join(dir, "landing.log"), "pushed");
  writeFileSync(path.join(dir, "agent", "draft-prompt.md"), "the prompt");
});
afterEach(() => __resetRateLimit());
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const get = (rel: string, query = ""): Promise<Response> => {
  process.env[ACCESS_SECRET_VAR] = "right";
  const req = new Request(`http://127.0.0.1:3262/api/articles/${RUN}/file/${rel}${query}`, { headers: { authorization: "Bearer right" } });
  return articleFile(req, { params: Promise.resolve({ runId: RUN, path: rel.split("/") }) });
};

describe("the article file route", () => {
  it("serves the post as HTML under a no-network, no-script CSP", async () => {
    const r = await get("post/index.html");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/html/);
    expect(r.headers.get("content-security-policy")).toMatch(/default-src 'none'.*sandbox/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves an SVG figure under the same CSP, so its script cannot run", async () => {
    const r = await get("post/figures/01.svg");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/svg+xml");
    expect(r.headers.get("content-security-policy")).toMatch(/default-src 'none'.*sandbox/);
  });

  it("serves nothing outside post/, check/ and medium/", async () => {
    for (const rel of ["run.json", "landing.log", "agent/draft-prompt.md", "post/../run.json", "post/..\\run.json", "post//index.html", "post/./index.html"]) {
      expect((await get(rel)).status, rel).toBe(404);
    }
  });

  it("answers a served path with no file as the store's 404, naming the run", async () => {
    const r = await get("post/nothing.svg");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain(RUN);
  });

  it("serves the post byte-for-byte: a `k` on the URL no longer rewrites it", async () => {
    const r = await get("post/index.html", "?k=right");
    expect(await r.text()).toBe(POST);
  });

  it("refuses a run id that is not one, with the store's own code", async () => {
    process.env[ACCESS_SECRET_VAR] = "right";
    const req = new Request("http://127.0.0.1:3262/api/articles/BAD_ID/file/post/index.html", { headers: { authorization: "Bearer right" } });
    const r = await articleFile(req, { params: Promise.resolve({ runId: "BAD_ID", path: ["post", "index.html"] }) });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "bad-id" });
  });
});
