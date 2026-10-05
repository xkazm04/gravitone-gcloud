// GET /api/sound/groups -> { groups }
// PUT /api/sound/groups { groups: SoundGroups } -> { groups }
//
// Arrangement's rows, in order, per kind. PUT replaces the whole list — the
// board renames, adds and reorders in one gesture, and a list is its own
// order. A take whose group is no longer listed keeps its group string and
// draws in "ungrouped" until a row by that name exists again; nothing here
// rewrites takes, so removing a row can never lose where a take was.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { readGroups, SoundError, withStore } from "@/lib/sound/store";
import type { SoundGroups } from "@/lib/sound/types";

export const runtime = "nodejs";

function listOf(v: unknown, kind: string): string[] {
  if (!Array.isArray(v)) throw new SoundError(`groups.${kind} must be an array of names`, 400);
  if (v.length > 60) throw new SoundError(`groups.${kind} has more than 60 rows`, 400);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string" || !x.trim()) throw new SoundError(`groups.${kind} holds an empty or non-text name`, 400);
    const name = x.trim().slice(0, 60);
    if (seen.has(name.toLowerCase())) throw new SoundError(`groups.${kind} names "${name}" twice`, 400);
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json({ groups: (await readGroups()).groups });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { groups?: Partial<SoundGroups> } | null;
    const g = body?.groups;
    if (!g || typeof g !== "object") throw new SoundError("expected { groups: { music: [...], sfx: [...] } }", 400);
    const groups: SoundGroups = { music: listOf(g.music, "music"), sfx: listOf(g.sfx, "sfx") };
    await withStore(async (tx) => {
      const file = await tx.get("groups");
      file.groups = groups;
      tx.touch("groups");
    });
    return Response.json({ groups });
  } catch (e) {
    return toErrorResponse(e);
  }
}
