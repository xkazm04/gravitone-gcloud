// GET /api/articles/topics?limit=<n>&bundle=<b>&bundle=<b2>
//
// The registry subjects no article covers yet, ranked, each with its title and
// a suggested angle: `listUncoveredTopics` (lib/articles/loop.ts) answered
// whole, unwrapped and unrenamed, `{ topics, covered, claimed, remaining }`,
// so the CLI's `topics --json` and this route cannot disagree.
//
// `limit` is passed through and clamped by the function itself (1..50, default
// 10). Each `bundle` adds a bundle the ranking leaves out by default
// (`includeBundles`). It reads the registry from disk and spends nothing, so
// the access door without the rate bucket. Server only by construction.

import { guardAccessOnly } from "@/lib/apiAuth";
import { listUncoveredTopics } from "@/lib/articles/loop";

import { failure } from "../_lib/respond";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const rawLimit = q.get("limit");
  const limit = rawLimit === null || rawLimit.trim() === "" ? undefined : Number(rawLimit);
  if (limit !== undefined && !Number.isFinite(limit)) {
    return Response.json({ error: `limit must be a number, not ${JSON.stringify(rawLimit)}`, code: "bad-limit" }, { status: 400 });
  }
  const bundles = q.getAll("bundle").map((b) => b.trim()).filter(Boolean);
  try {
    return Response.json(await listUncoveredTopics({ ...(limit !== undefined ? { limit } : {}), ...(bundles.length ? { includeBundles: bundles } : {}) }));
  } catch (e) {
    return failure(e);
  }
}
