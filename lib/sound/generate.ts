// GENERATE — a GenerateRequest in, a filed take out. Server-only: it reaches
// lib/music/elevenlabs.ts, which reads the vendor key.
//
// NOTHING HERE TALKS TO THE VENDOR. Every render goes through the four
// functions lib/music already exports — composeDetailed (prompt, plan, section
// edit) and generateSfx — so the spend ceiling, the billed-on-failure rule, the
// greppable log line and the vendor error taxonomy are the ones the
// /api/music/* routes already live under (lib/music/elevenlabs.ts "THE
// CHOKEPOINT"). This file decides only WHAT to ask for, then files the bytes
// as a take through takes.ts, the same write an upload takes.
//
//   op "compose"       prompt (+ negative as a "No …" tail) at the requested
//                      length; stored for inpainting so the take can be
//                      section-edited later (app/api/music/compose/route.ts
//                      makes the same choice for the same reason).
//   op "plan"          the request's drafted plan when it carries one, else a
//                      free plan draft (lib/music draftPlan, zero seconds on
//                      the meter) rendered at once.
//   op "section-edit"  the source take's stored song + plan, kept sections by
//                      reference (./editPlan.ts); its parent is the source.
//   op "sfx"           text-to-SFX, 0.5–30 s, with the loop flag and the
//                      prompt influence (null = the vendor's default).
//
// A HUNT LEAF IS UPDATED HERE TOO. A render that names huntId + nodeId lands
// on that node (takeIds, state rendered — or failed with the vendor's own
// sentence), so a hunt reads the same from the lab, the CLI and a reload.

import { composeDetailed, draftPlan, generateSfx } from "@/lib/music/elevenlabs";
import type { WirePlan } from "@/lib/music/types";

import { asWirePlan, buildEditPlan, editSeconds, isGenChunk, planMs } from "./editPlan";
import { getTake, createTake, termsOf } from "./takes";
import { SoundError, withStore } from "./store";
import type { GenerateRequest, SoundKind, SoundTake } from "./types";

const OPS = ["compose", "plan", "section-edit", "sfx"] as const;
const ORIGINS = ["agent", "lab", "hunt"] as const;

/** The vendor's windows, restated as the bounds a request is held to BEFORE
 *  anything is sent (lib/music/elevenlabs.ts states them for the wire). */
export const DURATION_BOUNDS: Record<SoundKind, { min: number; max: number }> = {
  music: { min: 3, max: 600 },
  sfx: { min: 0.5, max: 30 },
};

/** Hold a JSON body to GenerateRequest. Every refusal is a 400 naming the
 *  field — the route is a money route and a guessed default would be spend
 *  nobody asked for. */
export function parseGenerateRequest(body: unknown): GenerateRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SoundError("the request must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const kind = b.kind === "music" || b.kind === "sfx" ? b.kind : null;
  if (!kind) throw new SoundError('"kind" must be "music" or "sfx"', 400);
  if (b.provider !== "elevenlabs")
    throw new SoundError('"provider" must be "elevenlabs" — Suno is a manual round trip and Local is not installed', 400);
  const op = OPS.find((o) => o === b.op);
  if (!op) throw new SoundError(`"op" must be one of ${OPS.join(", ")}`, 400);
  if (kind === "sfx" && op !== "sfx") throw new SoundError('an sfx take is rendered with op "sfx"', 400);
  if (kind === "music" && op === "sfx") throw new SoundError('op "sfx" renders an effect; set kind "sfx"', 400);
  const origin = ORIGINS.find((o) => o === b.origin);
  if (!origin) throw new SoundError(`"origin" must be one of ${ORIGINS.join(", ")}`, 400);

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (op !== "section-edit" && op !== "plan" && !prompt) throw new SoundError('"prompt" is required', 400);
  if (prompt.length > 4100) throw new SoundError('"prompt" is over 4100 characters', 400);

  const d = typeof b.durationS === "number" && Number.isFinite(b.durationS) ? b.durationS : NaN;
  const bounds = DURATION_BOUNDS[kind];
  if (op !== "section-edit" && !(d >= bounds.min && d <= bounds.max))
    throw new SoundError(`"durationS" must be ${bounds.min}..${bounds.max} seconds for ${kind}`, 400);

  const plan = b.plan === null || b.plan === undefined ? null : asWirePlan(b.plan);
  if (b.plan && !plan) throw new SoundError('"plan" is not a composition plan ({ chunks: [...] })', 400);
  if (op === "plan" && !plan && !prompt) throw new SoundError('op "plan" needs a drafted "plan" or a "prompt" to draft one from', 400);

  const sourceTakeId = typeof b.sourceTakeId === "string" && b.sourceTakeId ? b.sourceTakeId : null;
  const editModes = Array.isArray(b.editModes) ? b.editModes.filter((x): x is string => typeof x === "string") : null;
  if (op === "section-edit") {
    if (!sourceTakeId) throw new SoundError('a section edit needs "sourceTakeId"', 400);
    if (!editModes || !editModes.length) throw new SoundError('a section edit needs "editModes", one per section', 400);
    if (editModes.every((m) => m === "keep")) throw new SoundError("every section is kept — there is nothing to render", 400);
  }
  // prompt_influence is the SFX endpoint's own knob (lib/music/elevenlabs.ts
  // generateSfx: 0..1). On a music op it would be a field nothing reads, so it
  // is refused there rather than silently dropped.
  let promptInfluence: number | null = null;
  if (b.promptInfluence !== null && b.promptInfluence !== undefined) {
    if (kind !== "sfx") throw new SoundError('"promptInfluence" applies to sfx only', 400);
    const pi = b.promptInfluence;
    if (typeof pi !== "number" || !Number.isFinite(pi) || pi < 0 || pi > 1) throw new SoundError('"promptInfluence" must be 0..1, or null for the vendor default', 400);
    promptInfluence = pi;
  }
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kind,
    provider: "elevenlabs",
    op,
    prompt,
    negative: strOrNull(b.negative),
    durationS: Number.isFinite(d) ? d : 0,
    loop: typeof b.loop === "boolean" ? b.loop : null,
    promptInfluence,
    technique: strs(b.technique),
    terms: termsOf(b.terms),
    tempoBpm: numOrNull(b.tempoBpm),
    key: strOrNull(b.key),
    origin,
    sourceTakeId,
    editModes,
    plan,
    huntId: strOrNull(b.huntId),
    nodeId: strOrNull(b.nodeId),
    title: strOrNull(b.title),
  };
}

/** ElevenLabs' prompt mode has no exclude field (only a plan chunk does), so a
 *  negative rides as a closing "No …" sentence — the Library's own dialect for
 *  this vendor (app/library/audio/book.ts#compose). */
export function withNegative(prompt: string, negative: string | null): string {
  if (!negative) return prompt;
  const items = negative.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return prompt;
  return `${prompt.replace(/\s+$/, "")}${/[.!?]$/.test(prompt.trim()) ? "" : "."} No ${items.join(", no ")}.`;
}

function titleFor(req: GenerateRequest): string {
  if (req.title) return req.title.slice(0, 200);
  const terms = [...req.terms.genre, ...req.terms.mood].slice(0, 2).join(" · ") || req.terms.sfxCategory;
  const head = terms || req.prompt.split(/[.,\n]/)[0].trim().slice(0, 48) || "take";
  return `${head} — ${req.op}`;
}

type Rendered = { b64: string; mime: string; songId: string | null; plan: WirePlan | null; durationS: number; parentId: string | null; prompt: string };

async function render(req: GenerateRequest): Promise<Rendered> {
  switch (req.op) {
    case "compose": {
      const prompt = withNegative(req.prompt, req.negative);
      const out = await composeDetailed({ prompt, lengthMs: Math.round(req.durationS * 1000), storeForInpainting: true });
      return { b64: out.audio.b64, mime: out.audio.mime, songId: out.songId, plan: out.plan, durationS: req.durationS, parentId: null, prompt: req.prompt };
    }
    case "plan": {
      const plan =
        (req.plan as WirePlan | null) ??
        (await draftPlan({ prompt: req.prompt, lengthMs: Math.round(Math.min(req.durationS, 300) * 1000), negativeStyle: req.negative ?? undefined }));
      const out = await composeDetailed({ plan, storeForInpainting: true });
      return { b64: out.audio.b64, mime: out.audio.mime, songId: out.songId, plan: out.plan ?? plan, durationS: planMs(plan) / 1000, parentId: null, prompt: req.prompt };
    }
    case "section-edit": {
      const source = await getTake(req.sourceTakeId!);
      const plan = asWirePlan(source.plan);
      if (!source.songId || !plan)
        throw new SoundError(`take ${source.id} has no stored song and plan to edit; re-render it with op "compose" or "plan"`, 409);
      const gen = plan.chunks.filter(isGenChunk);
      if (req.editModes!.length > gen.length)
        throw new SoundError(`take ${source.id} has ${gen.length} sections; ${req.editModes!.length} edit modes were sent`, 400);
      // Replacement texts, when the caller sent a plan of the same sections.
      const texts = req.plan ? (req.plan as WirePlan).chunks.filter(isGenChunk).map((c) => c.text) : [];
      const edit = buildEditPlan(plan, source.songId, req.editModes!, texts);
      if (editSeconds(plan, req.editModes!) <= 0) throw new SoundError("every section is kept — there is nothing to render", 400);
      const out = await composeDetailed({ plan: edit, storeForInpainting: true });
      return {
        b64: out.audio.b64,
        mime: out.audio.mime,
        songId: out.songId,
        plan: out.plan ?? edit,
        durationS: planMs(plan) / 1000,
        parentId: source.id,
        prompt: req.prompt || source.prompt,
      };
    }
    case "sfx": {
      const prompt = withNegative(req.prompt, req.negative);
      const out = await generateSfx({
        text: prompt,
        durationSeconds: req.durationS,
        loop: req.loop ?? undefined,
        promptInfluence: req.promptInfluence ?? undefined,
      });
      return { b64: out.audio.b64, mime: out.audio.mime, songId: null, plan: null, durationS: req.durationS, parentId: null, prompt: req.prompt };
    }
  }
}

/** Mark a hunt node, if the render belongs to one. A missing hunt or node is
 *  not an error for the render — the take is filed either way. */
async function markNode(req: GenerateRequest, takeId: string | null, error: string | null): Promise<void> {
  if (!req.huntId || !req.nodeId) return;
  await withStore(async (tx) => {
    const file = await tx.get("hunts");
    const node = file.hunts.find((h) => h.id === req.huntId)?.nodes.find((n) => n.id === req.nodeId);
    if (!node) return;
    if (takeId) {
      node.takeIds = [...node.takeIds.filter((x) => x !== takeId), takeId];
      node.state = "rendered";
      node.error = null;
    } else {
      node.state = "failed";
      node.error = error;
    }
    tx.touch("hunts");
  });
}

export async function generateTake(req: GenerateRequest, now = new Date()): Promise<SoundTake> {
  let r: Rendered;
  try {
    r = await render(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markNode(req, null, msg).catch(() => undefined);
    throw e;
  }
  const bytes = Buffer.from(r.b64, "base64");
  const { take } = await createTake(
    {
      kind: req.kind,
      title: titleFor(req),
      provider: "elevenlabs",
      op: req.op,
      origin: req.origin,
      technique: req.technique,
      prompt: r.prompt,
      negative: req.negative,
      terms: req.terms,
      tempoBpm: req.tempoBpm,
      key: req.key,
      durationS: r.durationS,
      loop: req.kind === "sfx" ? req.loop : null,
      parentId: r.parentId,
      huntId: req.huntId,
      nodeId: req.nodeId,
      songId: r.songId,
      plan: r.plan,
      editModes: req.op === "section-edit" ? req.editModes : null,
    },
    { bytes, mime: r.mime, name: `${req.op}.mp3` },
    now,
  );
  await markNode(req, take.id, null);
  return take;
}

