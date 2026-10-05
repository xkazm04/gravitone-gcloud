// THE CHAIN BASE — resolve beats and attribution against the accepted version or fixture.
//
// Extracted to give both engines and the route handler a single authoritative
// place to answer "what does this render currently say".
//
// When a version has been accepted, subsequent recalibrations must stack on top
// of its beats and its attribution rather than resetting to the fixture.

import { RENDERS, RENDER_BY_ID } from "./renders";
import { ATTRIBUTION } from "./impact";
import type { Beat, ScriptRender } from "./types";
import type { Version } from "./versions";

export interface RenderPayload extends Omit<ScriptRender, "beats"> {
  beats: (Beat & { cards: string[] | null })[];
}

type Loose = Record<string, unknown>;

interface BeatWithCards {
  cards?: string[] | null;
}

interface CutFact {
  factId: string;
  why?: string;
}

/** The beats a version actually shows for one render. A version with no chain
 *  of its own falls back to the fixture. */
export function chainOf(v: Version | null | undefined, renderId: string): Beat[] {
  return v?.beats?.[renderId] ?? RENDER_BY_ID[renderId]?.beats ?? [];
}

/** The attribution a version carries for one render. Falls back to the fixture. */
export function attributionOf(v: Version | null | undefined, renderId: string): Record<string, string[]> {
  return v?.attribution?.[renderId] ?? ATTRIBUTION[renderId] ?? {};
}

/** Build the render payload for a given base version.
 *  Every beat carries `cards`: the card ids it rests on, or `null` if no attribution.
 *  Never emits empty array `[]` (null-vs-[] rule). */
export function renderPayloadFor(base?: Version | null): RenderPayload[] {
  return RENDERS.map((r) => {
    const beats = chainOf(base, r.id);
    const attr = attributionOf(base, r.id);
    return {
      ...r,
      beats: beats.map((b) => {
        const cards = attr[b.at];
        return {
          ...b,
          cards: cards && cards.length > 0 ? cards : null,
        };
      }),
    };
  });
}

/** Does this render's current chain or cut list say anything about this card?
 *  Checks the render payload's beats when available, falling back to the fixture. */
export function touches(render: RenderPayload | ScriptRender | Loose | string, cardId: string): boolean {
  if (typeof render === "string") {
    const fromAttr = Object.values(ATTRIBUTION[render] ?? {}).some((ids) => ids.includes(cardId));
    if (fromAttr) return true;
    return (RENDER_BY_ID[render]?.cutFacts ?? []).some((c) => c.factId === cardId);
  }

  const r = render as Loose;
  const renderId = String(r.id);
  if (Array.isArray(r.beats)) {
    const beats = r.beats as BeatWithCards[];
    const hitBeat = beats.some((b) => Array.isArray(b.cards) && b.cards.includes(cardId));
    if (hitBeat) return true;
    const hasAnyCardsProp = beats.some((b) => b.cards !== undefined);
    if (!hasAnyCardsProp) {
      if (Object.values(ATTRIBUTION[renderId] ?? {}).some((ids) => ids.includes(cardId))) return true;
    }
  } else {
    if (Object.values(ATTRIBUTION[renderId] ?? {}).some((ids) => ids.includes(cardId))) return true;
  }

  const cutFacts =
    (Array.isArray(r.cutFacts) ? (r.cutFacts as CutFact[]) : undefined) ??
    RENDER_BY_ID[renderId]?.cutFacts ??
    [];
  return cutFacts.some((c) => c.factId === cardId);
}

/** Which renders these notes can reach, reading current render payload or fixture.
 *  Fails open in every ambiguous case, and an empty result means "everything". */
export function rendersInScope(
  renders: (RenderPayload | ScriptRender | Loose | string)[],
  notes: unknown[],
): Set<string> {
  const ids = renders.map((r) => (typeof r === "string" ? r : String(r.id)));
  const all = new Set(ids);
  const out = new Set<string>();
  for (const raw of notes) {
    const n = (raw ?? {}) as Loose;
    const cardId = typeof n.cardId === "string" ? n.cardId : null;
    const kind = typeof n.kind === "string" ? n.kind : "custom";
    if (!cardId || kind === "custom") return all;
    const hit = renders
      .filter((r) => touches(r, cardId))
      .map((r) => (typeof r === "string" ? r : String(r.id)));
    if (!hit.length) {
      if (kind === "more-focus") return all; // it could be brought into any of them
      continue; // inert — there is no beat anywhere for it to change
    }
    for (const id of hit) out.add(id);
  }
  return out.size ? out : all;
}
