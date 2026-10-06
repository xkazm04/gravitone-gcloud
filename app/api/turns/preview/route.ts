// POST /api/turns/preview — what a turn WOULD send, to which engine, and about
// how long it takes here, without spending anything. (AIO-B.)
//
// Body: `{ kind, input }`, where `input` is exactly the body the turn's own route
// takes (`recalibrate` → /api/recalibrate, `frames` → /api/frames). Answers:
//
//   200 `{ manifest, engine, estimate }`
//         manifest  the assembler's account of the prompt — named blocks and
//                   their sizes, and for recalibrate which renders and
//                   conclusions go in and which are withheld (lib/turns/assemble)
//         engine    `{ available, provider, rung, transport, costBasis, descent }`:
//                   who would serve, or — when nobody can — every candidate and
//                   why it dropped out, in the router's own words
//         estimate  `{ p50Ms, n, p50CostUsd }` for this turn class on that rung,
//                   from the in-process ring lib/text/log.ts feeds
//   400 / 413  the SAME status and sentence the turn's route would answer for
//              this input, because both ask the same refusal function
//   500        the system prompt file is missing; nothing was dispatched
//
// FREE BY CONSTRUCTION. The assembler is pure; the engine answer is
// `engineStatus()`, which walks the router's own gates, and whose only process is
// the local engine's `claude --version` probe (zero tokens, and not started at
// all where the deployment may not spawn). No turn is dispatched.
//
// guardAccessOnly, not guardRequest: this reads and computes, it spends nothing,
// so it must not drain the bucket the money routes share. A client is expected
// to call it as the creator edits notes, debounced.

import { guardAccessOnly } from "@/lib/apiAuth";
import { KEY_VAR } from "@/lib/text/env";
import { textPriceTable } from "@/lib/text/pricing";
import { engineStatus, planFor } from "@/lib/text/router";
import { turnEstimate } from "@/lib/text/stats";
import type { CostBasis, LadderRung, TextProviderId, TextTransport, TurnClass } from "@/lib/text/types";
import { assembledRefusal, assembleFrames, framesRefusal, framesSystemPrompt } from "@/lib/turns/assemble/frames";
import { refusalResponse, type Refusal, type TurnManifest } from "@/lib/turns/assemble/manifest";
import {
  PromptUnavailable,
  assembleRecalibrate,
  recalibrateRefusal,
  recalibrateSystemPrompt,
} from "@/lib/turns/assemble/recalibrate";

export const runtime = "nodejs";

/** The turn kinds that have an assembler, and the router turn each runs as. */
const KINDS: Record<string, { turn: TurnClass; manifest: (input: Record<string, unknown>) => Promise<Refusal | TurnManifest> }> = {
  recalibrate: {
    turn: "edit-plan",
    manifest: async (input) =>
      recalibrateRefusal(input) ?? assembleRecalibrate(input, await recalibrateSystemPrompt()).manifest,
  },
  frames: {
    turn: "scene-direction",
    manifest: async (input) => {
      const refused = framesRefusal(input);
      if (refused) return refused;
      const { manifest } = assembleFrames(input, await framesSystemPrompt());
      return assembledRefusal(manifest) ?? manifest;
    },
  },
};

const isRefusal = (x: Refusal | TurnManifest): x is Refusal => "status" in x;

/** The basis a cost from this provider would arrive on. The local CLI reports
 *  the run's own figure; a keyed provider is priced from lib/text/pricing.ts
 *  where a row carries rates, and is otherwise unpriced — never free. */
function costBasisOf(id: TextProviderId): CostBasis {
  if (!KEY_VAR[id]) return "vendor-reported";
  const priced = textPriceTable().some(
    (r) => r.provider === id && r.usdPerMInput !== undefined && r.usdPerMOutput !== undefined,
  );
  return priced ? "estimated" : "unpriced";
}

async function engineFor(turn: TurnClass) {
  const status = await engineStatus(turn);
  const descent = status.candidates.filter((c) => !c.ok).map((c) => ({ provider: c.provider, detail: c.detail }));
  if (!status.serving)
    return { available: false as const, provider: null, rung: null, transport: null, costBasis: null, descent };
  const id = status.serving;
  const rung: LadderRung = planFor(turn, status.env).indexOf(id) <= 0 ? "preferred" : "alternate";
  // Keyless is local, keyed is a vendor API — the router's own rule (cheapBlock).
  const transport: TextTransport = KEY_VAR[id] ? "cloud-api" : "local-subprocess";
  return { available: true as const, provider: id, rung, transport, costBasis: costBasisOf(id), descent };
}

export async function POST(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;

  let body: { kind?: unknown; input?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "The body must be JSON: { kind, input }.", code: "bad-request" }, { status: 400 });
  }
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const spec = Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined;
  if (!spec)
    return Response.json(
      { detail: `No preview for kind ${JSON.stringify(kind.slice(0, 60))} (${Object.keys(KINDS).join(", ")}).`, code: "bad-request" },
      { status: 400 },
    );
  const input = (body?.input && typeof body.input === "object" ? body.input : {}) as Record<string, unknown>;

  let manifest: TurnManifest;
  try {
    const out = await spec.manifest(input);
    if (isRefusal(out)) return refusalResponse(out);
    manifest = out;
  } catch (e) {
    // Both system prompts are files on disk. Recalibrate names its own failure;
    // frames' raw read error is not echoed, because it carries a local path the
    // caller did not send.
    const detail =
      e instanceof PromptUnavailable ? e.message : `The ${kind} system prompt could not be read.`;
    return Response.json({ detail: `${detail} Nothing was dispatched.` }, { status: 500 });
  }

  const engine = await engineFor(spec.turn);
  const estimate = engine.available
    ? turnEstimate(spec.turn, engine.rung)
    : { p50Ms: null, n: 0, p50CostUsd: null };
  return Response.json({ manifest, engine, estimate });
}
