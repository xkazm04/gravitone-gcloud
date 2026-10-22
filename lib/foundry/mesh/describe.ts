// An asset as the CLI prints it (pipeline/mesh.mts status): one line per variant, the gates'
// verdicts, and the sentences the work carries (an engine's error, a limitation) verbatim.

import { TECHNIQUE_LABEL, type MeshAsset } from "./types";

export function describeAsset(a: MeshAsset): string {
  const head = `${a.id}  ${a.brief.class} · ${a.brief.subject} · ${a.brief.budgetTris} tris${a.brief.rig === undefined ? "" : ` · rig ${a.brief.rig}`}${a.dry ? " · dry" : ""}`;
  const rows = a.variants.flatMap((v) => {
    const gates = v.gates.map((g) => `${g.name} ${g.verdict}${g.score === undefined ? "" : ` ${g.score}`}`).join(", ");
    const line = `  ${v.id.padEnd(4)} ${v.technique} ${TECHNIQUE_LABEL[v.technique].padEnd(19)} ${v.status.padEnd(9)}${v.tris === undefined ? "" : ` ${v.tris} tris`}${gates === "" ? "" : ` · ${gates}`}${v.verdict === undefined ? "" : ` · ${v.verdict}`}`;
    const said = [...(v.error === undefined ? [] : [`error: ${v.error}`]), ...v.gates.flatMap((g) => [...g.fails].map((f) => `${g.name} fail: ${f}`)), ...v.limitations.map((l) => `limitation: ${l}`)];
    return [line, ...said.map((s) => `       ${s}`)];
  });
  return [head, ...rows].join("\n");
}
