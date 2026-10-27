// POST /api/mcp - the agent door (spark athena-control-mcp): a stateless MCP server over
// Streamable HTTP, JSON-RPC by hand (app/_server/mcp/rpc.ts), its tools one registry
// (app/_server/mcp/registry.ts) whose handlers are the studio's own server ports. Docs: docs/mcp.md.
//
// Access-guarded, and then narrower (app/_server/mcp/principal.ts): only a presented CLI token
// (`node pipeline/token.mts mint --name athena --scope act`) speaks here, a browser Origin must be
// this machine, and every write op asks the token's scope for `act`. No GET: there is no SSE stream
// to listen on, and Next answers the method 405.

import pkg from "../../../package.json";
import { kernel } from "../../../lib/kernelStore.ts";
import { serverProduce } from "../../(studio)/projects/_port/port.ts";
import { MCP_BODY_CAP, mcpHandler } from "../../_server/mcp/rpc.ts";
import { PROJECTION } from "../../_server/mcp/projection.ts";
import type { McpDeps } from "../../_server/mcp/op.ts";
import { route } from "../../_server/route.ts";

export const maxDuration = 60;

const deps: McpDeps = {
  produce: serverProduce,
  // Loaded on an op's first ask (app/_server/mcp/op.ts McpDeps): the editors' and the screens' graphs.
  part: async () => (await import("../../(studio)/projects/[id]/_part/port.ts")).serverPart(),
  board: async () => (await import("../../(studio)/board/_port/port.ts")).serverBoard(),
  library: async () => (await import("../../(studio)/library/_port/port.ts")).serverLibrary(),
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
};

export const POST = route({ guard: "access", bodyCap: MCP_BODY_CAP, maxDuration }, mcpHandler(deps, PROJECTION, pkg.version));
