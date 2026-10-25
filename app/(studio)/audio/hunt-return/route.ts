// POST /audio/hunt-return - a Suno hunt leaf's file, filed as the leaf's take (Phase 6, L72).
// multipart: `file` (the audio), `hunt`, `node` (the leaf it answers), `op` (the client's op id: a
// retried upload finds the take it filed). The judgement and the writes are ../_hunt/leafReturn.ts
// `fileLeafReturn`'s; this door holds the bytes to the store's cap and the engine registry's seam,
// as its sibling /audio/return does for an Arrange card.
//
// A route, not a Server Action: a returned WAV is tens of MB and an action's body is capped far
// below that (plan §9.2: route handlers are for CLIs, agents and FILES). Access-gated, not money:
// nothing here spends (v1 POST /api/sound/takes, the same reasoning).
//
// THE CAP IS route()'s: its `bodyCap` counts the body as the handler reads it (a route with no `input`
// included) and a declared content-length over it is refused up front; this door words the refusal
// in MB (tests/next-server/audio-hunt-return.test.ts).
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../_server/route.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { can, engineById } from "../../../../lib/sound/engines.ts";
import { HUNT_OP_RE } from "../../../../lib/sound/huntRender.ts";
import { MAX_UPLOAD_BYTES } from "../../../../lib/sound/takes.ts";
import { deskEngines } from "../_audio/arrangeRead.ts";
import { fileLeafReturn } from "../_hunt/leafReturn.ts";
import { actorOf } from "../../../../lib/principal.ts";

export const maxDuration = 60;

const soundId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const fields = z.object({ hunt: soundId, node: soundId, op: z.string().regex(HUNT_OP_RE) });

const CAP = MAX_UPLOAD_BYTES + 1_000_000;
const over = `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`;

/** The multipart body. route()'s `bodyCap` counts it as it is read and errors past CAP (body-too-large). */
async function cappedForm(req: Request): Promise<Result<FormData>> {
  try {
    return ok(await req.formData());
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", over) : err("invalid", `expected multipart/form-data with file, hunt, node and op: ${errorMessage(e)}`);
  }
}

const field = (form: FormData, k: string): string | undefined => {
  const v = form.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
};

export const POST = route({ guard: "access", bodyCap: CAP, maxDuration }, async ({ req, who }): Promise<Result<{ readonly id: string; readonly created: boolean }>> => {
  if (!can(engineById(deskEngines(), "suno"), "file-return")) return err("refused", "the desk takes no Suno return here: the engine registry withholds file-return");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CAP) return err("invalid", over);
  const read = await cappedForm(req);
  if (!read.ok) return read;
  const form = read.value;
  const p = parseAt("hunt return", fields, { hunt: field(form, "hunt"), node: field(form, "node"), op: field(form, "op") });
  if (!p.ok) return p;
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", "a return needs its audio file (multipart field `file`)");
  const k = kernel();
  if (!k.ok) return k;
  const file = { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type, name: f.name };
  const r = await fileLeafReturn(k.value.store, { huntId: p.value.hunt, nodeId: p.value.node, opId: p.value.op, file }, actorOf(who), new Date());
  return r.ok ? ok({ id: r.value.take.id, created: r.value.created }) : r;
});
