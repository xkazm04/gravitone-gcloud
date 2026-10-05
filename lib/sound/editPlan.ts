// A section edit as a wire plan — pure, so the generate path and a probe build
// it the same way. The rule is the music engine's seam discipline
// (lib/music/types.ts WireAudioRefChunk): a KEPT section is referenced by range
// against the stored song, never re-rendered; a regenerated one is a
// generation chunk, conditioned on the original's range at the chosen strength
// unless it is regenerated free.
//
// Lifted from app/playground/labModel.ts#buildEditPlan (2026-10-05) rather than
// imported: lib/ must not depend on a surface, and the lab's copy is being
// moved by the round-4 UI builders. Same arithmetic, same mode names.

import type { WireChunk, WireGenerationChunk, WirePlan } from "@/lib/music/types";

export type EditMode = "keep" | "low" | "medium" | "high" | "free";
export const EDIT_MODES: readonly EditMode[] = ["keep", "low", "medium", "high", "free"];

export const isGenChunk = (c: WireChunk): c is WireGenerationChunk => (c as WireGenerationChunk).text !== undefined;

export const chunkMs = (c: WireChunk) => (isGenChunk(c) ? c.duration_ms : Math.max(0, c.range.end_ms - c.range.start_ms));

export const planMs = (p: WirePlan | null | undefined) => (p ? p.chunks.reduce((n, c) => n + chunkMs(c), 0) : 0);

/** Is `v` a wire plan this engine can read? A take's `plan` is `unknown` on the
 *  wire, and a hand-edited takes.json may hold anything. */
export function asWirePlan(v: unknown): WirePlan | null {
  if (!v || typeof v !== "object") return null;
  const chunks = (v as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks) || !chunks.length) return null;
  const ok = chunks.every(
    (c) =>
      c &&
      typeof c === "object" &&
      ((typeof (c as WireGenerationChunk).text === "string" && typeof (c as WireGenerationChunk).duration_ms === "number") ||
        (typeof (c as { song_id?: unknown }).song_id === "string" && typeof (c as { range?: unknown }).range === "object")),
  );
  return ok ? ({ chunks } as WirePlan) : null;
}

/**
 * The edit plan: one entry per GENERATION chunk of the source plan, in order.
 * `texts[i]` replaces a regenerated section's text when given.
 */
export function buildEditPlan(source: WirePlan, songId: string, modes: readonly string[], texts: readonly (string | null | undefined)[] = []): WirePlan {
  const gen = source.chunks.filter(isGenChunk);
  let cursor = 0;
  const chunks: WireChunk[] = [];
  gen.forEach((c, i) => {
    const start = cursor;
    const end = cursor + c.duration_ms;
    cursor = end;
    const mode = (EDIT_MODES as readonly string[]).includes(modes[i] ?? "") ? (modes[i] as EditMode) : "keep";
    if (mode === "keep") {
      chunks.push({ song_id: songId, range: { start_ms: start, end_ms: end } });
    } else {
      chunks.push({
        ...c,
        text: texts[i] || c.text,
        ...(mode === "free"
          ? {}
          : { conditioning_ref: { song_id: songId, range: { start_ms: start, end_ms: end } }, condition_strength: mode }),
      });
    }
  });
  return { chunks };
}

/** Seconds of NEW audio an edit asks for — what the meter is charged with.
 *  Kept sections are references, so they cost nothing to keep. */
export function editSeconds(source: WirePlan, modes: readonly string[]): number {
  const gen = source.chunks.filter(isGenChunk);
  return gen.reduce((n, c, i) => n + ((modes[i] ?? "keep") === "keep" ? 0 : c.duration_ms), 0) / 1000;
}
