import { MCP_FAMILIES, type McpAnnotations, type McpFamily } from "@gt/domain/mcp";

import type { McpToolSpec } from "./op.ts";
import { JOB_OPS } from "./tools/job.ts";
import { LAUNCH_OPS } from "./tools/launch.ts";
import { READ_OPS } from "./tools/read.ts";
import { SPEND_OPS } from "./tools/spend.ts";
import { STEER_OPS } from "./tools/steer.ts";

// THE ONE TOOL REGISTRY of the agent door (spark athena-control-mcp; registry mcp-tools:
// catalog-projection-modes). Every op is one McpToolSpec row in ./tools/*.ts; this module gathers
// them and nothing else defines a tool. Both projections (./projection.ts) are views of these rows -
// four family tools or one tool per op - so a handler, its door and the ledger events it writes
// cannot differ between them.

export type { McpToolSpec } from "./op.ts";

/** Every op, in family order. */
export const REGISTRY: readonly McpToolSpec[] = [...READ_OPS, ...STEER_OPS, ...LAUNCH_OPS, ...JOB_OPS, ...SPEND_OPS];

/** A description is a tool's whole introduction to a model; past this it is a paragraph. */
export const DESCRIPTION_MAX = 240;

export const opsOf = (family: McpFamily): readonly McpToolSpec[] => REGISTRY.filter((s) => s.family === family);

export const opOf = (family: McpFamily, op: string): McpToolSpec | undefined => REGISTRY.find((s) => s.family === family && s.op === op);

/** A family tool's annotations: the most severe of its ops' (a read-only hint only if every op reads). */
export function familyAnnotations(family: McpFamily): McpAnnotations {
  const ops = opsOf(family);
  return {
    readOnlyHint: ops.every((s) => s.annotations.readOnlyHint),
    destructiveHint: ops.some((s) => s.annotations.destructiveHint),
    idempotentHint: ops.every((s) => s.annotations.idempotentHint),
    openWorldHint: ops.some((s) => s.annotations.openWorldHint),
  };
}

/** What the registry must hold true, as sentences; empty when it does. tests/next-server/mcp-registry.test.ts reads it. */
export function registryFaults(): string[] {
  const faults: string[] = [];
  const seen = new Set<string>();
  for (const s of REGISTRY) {
    const key = `${s.family}.${s.op}`;
    if (seen.has(key)) faults.push(`${key} is defined twice`);
    seen.add(key);
    if (!/^[a-z][a-z_]*$/.test(s.op)) faults.push(`${key}: an op name is lower-case words joined by _`);
    if (s.description.length > DESCRIPTION_MAX) faults.push(`${key}: description is ${s.description.length} chars (max ${DESCRIPTION_MAX})`);
    if (s.writes === s.annotations.readOnlyHint) faults.push(`${key}: writes=${s.writes} but readOnlyHint=${s.annotations.readOnlyHint}`);
    if ("op" in s.input.shape) faults.push(`${key}: an op's input may not have its own \`op\` field`);
  }
  for (const f of MCP_FAMILIES) if (opsOf(f).length === 0) faults.push(`family ${f} has no op`);
  return faults;
}
