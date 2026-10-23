// THE ARTICLE MEDIUM ROUTE, PAST ITS DOOR (POST /api/articles/<runId>/medium).
//
// The gate's private Medium draft is made when a run reaches `awaiting-approval` and made again
// here, on the operator's ask. The route drives a signed-in Medium account, so it is on route()'s
// `money` guard; what the engine behind it answers is pinned by articles-medium.probe.spec.ts.
// Pinned here is the door and the route's own mapping of the engine's refusals:
//   - no credential: 401, and the engine is never reached (no run is read);
//   - past the door, a run that is not there: the store's 404 `not-found`, in the store's sentence;
//   - a run that is not at the gate: 409 `bad-transition`;
//   - a run at the gate with MEDIUM_DRIVER unset (off): the run comes back untouched, no draft
//     recorded - a probe or a CI run never reaches an account;
//   - MEDIUM_DRIVER=fake: the draft is recorded `ready` on the run.json, a second call replaces the
//     same draft (the url is kept), and the draft names nothing it could publish.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "gt-article-medium-"));
  process.env["ARTICLES_STORE_DIR"] = p.join(dir, "articles");
  process.env["GRAVITONE_STORE_PATH"] = p.join(dir, "kernel.sqlite");
  return dir;
});

import { ACCESS_SECRET_VAR, __resetRateLimit } from "../../lib/apiAuth.ts";
import { runDir } from "../../lib/articles/store.ts";
import { POST as medium } from "../../app/api/articles/[runId]/medium/route.ts";

const ENV = [ACCESS_SECRET_VAR, "PRINCIPAL_MODE", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE", "MEDIUM_DRIVER"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const GATED = "2026-10-19-medium-gate";
const WORKING = "2026-10-19-medium-working";

const run = (id: string, status: string) => ({
  id,
  status,
  topic: { kind: "free", text: "A Medium draft" },
  promptRef: { file: "pipeline/ARTICLE-POST-PROMPT.md", sha: "x" },
  standard: { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: [] },
  model: "claude-opus-x",
  effort: "high",
  steps: [],
  createdAt: "2026-10-19T08:00:00.000Z",
  updatedAt: "2026-10-19T08:00:00.000Z",
});

const MD = "# A Medium draft\n\nOne paragraph of the post, long enough to be a paragraph.\n\n## The section\n\nAnother paragraph.\n";
const META = { title: "A Medium draft", subtitle: "A subtitle", tags: ["a"] };

beforeAll(() => {
  for (const k of ENV) delete process.env[k];
  for (const [id, status] of [[GATED, "awaiting-approval"], [WORKING, "drafting"]] as const) {
    const dir = runDir(id);
    mkdirSync(path.join(dir, "post"), { recursive: true });
    writeFileSync(path.join(dir, "run.json"), JSON.stringify(run(id, status)));
    writeFileSync(path.join(dir, "post", "post.md"), MD);
    writeFileSync(path.join(dir, "post", "index.html"), "<html><body><h1>A Medium draft</h1></body></html>");
    writeFileSync(path.join(dir, "post", "meta.json"), JSON.stringify(META));
  }
});
afterEach(() => {
  __resetRateLimit();
  delete process.env["MEDIUM_DRIVER"];
});
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const k of ENV) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const post = (id: string, authed = true): Promise<Response> => {
  process.env[ACCESS_SECRET_VAR] = "right";
  const req = new Request(`http://127.0.0.1:3262/api/articles/${id}/medium`, { method: "POST", headers: authed ? { authorization: "Bearer right" } : {} });
  return medium(req, { params: Promise.resolve({ runId: id }) });
};
const stored = (id: string): { mediumDraft?: { state: string; url?: string } } => JSON.parse(readFileSync(path.join(runDir(id), "run.json"), "utf8"));

describe("POST /api/articles/<runId>/medium", () => {
  it("refuses a caller with no credential before it reads any run", async () => {
    const r = await post(GATED, false);
    expect(r.status).toBe(401);
    expect(stored(GATED).mediumDraft).toBeUndefined();
  });

  it("answers a run that is not there with the store's 404", async () => {
    const r = await post("2026-10-19-no-such-run");
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ code: "not-found", error: "no article run called 2026-10-19-no-such-run" });
  });

  it("refuses a run that is not at the gate with 409 bad-transition", async () => {
    const r = await post(WORKING);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "bad-transition" });
    expect(stored(WORKING).mediumDraft).toBeUndefined();
  });

  it("with MEDIUM_DRIVER unset makes no draft: the run comes back as it was", async () => {
    const r = await post(GATED);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { run: { mediumDraft?: unknown } }).run.mediumDraft).toBeUndefined();
    expect(stored(GATED).mediumDraft).toBeUndefined();
  });

  it("with the fake driver records a ready draft, and a second call replaces the same one", async () => {
    process.env["MEDIUM_DRIVER"] = "fake";
    const first = await post(GATED);
    expect(first.status).toBe(200);
    const made = stored(GATED).mediumDraft;
    expect(made?.state, JSON.stringify(made)).toBe("ready");
    expect(made?.url).toMatch(/^https:\/\/medium\.com\//);
    const again = await post(GATED);
    expect(again.status).toBe(200);
    expect(stored(GATED).mediumDraft).toMatchObject({ state: "ready", url: made?.url });
  });
});
