import "server-only";

import { z } from "zod";

import { MCP_FAMILIES, PROJECTION_MODES, type McpAnnotations, type McpFamily, type ProjectionMode } from "@gt/domain/mcp";

import type { McpToolSpec } from "./op.ts";
import { familyAnnotations, opsOf, REGISTRY } from "./registry.ts";

// THE PROJECTION - how the one registry (./registry.ts) is published (catalog-projection-modes).
//
//   family     four routing tools, `gt_read`, `gt_launch`, `gt_job`, `gt_spend`, each taking
//              `{op, ...args}`; its inputSchema is the ops' doors as one JSON-Schema `oneOf`
//              discriminated by `op`, its annotations the most severe of its ops'. The default:
//              a model choosing among four tools reads four descriptions.
//   operation  one tool per op, `gt_<family>_<op>`, its inputSchema that op's door alone.
//
// Either way a call resolves to the SAME row and its handler gets the SAME args, so the result and
// the ledger events cannot differ by projection. The mode is read ONCE, when this module loads,
// from GRAVITONE_MCP_PROJECTION (server-only; never spelled in a client module - check:bundle).

export const PROJECTION_VAR = "GRAVITONE_MCP_PROJECTION";

function modeFrom(raw: string | undefined): ProjectionMode {
  if (raw === undefined || raw.trim() === "") return "family";
  const v = raw.trim();
  if ((PROJECTION_MODES as readonly string[]).includes(v)) return v as ProjectionMode;
  console.error(`[mcp] ${PROJECTION_VAR}="${v}" is not ${PROJECTION_MODES.join("|")}; publishing the family projection`);
  return "family";
}

export const PROJECTION: ProjectionMode = modeFrom(process.env[PROJECTION_VAR]);

export type JsonSchema = { readonly [k: string]: unknown };

/** One tool as tools/list publishes it (MCP 2025-06-18 Tool). */
export type PublishedTool = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations: McpAnnotations;
};

const FAMILY_WORDS: { readonly [F in McpFamily]: { readonly title: string; readonly lead: string } } = {
  read: { title: "Read the studio", lead: "Projects, plans, jobs, held lanes, Board packets, the Library and the Ledger." },
  launch: { title: "Compose and launch", lead: "Compose, change, price and launch projects and Floor runs; a live launch that is not free becomes a spend request." },
  job: { title: "Act on jobs", lead: "Pause, resume, retry, reorder, re-route or cancel a job; acknowledge a held lane." },
  spend: { title: "Spend requests", lead: "Spend requests this token filed, and the operator's verdicts." },
};

const familyName = (f: McpFamily): string => `gt_${f}`;
const opName = (s: McpToolSpec): string => `gt_${s.family}_${s.op}`;

function schemaOf(input: z.ZodObject): { [k: string]: unknown } {
  const { $schema: _drop, ...rest } = z.toJSONSchema(input, { io: "input", unrepresentable: "any" }) as { [k: string]: unknown };
  return rest;
}

function familySchema(f: McpFamily): JsonSchema {
  const ops = opsOf(f);
  const oneOf = ops.map((s) => {
    const js = schemaOf(s.input);
    const props = typeof js["properties"] === "object" && js["properties"] !== null ? js["properties"] : {};
    const required = Array.isArray(js["required"]) ? (js["required"] as unknown[]) : [];
    return { ...js, type: "object", properties: { op: { const: s.op }, ...props }, required: ["op", ...required] };
  });
  return { type: "object", properties: { op: { type: "string", enum: ops.map((s) => s.op) } }, required: ["op"], oneOf };
}

function familyDescription(f: McpFamily): string {
  return `${FAMILY_WORDS[f].lead} op: ${opsOf(f)
    .map((s) => s.op)
    .join(", ")}.`;
}

/** The tools a projection publishes, built once per mode. */
const BUILT = new Map<ProjectionMode, readonly PublishedTool[]>();
export function toolsOf(mode: ProjectionMode): readonly PublishedTool[] {
  const hit = BUILT.get(mode);
  if (hit !== undefined) return hit;
  const tools: readonly PublishedTool[] =
    mode === "family"
      ? MCP_FAMILIES.map((f) => ({ name: familyName(f), title: FAMILY_WORDS[f].title, description: familyDescription(f), inputSchema: familySchema(f), annotations: familyAnnotations(f) }))
      : REGISTRY.map((s) => ({ name: opName(s), title: s.title, description: s.description, inputSchema: { ...schemaOf(s.input), type: "object" }, annotations: s.annotations }));
  BUILT.set(mode, tools);
  return tools;
}

/** A tools/call resolved: the row and the args its door reads, or why the name or op is unknown. */
export type Resolved = { readonly ok: true; readonly spec: McpToolSpec; readonly args: unknown } | { readonly ok: false; readonly message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function resolveCall(mode: ProjectionMode, name: string, args: unknown): Resolved {
  const known = (): string => toolsOf(mode)
    .map((t) => t.name)
    .join(", ");
  if (mode === "operation") {
    const spec = REGISTRY.find((s) => opName(s) === name);
    return spec === undefined ? { ok: false, message: `unknown tool "${name}"; known: ${known()}` } : { ok: true, spec, args: args ?? {} };
  }
  const family = MCP_FAMILIES.find((f) => familyName(f) === name);
  if (family === undefined) return { ok: false, message: `unknown tool "${name}"; known: ${known()}` };
  const ops = opsOf(family);
  const raw = isRecord(args) ? args : {};
  const op = raw["op"];
  const spec = ops.find((s) => s.op === op);
  if (spec === undefined) return { ok: false, message: `${name}: unknown op ${JSON.stringify(op ?? null)}; known ops: ${ops.map((s) => s.op).join(", ")}` };
  const { op: _op, ...rest } = raw;
  return { ok: true, spec, args: rest };
}

/** The tool name a row is called by under a projection (for a refusal that names the surface). */
export const toolNameOf = (mode: ProjectionMode, s: McpToolSpec): string => (mode === "family" ? `${familyName(s.family)} ${s.op}` : opName(s));
