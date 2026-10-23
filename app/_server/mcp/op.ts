import type { z } from "zod";

import type { Parsed } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { McpAnnotations, McpFamily } from "@gt/domain/mcp";
import type { Store } from "@gt/kernel/store";

import type { ServerBoard } from "../../(studio)/board/_port/port.ts";
import type { ServerLibrary } from "../../(studio)/library/_port/port.ts";
import type { ServerPart } from "../../(studio)/projects/[id]/_part/port.ts";
import type { ServerProduce } from "../../(studio)/projects/_port/port.ts";
import type { Agent } from "./principal.ts";

// ONE OP OF THE AGENT DOOR - its words, its door (zod), its annotations and its handler. The rows
// live in ./tools/*.ts, the one registry that gathers them is ./registry.ts, and the projection
// (./projection.ts) publishes them as four family tools or one tool per op; a handler never knows
// which. Split from the registry so a tools module and the registry do not import each other.

/** The server ports an op calls - the studio's own (`serverProduce()` and its siblings), handed in
 *  so a test drives the same handlers over a temp store and a seeded receipt. The part, Board and
 *  Library ports are loaded when an op first asks (app/api/mcp/route.ts): their module graphs are
 *  the editors' and the screens', and a call that reads projects need not load them. */
export type McpDeps = {
  readonly produce: () => ServerProduce;
  readonly part: () => Promise<ServerPart>;
  readonly board: () => Promise<ServerBoard>;
  readonly library: () => Promise<ServerLibrary>;
  readonly store: () => Result<Store>;
};

export type ToolCtx = { readonly agent: Agent; readonly deps: McpDeps };

/** Every result is a JSON object: MCP's structuredContent is one. */
export type Obj = { readonly [k: string]: unknown };

type Run<S extends z.ZodObject> = (args: Parsed<z.output<S>>, ctx: ToolCtx) => Result<Obj> | Promise<Result<Obj>>;

/** An op row as the registry holds it: the input door erased to `ZodObject`, the handler to `unknown` args. */
export type McpToolSpec = {
  readonly family: McpFamily;
  readonly op: string;
  readonly title: string;
  /** <= 240 chars, about the work. */
  readonly description: string;
  readonly input: z.ZodObject;
  readonly annotations: McpAnnotations;
  /** Needs `scopeAdmits(scope, "act")`. */
  readonly writes: boolean;
  readonly run: (args: unknown, ctx: ToolCtx) => Result<Obj> | Promise<Result<Obj>>;
};

/** Annotations, named: a read, a write that changes nothing outside this studio, one that takes something away. */
export const READS: McpAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const WRITES: McpAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const DESTROYS: McpAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
/** A launch: work enqueued for producers that may call a vendor (dry, or live only when free). */
export const LAUNCHES: McpAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

/** One op row, typed at its definition; the args the handler sees are its door's output. */
export function defineOp<S extends z.ZodObject>(spec: Omit<McpToolSpec, "input" | "run"> & { readonly input: S; readonly run: Run<S> }): McpToolSpec {
  // The registry hands `run` only what `input` parsed (./rpc.ts), so the erased signature is that door's output.
  return spec as unknown as McpToolSpec;
}

/** A port answer whose value is not an object, wrapped under one key. */
export function wrap<T>(r: Result<T>, key: string, extra: Obj = {}): Result<Obj> {
  return r.ok ? { ok: true, value: { [key]: r.value, ...extra } } : r;
}
