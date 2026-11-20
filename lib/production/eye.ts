// THE CONTINUITY EYE, HEADLESS (spark character-cores S1.5, WP5) - Fable 5.2 reads each made keyframe of the cast against
// her styled sheet and the take's room plate and answers WP0's Drift (identity / room / wardrobe, holds or drifts, a
// reason of at most 140 characters), written onto the keyframe. Advisory, never a verdict. The runner is injected:
// pipeline/production.mts runs `claude -p --model claude-fable-5-2 --allowedTools Read -- "<prompt>"` (WP4 measured the
// `--`: without it --allowedTools swallows the prompt), tests a stub. A reply that is not the JSON is recorded under
// `eye/<node id>` with its first 140 characters.

import { ok, err, type Result } from "@gt/domain/errors";
import { DRIFT_AXES, type Drift, type ProductionNode } from "@gt/domain/productionGraph";

import { isRec } from "./check.ts";
import { coreKey, fileOfUrl, readOnlyRefusal, readState, updateState } from "./state.ts";
import { plateFor } from "./draw.ts";

/** One headless model turn: its stdout, or the sentence it failed with. */
export type EyeRunner = (prompt: string) => Promise<{ readonly ok: true; readonly reply: string } | { readonly ok: false; readonly sentence: string }>;

export const EYE_BY = "fable-5.2";
const PARALLEL = 3;

export type EyeRead = { readonly id: string; readonly ok: true; readonly drift: Drift } | { readonly id: string; readonly ok: false; readonly sentence: string };

/** The Drift in a reply, wherever the object sits in it; null when there is none. */
export function parseDrift(reply: string): Drift | null {
  const a = reply.indexOf("{");
  const b = reply.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!isRec(raw) || !DRIFT_AXES.every((x) => raw[x] === "holds" || raw[x] === "drifts") || typeof raw["reason"] !== "string") return null;
  const r = raw as Readonly<Record<string, string>>;
  return { identity: r["identity"] === "drifts" ? "drifts" : "holds", room: r["room"] === "drifts" ? "drifts" : "holds", wardrobe: r["wardrobe"] === "drifts" ? "drifts" : "holds", reason: (r["reason"] ?? "").trim().slice(0, 140), by: EYE_BY };
}

/** What the eye is asked of one frame: the files to read, and the direction it was drawn from. */
export function eyePrompt(frame: string, sheet: string, plate: string | null, direction: string): string {
  const files = plate === null ? `(1) ${frame} - a keyframe; (2) ${sheet} - the reference sheet of who she should be.` : `(1) ${frame} - a keyframe; (2) ${sheet} - the reference sheet of who she should be; (3) ${plate} - the room the keyframe should keep.`;
  return [
    `Read these images with the Read tool: ${files}`,
    `The keyframe was drawn from this direction: "${direction}"`,
    `Judge three axes, each "holds" or "drifts": identity (is she the woman of image 2 - face, hair, build), room (${plate === null ? "always holds: there is no room plate" : "are the furniture, positions, light and camera of image 3 kept"}), wardrobe (are her clothes the ones the direction names, not the sheet's).`,
    `Reply with ONLY one JSON object, no prose, no code fence: {"identity":"holds|drifts","room":"holds|drifts","wardrobe":"holds|drifts","reason":"<at most 140 characters>"}`,
  ].join("\n");
}

/** The cast's keyframes this production drew for her (the default set the eye reads). */
function drawnForCast(nodes: readonly ProductionNode[], productionId: string, castId: string): readonly ProductionNode[] {
  const mark = `run=keyframes&path=${encodeURIComponent(`${productionId}/${coreKey(castId)}/`)}`;
  return nodes.filter((n) => n.station === "keyframe" && n.state === "made" && n.media?.src.includes(mark) === true);
}

export async function eye(productionId: string, o: { readonly ids?: readonly string[] }, run: EyeRunner): Promise<Result<readonly EyeRead[]>> {
  const s = readState(productionId);
  if (!s.ok) return s;
  const refused = readOnlyRefusal(s.value);
  if (refused !== null) return refused;
  const p = s.value.production;
  const styled = s.value.styled[p.cast.id];
  const sheet = styled === undefined ? null : fileOfUrl(styled.sheet);
  if (sheet === null) return err("refused", `${p.cast.name} has not been redrawn in ${p.title}'s look: run style ${p.id} ${p.cast.id} first`);
  let nodes: readonly ProductionNode[];
  if (o.ids !== undefined && o.ids.length > 0) {
    const picked: ProductionNode[] = [];
    for (const id of o.ids) {
      const n = p.nodes.find((x) => x.id === id);
      if (n === undefined || n.station !== "keyframe" || n.state !== "made" || n.media === undefined) return err("refused", `${id} is not a made keyframe in ${p.title}`);
      picked.push(n);
    }
    nodes = picked;
  } else nodes = drawnForCast(p.nodes, p.id, p.cast.id);
  if (nodes.length === 0) return err("refused", `no keyframe drawn for ${p.cast.name} yet: run keyframes ${p.id} first`);

  const reads: EyeRead[] = new Array<EyeRead>(nodes.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < nodes.length) {
      const i = next++;
      const n = nodes[i] as ProductionNode;
      const frame = n.media === undefined ? null : fileOfUrl(n.media.src);
      const plate = plateFor(p, n);
      if (frame === null) {
        reads[i] = { id: n.id, ok: false, sentence: `${n.id}'s image is not a production file` };
        continue;
      }
      const got = await run(eyePrompt(frame, sheet, plate, n.prompt ?? n.label)).catch((e: unknown) => ({ ok: false as const, sentence: e instanceof Error ? e.message : String(e) }));
      if (!got.ok) {
        reads[i] = { id: n.id, ok: false, sentence: got.sentence.slice(0, 140) };
        continue;
      }
      const d = parseDrift(got.reply);
      reads[i] = d === null ? { id: n.id, ok: false, sentence: got.reply.trim().slice(0, 140) } : { id: n.id, ok: true, drift: d };
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, nodes.length) }, worker));

  const byId = new Map(reads.map((r) => [r.id, r]));
  const w = updateState(productionId, (st) => {
    const failed = Object.fromEntries(Object.entries(st.failed).filter(([k]) => !(k.startsWith("eye/") && byId.has(k.slice(4)))));
    for (const r of reads) if (!r.ok) failed[`eye/${r.id}`] = r.sentence;
    const updated = st.production.nodes.map((n): ProductionNode => {
      const r = byId.get(n.id);
      return r?.ok === true ? { ...n, drift: r.drift } : n;
    });
    return ok({ ...st, production: { ...st.production, nodes: updated }, failed });
  });
  return w.ok ? ok(reads) : w;
}
