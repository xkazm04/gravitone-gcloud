// THE AGENT DOOR, END TO END BELOW HTTP (app/_server/mcp/): route()'s access guard, the door's own
// narrowing (a presented CLI token, a loopback Origin), the JSON-RPC envelope, and the tools over the
// REAL produce port on a REAL kernel in a temp file. The token is minted in that store and judged by
// the same resolver /api/mcp uses. Where a case needs a priced or a free LIVE receipt, the port's
// receipt verb is replaced at the handler seam (the brief's "injected receipt"): this process runs
// with GRAVITONE_DRY_ONLY=1, so the real port refuses to read a live receipt at all - which is
// itself one case below. Nothing here spends: no worker runs and every injected launch is a spy.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mcp-door-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["FOUNDRY_RUNS_DIR"] = path.join(dir, "runs");
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  for (const k of ["IMAGING_ACCESS_SECRET", "PRINCIPAL_MODE", "NEXT_PUBLIC_DEV_AUTH", "NEXT_PUBLIC_LOCAL_MODE"]) delete process.env[k];
  return dir;
});

import { rmSync } from "node:fs";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ComposerInput, Receipt, ReceiptLine } from "@gt/domain/produce";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueue } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";
import { mintToken } from "@gt/kernel/token";

import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import type { ServerProduce } from "../../app/(studio)/projects/_port/port.ts";
import type { McpDeps } from "../../app/_server/mcp/op.ts";
import { MCP_BODY_CAP, mcpHandler } from "../../app/_server/mcp/rpc.ts";
import { route } from "../../app/_server/route.ts";
import { SESSION_COOKIE } from "../../app/_server/session.ts";
import { installSigner, uninstallSigner } from "./tokens.ts";

const T0 = Date.parse("2026-10-24T09:00:00.000Z");
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const ARTICLE: ComposerInput = { lane: "article", text: "why tape hiss returned", topic: "tape-hiss" };

let store: Store;
let act: string;
let read: string;

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

beforeAll(() => {
  store = must(kernel()).store;
  act = must(store.tx((t) => mintToken(t, { name: "athena", scope: "act" }, OPERATOR))).token;
  read = must(store.tx((t) => mintToken(t, { name: "watcher", scope: "read" }, OPERATOR))).token;
});
afterAll(() => {
  uninstallSigner();
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const real = (): ServerProduce => makeRealProduce({ store: () => ok(store), strips: () => err("unavailable", "no strips in this test"), env: () => process.env, now: () => T0 });

function depsWith(produce: () => ServerProduce = real): McpDeps {
  const none = (): Promise<never> => Promise.reject(new Error("not reached in this test"));
  return { produce, part: none, board: none, library: none, store: () => ok(store) };
}

const door = (deps: McpDeps = depsWith(), mode: "family" | "operation" = "family") => route({ guard: "access", bodyCap: MCP_BODY_CAP }, mcpHandler(deps, mode, "0.1.0"));

type Opts = { readonly bearer?: string; readonly origin?: string; readonly cookie?: string; readonly raw?: string };
let ip = 0;
function post(body: unknown, o: Opts = { bearer: act }): Request {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": `10.9.0.${++ip}` };
  if (o.bearer !== undefined) headers["authorization"] = `Bearer ${o.bearer}`;
  if (o.origin !== undefined) headers["origin"] = o.origin;
  if (o.cookie !== undefined) headers["cookie"] = o.cookie;
  return new Request("http://127.0.0.1:3152/api/mcp", { method: "POST", headers, body: o.raw ?? JSON.stringify(body) });
}

let n = 0;
const call = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } });

type ToolOut = { isError?: boolean; structuredContent: Record<string, unknown>; content: { type: string; text: string }[] };
async function tool(d: ReturnType<typeof door>, name: string, args: unknown, bearer = act): Promise<ToolOut> {
  const r = await d(post(call(name, args), { bearer }));
  expect(r.status).toBe(200);
  const body = (await r.json()) as { result?: ToolOut; error?: unknown };
  expect(body.error).toBeUndefined();
  return body.result as ToolOut;
}

const events = (type: string) => must(queryEvents(store, { type: [type], order: "asc", limit: 500 })).events;

describe("who may speak", () => {
  it("answers no credential 401, as route() does every gated door", async () => {
    const r = await door()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, {}));
    expect(r.status).toBe(401);
  });

  it("refuses a session cookie by name: a person's sign-in is not a named agent", async () => {
    const signer = await installSigner();
    const cookie = `${SESSION_COOKIE}=${await signer.sign()}`;
    const r = await door()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { cookie, origin: "http://127.0.0.1:3152" }));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "refused", detail: "mcp-needs-token", error: "mcp needs a bearer token (pipeline/token.mts mint --scope act)" });
  });

  it("refuses a non-loopback Origin even with a good token, and admits a loopback one", async () => {
    const evil = await door()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { bearer: act, origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    expect(await evil.json()).toMatchObject({ code: "refused", error: "mcp: origin https://evil.example is not this machine" });
    for (const origin of ["http://localhost:3152", "http://127.0.0.1:3152", "http://[::1]:3152"]) expect((await door()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { bearer: act, origin }))).status, origin).toBe(200);
  });
});

describe("the envelope", () => {
  it("negotiates the protocol version and names the server", async () => {
    const init = async (v: string) => ((await (await door()(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v, capabilities: {}, clientInfo: { name: "t", version: "0" } } }))).json()) as { result: Record<string, unknown> }).result;
    expect(await init("2025-06-18")).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gravitone", version: "0.1.0" } });
    expect((await init("1999-01-01"))["protocolVersion"]).toBe("2025-11-25");
    expect(String((await init("2025-03-26"))["instructions"])).toContain("spend request");
  });

  it("answers a notification 202 with no body, and ping {}", async () => {
    const r = await door()(post({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(r.status).toBe(202);
    expect(await r.text()).toBe("");
    expect(await (await door()(post({ jsonrpc: "2.0", id: "p", method: "ping" }))).json()).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
  });

  it("refuses a batch, a body that is not JSON, an unknown method and an unknown tool or op, each with its code", async () => {
    const code = async (r: Response) => ((await r.json()) as { error: { code: number; message: string } }).error;
    expect(await code(await door()(post([{ jsonrpc: "2.0", id: 1, method: "ping" }])))).toEqual({ code: -32600, message: "batch requests are not supported" });
    expect((await code(await door()(post(null, { bearer: act, raw: "{not json" })))).code).toBe(-32700);
    expect((await code(await door()(post({ jsonrpc: "2.0", id: 1, method: "resources/list" })))).code).toBe(-32601);
    expect((await code(await door()(post(call("gt_nothing", {}))))).code).toBe(-32602);
    const op = await code(await door()(post(call("gt_read", { op: "everything" }))));
    expect(op.code).toBe(-32602);
    expect(op.message).toContain("known ops: projects, plan, jobs");
    expect((await code(await door()(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { arguments: {} } })))).code).toBe(-32602);
  });

  it("lists exactly the four family tools", async () => {
    const r = (await (await door()(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).json()) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual(["gt_read", "gt_launch", "gt_job", "gt_spend"]);
  });

  it("answers args its op's door refuses in-band, as the work's error", async () => {
    const out = await tool(door(), "gt_read", { op: "jobs", limit: 1000 });
    expect(out.isError).toBe(true);
    expect(out.structuredContent["code"]).toBe("invalid");
  });
});

describe("scope", () => {
  it("lets a read token read and refuses its write in-band, naming the surface", async () => {
    expect((await tool(door(), "gt_read", { op: "projects" }, read)).isError).toBeUndefined();
    const out = await tool(door(), "gt_job", { op: "cancel", jobId: "nope" }, read);
    expect(out).toMatchObject({ isError: true, structuredContent: { code: "refused", reason: "token-scope" } });
    expect(String(out.structuredContent["detail"])).toContain("gt_job cancel writes, and token watcher has scope read");
  });
});

describe("the live rule", () => {
  const line = (over: Partial<ReceiptLine>): ReceiptLine => ({ key: "write", label: "write", lane: "seat.text", provider: "claude", model: "sonnet", units: 1, seconds: 60, usd: 0, src: "model", queuePos: 1, start: "2026-10-24T09:00:00.000Z", end: "2026-10-24T09:01:00.000Z", ...over });
  const receipt = (lines: ReceiptLine[], token = "rcpt-token-1"): Receipt => ({
    token,
    subject: { kind: "run", lane: "article" },
    mode: "live",
    lines,
    totals: { seconds: 60, usd: lines.reduce((a, l) => a + (l.usd ?? 0), 0), unpriced: lines.filter((l) => l.usd === null).length, src: "model" },
    queuePos: 1,
    etaAt: "2026-10-24T09:01:00.000Z",
    overCeiling: false,
    readAt: "2026-10-24T09:00:00.000Z",
  });
  function seeded(r: Receipt) {
    const launches: unknown[][] = [];
    const base = real();
    const produce: ServerProduce = {
      ...base,
      composerReceipt: () => ok(r),
      launchRun: (...args) => {
        launches.push(args);
        return ok({ kind: "launched", runId: "run-x", jobId: "job-x" });
      },
    };
    return { deps: depsWith(() => produce), launches };
  }

  it("files a priced live run as a spend request and launches nothing", async () => {
    const { deps, launches } = seeded(receipt([line({ provider: "openai", usd: 0.42 })]));
    const before = events("run.launched").length;
    const out = await tool(door(deps), "gt_launch", { op: "composer_run", input: ARTICLE, mode: "live" });
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toMatchObject({ kind: "spend-requested", requestId: expect.stringMatching(/^sr_[0-9a-f]{12}$/), view: expect.stringMatching(/^\/board\/pkt:spend:\d{4}-\d{2}-\d{2}$/) });
    expect(launches).toEqual([]);
    expect(events("run.launched").length).toBe(before);
    const asked = events("spend-request.requested").filter((e) => e.subject.id === out.structuredContent["requestId"]);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.actor).toEqual({ kind: "agent", id: "athena" });
    // ...and the agent reads its own ask back.
    const mine = await tool(door(deps), "gt_spend", { op: "list" });
    expect((mine.structuredContent["requests"] as { id: string }[]).map((x) => x.id)).toContain(out.structuredContent["requestId"]);
    const got = await tool(door(deps), "gt_spend", { op: "get", id: out.structuredContent["requestId"] });
    expect(got.structuredContent["request"]).toMatchObject({ state: "requested", actor: { kind: "agent", id: "athena" }, subject: { kind: "run", input: ARTICLE } });
  });

  it("files a Suno-credit live run too: an unpriced line that is not the seat is spend", async () => {
    const { deps, launches } = seeded(receipt([line({ lane: "box.chrome", provider: "suno", usd: null, unpricedReason: "Suno credits" })]));
    const out = await tool(door(deps), "gt_launch", { op: "composer_run", input: ARTICLE, mode: "live" });
    expect(out.structuredContent["kind"]).toBe("spend-requested");
    expect(launches).toEqual([]);
  });

  it("launches a free live receipt live, as the agent, on that receipt's token", async () => {
    const { deps, launches } = seeded(receipt([line({ lane: "gpu.local", provider: "comfyui", usd: 0 })], "free-token-1"));
    const out = await tool(door(deps), "gt_launch", { op: "composer_run", input: ARTICLE, mode: "live" });
    expect(out.structuredContent).toMatchObject({ kind: "launched", jobId: "job-x", mode: "live", view: "/projects/runs?job=job-x" });
    expect(launches).toEqual([[{ input: ARTICLE, token: "free-token-1", mode: "live" }, { who: "athena", kind: "agent" }]]);
  });

  it("answers a stale token with the fresh receipt and launches nothing", async () => {
    const r = receipt([line({ usd: 0 })], "fresh-token-2");
    const { deps, launches } = seeded(r);
    const out = await tool(door(deps), "gt_launch", { op: "composer_run", input: ARTICLE, mode: "live", token: "older-token-1" });
    expect(out).toMatchObject({ isError: true, structuredContent: { code: "stale", fresh: { token: "fresh-token-2" } } });
    expect(launches).toEqual([]);
  });

  it("refuses a live receipt where this process runs dry only, through the real port", async () => {
    const out = await tool(door(), "gt_launch", { op: "composer_run", input: ARTICLE, mode: "live" });
    expect(out).toMatchObject({ isError: true, structuredContent: { code: "refused" } });
    expect(String(out.structuredContent["detail"])).toContain("GRAVITONE_DRY_ONLY=1");
  });
});

describe("the job acts", () => {
  const LIVE = { kind: "live", arm: { by: OPERATOR, at: "2026-10-24T08:00:00.000Z", reason: "operator armed" } } as const;
  const enq = (id: string, live: boolean) => must(enqueue(store, { id, of: { kind: "run", id: `run-${id}` }, producer: "test", lane: "gpu.local", ...(live ? { mode: LIVE } : {}) }, OPERATOR));

  it("refuses retry and re-route of a live-armed job by name, before the kernel is asked", async () => {
    enq("job-live-1", true);
    const retry = await tool(door(), "gt_job", { op: "retry", jobId: "job-live-1" });
    expect(retry).toMatchObject({ isError: true, structuredContent: { code: "refused", detail: "retry of a live job is the operator's (Runs)" } });
    const reroute = await tool(door(), "gt_job", { op: "reroute", jobId: "job-live-1", option: "anything" });
    expect(reroute).toMatchObject({ isError: true, structuredContent: { code: "refused", reason: "live-job" } });
  });

  it("cancels a job and the ledger names the agent", async () => {
    enq("job-dry-1", false);
    const out = await tool(door(), "gt_job", { op: "cancel", jobId: "job-dry-1" });
    expect(out.structuredContent).toMatchObject({ act: { jobId: "job-dry-1" }, view: "/projects/runs?job=job-dry-1" });
    const cancelled = events("job.cancelled").filter((e) => e.subject.id === "job-dry-1");
    expect(cancelled.map((e) => e.actor)).toEqual([{ kind: "agent", id: "athena" }]);
  });

  it("answers one op byte-identically in both projections", async () => {
    enq("job-dry-2", false);
    const fam = await tool(door(depsWith(), "family"), "gt_read", { op: "jobs", limit: 10 });
    const op = await tool(door(depsWith(), "operation"), "gt_read_jobs", { limit: 10 });
    expect(JSON.stringify(op.structuredContent)).toBe(JSON.stringify(fam.structuredContent));
    expect(op.content[0]?.text).toBe(fam.content[0]?.text);
  });
});
