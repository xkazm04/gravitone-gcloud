import "server-only";

import { z } from "zod";

import { PART_ACTS } from "@gt/domain/partView";

// THE DOOR every part edit passes before it reaches a side: the `PartOp` union of
// @gt/domain/partView as zod, strict (an extra field is a refusal, not a silent drop). The domain
// contract is zod-free so the client can hold it; this is the server's copy of its shape, and
// L36's records module validates the same union at its own door (lift it there when it lands).

const id = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().max(max);
const note = z.enum(["more-focus", "less-focus", "descope", "move-earlier", "move-later", "custom"]);
const field = z.enum(["product", "audience", "proposition", "tone", "mustInclude", "cta", "platform"]);
const o = <S extends z.ZodRawShape>(shape: S) => z.object(shape).strict();

export const researchOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("descope"), cardId: id }),
  o({ op: z.literal("restore"), cardId: id }),
  o({ op: z.literal("like"), cardId: id, on: z.boolean() }),
  o({ op: z.literal("deepen"), cardId: id, on: z.boolean() }),
  o({ op: z.literal("confirm-scope") }),
  o({ op: z.literal("queue-follow-up"), prompt: text(500), cardId: id.optional() }),
  o({ op: z.literal("drop-follow-up"), id }),
  o({ op: z.literal("decide-effect"), followUpId: id, index: z.number().int().min(0).max(50), decision: z.enum(["applied", "rejected"]) }),
  o({ op: z.literal("set-face"), face: z.enum(["notebook", "beats"]) }),
  o({ op: z.literal("pick-beat"), slotId: id, variantId: id.nullable() }),
  o({ op: z.literal("compose-spine") }),
  o({ op: z.literal("set-brief"), field, value: z.union([text(300), z.array(text(120)).max(8)]) }),
  o({ op: z.literal("pick-idea"), ideaId: id }),
]);

export const scriptOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("adopt"), candidateId: id.nullable() }),
  o({ op: z.literal("note-add"), cardId: id, kind: note, text: text(500).optional() }),
  o({ op: z.literal("note-remove"), noteId: id }),
  o({ op: z.literal("accept"), versionId: id }),
  o({ op: z.literal("accept-over-gate"), versionId: id }),
  o({ op: z.literal("discard-staged"), versionId: id }),
  o({ op: z.literal("restore-version"), versionId: id }),
  o({ op: z.literal("patch-beat"), beatId: id, label: text(200).optional(), text: text(2000).optional() }),
  o({ op: z.literal("set-connector"), beatId: id, connector: z.enum(["BUT", "THEREFORE", "AND THEN"]) }),
  o({ op: z.literal("reset-beat"), beatId: id }),
  o({ op: z.literal("pick-scenario"), scenarioId: id }),
]);

/* L39 - frames and motion (@gt/domain/partView.frames.ts) */
const pct = z.number().finite().min(-50).max(150);
const layer = { unitId: id, layer: z.enum(["element", "text"]), layerId: id };
export const framesOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("move-layer"), ...layer, x: pct, y: pct }),
  o({ op: z.literal("resize-layer"), ...layer, w: pct, h: pct }),
  o({ op: z.literal("order-layer"), ...layer, dir: z.union([z.literal(1), z.literal(-1)]) }),
  o({ op: z.literal("hide-layer"), ...layer, hidden: z.boolean() }),
  o({ op: z.literal("remove-layer"), ...layer }),
  o({ op: z.literal("set-text"), unitId: id, textId: id, value: text(90) }),
  o({ op: z.literal("add-text"), unitId: id, role: z.enum(["caption", "figure", "label"]) }),
  o({ op: z.literal("bind-fact"), unitId: id, textId: id, factId: id.nullable() }),
  o({ op: z.literal("set-subject"), unitId: id, subject: text(600) }),
  o({ op: z.literal("set-clip-motion"), unitId: id, motion: text(800) }),
  o({ op: z.literal("adopt-alt"), unitId: id, altId: id }),
  o({ op: z.literal("accept-direction"), units: z.union([z.literal("all"), z.array(id).max(400)]), overwrite: z.boolean() }),
  o({ op: z.literal("discard-direction") }),
  o({ op: z.literal("revert-direction"), unitId: id.optional() }),
  o({ op: z.literal("rederive") }),
  o({ op: z.literal("adopt-image"), shotId: id, takeId: id }),
]);
export const motionOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("accept-motion"), unitId: id, motion: text(800).optional() }),
  o({ op: z.literal("clear-motion"), unitId: id }),
  o({ op: z.literal("adopt-clip"), shotId: id, clipId: id }),
]);

/* L40 - score, cut (@gt/domain/partView.finish.ts), the album and explainer parts (partView.album.ts) */
const mark = z.enum(["kept", "rejected"]).nullable();
const bpm = z.number().finite().min(40).max(220).nullable();
export const scoreOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("cue-span"), cueId: id, first: id, last: id }),
  o({ op: z.literal("cue-field"), cueId: id, field: z.enum(["title", "note"]), value: text(500) }),
  o({ op: z.literal("cue-bpm"), cueId: id, bpm }),
  o({ op: z.literal("cue-add"), first: id.optional(), last: id.optional() }),
  o({ op: z.literal("cue-delete"), cueId: id }),
  o({ op: z.literal("take-use"), cueId: id, takeId: id }),
  o({ op: z.literal("take-mark"), cueId: id, takeId: id, mark }),
  o({ op: z.literal("take-note"), cueId: id, takeId: id, section: z.number().int().min(0).max(200), note: text(500) }),
]);
const aspect = z.enum(["9:16", "1:1", "4:5", "16:9"]);
export const cutOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("nudge"), clipId: id, ms: z.number().int().min(-5000).max(5000) }),
  o({ op: z.literal("snap"), clipId: id }),
  o({ op: z.literal("super"), shotId: id, text: text(120) }),
  o({ op: z.literal("end-card"), field: z.enum(["cta", "line"]), value: text(200) }),
  o({ op: z.literal("end-hold"), holdS: z.number().finite().min(0.5).max(10) }),
  o({ op: z.literal("aspect"), aspect, on: z.boolean() }),
]);
export const albumOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("words-field"), field: z.enum(["title", "description"]), value: text(6000) }),
  o({ op: z.literal("words-tags"), tags: z.array(text(100)).max(60) }),
  o({ op: z.literal("render-res"), res: z.enum(["1080p", "1440p", "2160p"]) }),
  o({ op: z.literal("voice-use"), lineId: id, takeId: id }),
  o({ op: z.literal("voice-mark"), lineId: id, takeId: id, mark }),
  o({ op: z.literal("voice-line"), lineId: id, text: text(1000) }),
]);

export const partOpSchema = z.union([researchOpSchema, scriptOpSchema, /* L39 */ framesOpSchema, motionOpSchema, /* L40 */ scoreOpSchema, cutOpSchema, albumOpSchema]);
export const partActSchema = z.enum([
  ...PART_ACTS.research,
  ...PART_ACTS.script,
  /* L39 */ ...PART_ACTS.frames,
  ...PART_ACTS.motion,
  /* L40 */ ...PART_ACTS.score,
  ...PART_ACTS.cut,
  ...PART_ACTS.words,
  ...PART_ACTS.render,
  ...PART_ACTS.article,
  ...PART_ACTS.strips,
  ...PART_ACTS.voice,
]);
export const address = { projectId: id, key: z.string().regex(/^[a-z][a-z:-]{0,40}$/) };
