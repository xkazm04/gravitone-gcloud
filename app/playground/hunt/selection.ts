// THE SELECTION — which leaves are selected, by click, group toggle or marquee.
// Pure over Selection values. Separate from the layout: it takes the layout's
// Box only as the shape of a marquee rectangle.

import type { Box } from "./huntLayout";

/* ── selection ─────────────────────────────────────────────────────────── */

export interface Selection {
  ids: string[];
  /** The leaf a shift-click ranges FROM. */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null };

/**
 * One click on a leaf, with the modifiers a board has always meant:
 * plain replaces, ctrl/cmd toggles one, shift extends a range in board order
 * from the anchor (adding to what is held, as a file manager does).
 */
export function clickSelect(
  sel: Selection,
  order: readonly string[],
  id: string,
  mods: { shift?: boolean; toggle?: boolean } = {},
): Selection {
  if (!order.includes(id)) return sel;
  if (mods.shift && sel.anchor && order.includes(sel.anchor)) {
    const a = order.indexOf(sel.anchor);
    const b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return { ids: inOrder(order, [...sel.ids, ...range]), anchor: sel.anchor };
  }
  if (mods.toggle || mods.shift) {
    const has = sel.ids.includes(id);
    return {
      ids: has
        ? sel.ids.filter((x) => x !== id)
        : inOrder(order, [...sel.ids, id]),
      anchor: id,
    };
  }
  return { ids: [id], anchor: id };
}

/** Select every leaf of a branch — or, when all of them already are, none of them. */
export function toggleGroup(
  sel: Selection,
  order: readonly string[],
  group: readonly string[],
): Selection {
  const all = group.length > 0 && group.every((g) => sel.ids.includes(g));
  const ids = all
    ? sel.ids.filter((x) => !group.includes(x))
    : inOrder(order, [...sel.ids, ...group]);
  return { ids, anchor: all ? sel.anchor : (group[0] ?? sel.anchor) };
}

/** Leaves whose card a dragged rectangle touches, in layout units. */
export function marqueeHits(
  rect: Box,
  boxes: readonly { id: string; box: Box }[],
): string[] {
  const r = norm(rect);
  return boxes
    .filter(
      ({ box: b }) =>
        b.x < r.x + r.w &&
        b.x + b.w > r.x &&
        b.y < r.y + r.h &&
        b.y + b.h > r.y,
    )
    .map((b) => b.id);
}

/** A marquee adds to the selection when shift is held, else replaces it. */
export function marqueeSelect(
  sel: Selection,
  order: readonly string[],
  hits: readonly string[],
  add: boolean,
): Selection {
  const ids = inOrder(order, add ? [...sel.ids, ...hits] : [...hits]);
  return { ids, anchor: hits[0] ?? sel.anchor };
}

const inOrder = (order: readonly string[], ids: readonly string[]) => {
  const want = new Set(ids);
  return order.filter((o) => want.has(o));
};

const norm = (b: Box): Box => ({
  x: Math.min(b.x, b.x + b.w),
  y: Math.min(b.y, b.y + b.h),
  w: Math.abs(b.w),
  h: Math.abs(b.h),
});
