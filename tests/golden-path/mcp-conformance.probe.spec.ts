// LANE - MCP CONFORMANCE (spark athena-control-mcp). The door at POST /api/mcp is hand-rolled
// JSON-RPC (app/_server/mcp/rpc.ts; no SDK at runtime, the operator's decision). This probe holds
// it to the protocol as a real client speaks it: the official SDK's Client over its
// StreamableHTTPClientTransport (@modelcontextprotocol/sdk 1.32.2, a devDependency imported here
// and nowhere else) completes initialize, lists the tools and calls one.
//
// HOW IT REACHES THE ROUTE: through a minimal fetch shim, not a server. The transport takes a
// `fetch`; the shim hands a POST to the route module's own exported `POST` (the very handler Next
// mounts, route() guard and all) as a Request, and answers any other method 405 - what Next answers
// for a method a route file does not export, and what the SDK reads as "no SSE stream offered".
// The kernel store is a temp file and the act token is minted in it, so the bearer is judged by the
// same resolver as in production. Nothing reaches the network (the lane's seal) and nothing spends
// (GRAVITONE_DRY_ONLY=1; the one call is a read).

import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { keepEnv } from "./_helpers";

type TokenMod = typeof import("@gt/kernel/token");
type KernelMod = typeof import("@/lib/kernelStore");
type RouteMod = typeof import("../../app/api/mcp/route.ts");

const dir = mkdtempSync(join(tmpdir(), "gt-mcp-conformance-"));
const URL0 = "http://127.0.0.1:3152/api/mcp";
keepEnv(["GRAVITONE_STORE_PATH", "GRAVITONE_DRY_ONLY", "GRAVITONE_MCP_PROJECTION", "IMAGING_ACCESS_SECRET", "PRINCIPAL_MODE", "NEXT_PUBLIC_DEV_AUTH"]);

// A dynamic import() is not rewritten by the runner's tsconfig-paths transform (access-only-401's note).
type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const realResolve = mod._resolveFilename;

let km: KernelMod;
let POST: RouteMod["POST"];
let token = "";

test.beforeAll(async () => {
  mod._resolveFilename = function (request, ...rest) {
    return realResolve.call(this, request.startsWith("@/") ? join(process.cwd(), request.slice(2)) : request, ...rest);
  };
  process.env.GRAVITONE_STORE_PATH = join(dir, "kernel.sqlite");
  process.env.GRAVITONE_DRY_ONLY = "1";
  delete process.env.GRAVITONE_MCP_PROJECTION; // the default projection: family
  delete process.env.IMAGING_ACCESS_SECRET;
  delete process.env.PRINCIPAL_MODE;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  const tk: TokenMod = await import("@gt/kernel/token");
  km = await import("../../lib/kernelStore.ts");
  const k = km.kernel();
  if (!k.ok) throw new Error(k.error.message);
  const minted = k.value.store.tx((t) => tk.mintToken(t, { name: "athena", scope: "act" }, { kind: "operator", id: "probe" }));
  if (!minted.ok) throw new Error(minted.error.message);
  token = minted.value.token;
  POST = (await import("../../app/api/mcp/route.ts")).POST;
});
test.afterAll(() => {
  mod._resolveFilename = realResolve;
  km?.closeKernel();
  rmSync(dir, { recursive: true, force: true });
});

/** The shim: a POST goes to the route's handler; any other method is Next's 405 for an unexported one. */
const seen: string[] = [];
async function shim(url: string | URL, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  seen.push(method);
  if (method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  return POST(new Request(url, init));
}

test("the SDK client initializes, lists the four family tools and calls gt_read projects", async () => {
  const transport = new StreamableHTTPClientTransport(new URL(URL0), { fetch: shim, requestInit: { headers: { authorization: `Bearer ${token}` } } });
  const client = new Client({ name: "conformance-probe", version: "0.0.0" });
  await client.connect(transport);
  try {
    expect(client.getServerVersion()).toMatchObject({ name: "gravitone" });
    expect(client.getServerCapabilities()).toMatchObject({ tools: { listChanged: false } });
    expect(client.getInstructions()).toContain("spend request");

    const { tools } = await client.listTools();
    console.log(`[mcp] tools/list -> ${tools.map((t) => t.name).join(", ")}`);
    expect(tools.map((t) => t.name)).toEqual(["gt_read", "gt_launch", "gt_job", "gt_spend"]);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");

    const r = await client.callTool({ name: "gt_read", arguments: { op: "projects" } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ projects: [], truncated: false });
    expect(r.content).toEqual([{ type: "text", text: JSON.stringify(r.structuredContent) }]);

    await expect(client.ping()).resolves.toEqual({});
  } finally {
    await client.close();
  }
  // The client asked for an SSE stream once (a GET) and took the 405 as "none offered".
  expect(seen.filter((m) => m === "POST").length).toBeGreaterThanOrEqual(4);
});

test("the client is refused without the bearer: 401 from route()'s guard", async () => {
  const transport = new StreamableHTTPClientTransport(new URL(URL0), { fetch: shim });
  const client = new Client({ name: "conformance-probe", version: "0.0.0" });
  // The SDK's StreamableHTTPError carries the HTTP status as its `code`.
  await expect(client.connect(transport)).rejects.toMatchObject({ code: 401, message: expect.stringContaining('"code":"unauthenticated"') });
});
