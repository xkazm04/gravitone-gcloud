import "server-only";

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { ProjectionMode } from "@gt/domain/mcp";

import type { Principal } from "../../../lib/principal.ts";
import { asAppError, envelope, publicError, readJson } from "../http.ts";
import type { McpDeps, Obj } from "./op.ts";
import { agentOf, mayAct, originRefusal, type Agent } from "./principal.ts";
import { resolveCall, toolNameOf, toolsOf } from "./projection.ts";

// THE JSON-RPC ENVELOPE of /api/mcp (MCP Streamable HTTP, stateless; hand-rolled by the operator's
// decision - no SDK at runtime). One request per POST, answered `application/json`; no session, no
// SSE stream, no server-to-client request, so a GET is Next's 405 and nothing is resumable.
//
//   initialize       the client's protocol version when it is one of SUPPORTED, else the newest
//   notifications/*  202, no body (as is any message without an id: a notification is not answered)
//   ping             {}
//   tools/list       every tool of the projection (./projection.ts), in one page
//   tools/call       resolved to one registry row, judged (scope, then the op's own door), run
//
// TWO ERROR CHANNELS. What is wrong with the MESSAGE - not JSON (-32700), not a request or a batch
// (-32600), an unknown method (-32601), params the envelope refuses or a tool/op nobody publishes
// (-32602) - is a JSON-RPC error. What is wrong with the WORK - a door refusing the args, a stale
// receipt, a conflict, a refusal, a missing project - is a tool result with `isError: true` and
// `{code, detail, fresh?}`, so the model reads it and decides again (MCP: tool execution errors).

export const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const LATEST = SUPPORTED[0];

/** The server's one standing sentence to the model. */
export const INSTRUCTIONS =
  "Runs launch dry, or live when the recomputed receipt is free; any other live launch is filed as a spend request the operator confirms or refuses on /board/pkt:spend:<day>, and nothing spends.";

export type RpcContext = { readonly agent: Agent; readonly deps: McpDeps; readonly mode: ProjectionMode; readonly version: string };

const rpcId = z.union([z.string(), z.number()]);
const message = z.object({ jsonrpc: z.literal("2.0"), id: rpcId.nullable().optional(), method: z.string().min(1).optional(), params: z.unknown().optional() });
const initializeParams = z.looseObject({ protocolVersion: z.string() });
const callParams = z.looseObject({ name: z.string().min(1), arguments: z.record(z.string(), z.unknown()).optional() });
const listParams = z.looseObject({ cursor: z.string().optional() }).optional();

type Id = z.output<typeof rpcId> | null;

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const answer = (id: Id, result: unknown): Response => json({ jsonrpc: "2.0", id, result });
export const rpcError = (id: Id, code: number, msg: string, status = 200): Response => json({ jsonrpc: "2.0", id, error: { code, message: msg } }, status);
const accepted = (): Response => new Response(null, { status: 202 });

/** A tool result, both ways: the JSON text a model reads and the structured value a client parses. */
function toolResult(value: Obj, isError = false): Obj {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) };
}

function toolError(e: AppError, where: string, extra: Obj = {}): Obj {
  const pub = publicError(e, where);
  return toolResult({ code: pub.code, detail: pub.error, ...(pub.detail === undefined ? {} : { reason: pub.detail }), ...extra }, true);
}

/** A port's answer as a tool result: a stale confirm is the work's error, carrying the fresh receipt. */
function fromResult(r: Result<Obj>, where: string): Obj {
  if (!r.ok) return toolError(r.error, where);
  const v = r.value;
  if (v["kind"] === "stale" && "fresh" in v) return toolError(new AppError("conflict", "the receipt moved since it was read; nothing launched - confirm the fresh receipt"), where, { code: "stale", fresh: v["fresh"] });
  return toolResult(v);
}

async function callTool(ctx: RpcContext, id: Id, params: unknown): Promise<Response> {
  const p = callParams.safeParse(params);
  if (!p.success) return rpcError(id, -32602, `tools/call: params need {name, arguments?}: ${p.error.issues[0]?.message ?? "invalid"}`);
  const resolved = resolveCall(ctx.mode, p.data.name, p.data.arguments);
  if (!resolved.ok) return rpcError(id, -32602, resolved.message);
  const { spec } = resolved;
  const where = `mcp ${toolNameOf(ctx.mode, spec)}`;
  if (spec.writes && !mayAct(ctx.agent)) {
    const e = new AppError("refused", `${toolNameOf(ctx.mode, spec)} writes, and token ${ctx.agent.name} has scope ${ctx.agent.scope}: mint one with pipeline/token.mts mint --scope act`, { detail: "token-scope" });
    return answer(id, toolError(e, where));
  }
  const args = parseAt(where, spec.input, resolved.args);
  if (!args.ok) return answer(id, toolError(args.error, where));
  try {
    return answer(id, fromResult(await spec.run(args.value, { agent: ctx.agent, deps: ctx.deps }), where));
  } catch (e) {
    return answer(id, toolError(asAppError(e), where));
  }
}

/** One JSON-RPC message (already parsed from JSON), answered. */
export async function answerRpc(body: unknown, ctx: RpcContext): Promise<Response> {
  if (Array.isArray(body)) return rpcError(null, -32600, "batch requests are not supported", 400);
  const m = message.safeParse(body);
  if (!m.success) return rpcError(null, -32600, `not a JSON-RPC 2.0 request: ${m.error.issues[0]?.message ?? "invalid"}`, 400);
  const { id, method, params } = m.data;
  // A notification, or a client's response to a request this server never makes: not answered.
  if (id === undefined || method === undefined) return method === undefined && id === undefined ? rpcError(null, -32600, "a request names a method", 400) : accepted();
  if (method.startsWith("notifications/")) return accepted();
  switch (method) {
    case "initialize": {
      const p = initializeParams.safeParse(params);
      if (!p.success) return rpcError(id, -32602, "initialize: params need {protocolVersion}");
      const asked = p.data.protocolVersion;
      const protocolVersion = (SUPPORTED as readonly string[]).includes(asked) ? asked : LATEST;
      return answer(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gravitone", version: ctx.version }, instructions: INSTRUCTIONS });
    }
    case "ping":
      return answer(id, {});
    case "tools/list": {
      if (!listParams.safeParse(params).success) return rpcError(id, -32602, "tools/list: params are {cursor?}");
      return answer(id, { tools: toolsOf(ctx.mode) });
    }
    case "tools/call":
      return callTool(ctx, id, params);
    default:
      return rpcError(id, -32601, `method "${method}" is not offered (initialize, ping, tools/list, tools/call)`);
  }
}

/** The most body bytes one message may carry. */
export const MCP_BODY_CAP = 262_144;

type HandlerInput = { readonly req: Request; readonly who: Principal | null };

/**
 * The route handler (app/api/mcp/route.ts), after route()'s guard: the Origin, then the principal,
 * then the body, then the message. A body route() would refuse for size keeps route()'s envelope;
 * a body that is not JSON is JSON-RPC's -32700.
 */
export function mcpHandler(deps: McpDeps, mode: ProjectionMode, version: string): (ctx: HandlerInput) => Promise<Response> {
  return async ({ req, who }) => {
    const where = "POST /api/mcp";
    const foreign = originRefusal(req);
    if (foreign !== undefined) return envelope(foreign, where);
    const a = agentOf(who);
    if (!a.ok) return envelope(a.error, where);
    const body = await readJson(req, MCP_BODY_CAP, z.unknown(), where);
    if (!body.ok) return body.error.detail === "body-too-large" ? envelope(body.error, where) : rpcError(null, -32700, `parse error: ${body.error.message}`, 400);
    return answerRpc(body.value, { agent: a.agent, deps, mode, version });
  };
}
