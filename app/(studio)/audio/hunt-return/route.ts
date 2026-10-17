// POST /audio/hunt-return - a Suno hunt leaf's file, filed as the leaf's take (Phase 6, L72).
// multipart: `file` (the audio), `hunt`, `node` (the leaf it answers), `op` (the client's op id: a
// retried upload finds the take it filed). The judgement and the writes are ../_hunt/leafReturn.ts
// `fileLeafReturn`'s; this door holds the bytes to the store's cap and the engine registry's seam,
// as its sibling /audio/return does for an Arrange card.
//
// A route, not a Server Action: a returned WAV is tens of MB and an action's body is capped far
// below that (plan §9.2: route handlers are for CLIs, agents and FILES). Access-gated, not money:
// nothing here spends (v1 POST /api/sound/takes, the same reasoning).
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../_server/route.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { can, engineById } from "../../../../lib/sound/engines.ts";
import { HUNT_OP_RE } from "../../../../lib/sound/huntRender.ts";
import { MAX_UPLOAD_BYTES } from "../../../../lib/sound/takes.ts";
import { deskEngines } from "../_audio/arrangeRead.ts";
import { fileLeafReturn } from "../_hunt/leafReturn.ts";

export const maxDuration = 60;

const soundId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const fields = z.object({ hunt: soundId, node: soundId, op: z.string().regex(HUNT_OP_RE) });

const field = (form: FormData, k: string): string | undefined => {
  const v = form.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
};

export const POST = route({ guard: "access", bodyCap: MAX_UPLOAD_BYTES + 1_000_000, maxDuration }, async ({ req, who }): Promise<Result<{ readonly id: string; readonly created: boolean }>> => {
  if (!can(engineById(deskEngines(), "suno"), "file-return")) return err("refused", "the desk takes no Suno return here: the engine registry withholds file-return");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1_000_000) return err("invalid", `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return err("invalid", `expected multipart/form-data with file, hunt, node and op: ${e instanceof Error ? e.message : String(e)}`);
  }
  const p = parseAt("hunt return", fields, { hunt: field(form, "hunt"), node: field(form, "node"), op: field(form, "op") });
  if (!p.ok) return p;
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", "a return needs its audio file (multipart field `file`)");
  const k = kernel();
  if (!k.ok) return k;
  const file = { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type, name: f.name };
  const r = await fileLeafReturn(k.value.store, { huntId: p.value.hunt, nodeId: p.value.node, opId: p.value.op, file }, { kind: "operator", id: who !== null && "uid" in who ? who.uid : "operator" }, new Date());
  return r.ok ? ok({ id: r.value.take.id, created: r.value.created }) : r;
});
