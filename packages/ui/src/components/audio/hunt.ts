// THE HUNT'S ARITHMETIC - pure, no React, no fetch (Phase 6, L65). A hunt is an idea, a map of
// variations the text engine drafted (axes, and leaves under them), the leaves the operator
// chose to pay for, the takes those leaves came back with, and a crown on the one that won.
// Absorbed from v1 app/playground/hunt/{tree,selection,renderPlan,store,atRest,leaf}.ts, whose
// reasons are kept:
//   · the drafter promises no SHAPE (rooted, root-less, bare leaves carrying only an axis), so
//     the shape is normalised once here and no leaf is dropped - a dropped leaf is a variant
//     nobody hears (an orphaned parent is drawn at the top; a parentId cycle is cut);
//   · only a LEAF renders: a branch is a question ("which tempo?"), a leaf an answer;
//   · a selection never spends twice: a leaf already heard or in flight is settled, a Suno leaf
//     goes by hand, an engine the deployment withholds is unreachable, and the seconds of audio
//     are counted to a tenth (an SFX leaf can be half a second) - the one exact link of a price;
//   · a stored hunt is squared with the takes filed against it: a take that came back after
//     the page that asked for it closed is attached; a leaf left `rendering` with no take and
//     no render in flight was interrupted, and reads as failed so it can be rendered again.
// Dropped: v1's canvas geometry (huntLayout.ts: fixed-unit boxes, SVG fan edges, the marquee).
// The map here is columns of cards in CSS, so there is no geometry to compute or test; click,
// shift-range, toggle and the branch pill are the selection.

export type LeafState = "idea" | "rendering" | "rendered" | "awaiting-return" | "failed";

/** A hunt node as the desk reads it - lib/sound/types.ts HuntNode, structurally. */
export type HuntNodeView = {
  readonly id: string;
  readonly parentId: string | null;
  readonly axis: string;
  readonly label: string;
  readonly rationale: string;
  readonly provider: string;
  readonly technique: readonly string[];
  readonly prompt: string;
  readonly durationS: number;
  readonly state: LeafState;
  readonly takeIds: readonly string[];
  readonly winner: boolean;
  readonly error: string | null;
};

/** A leaf as the desk draws it: the node and what it asks for beside the prompt. */
export type HuntLeafView = HuntNodeView & {
  readonly negative: string | null;
  readonly tempoBpm: number | null;
  readonly key: string | null;
  readonly loop: boolean | null;
};

/** A heard take, as the audition plays it (bytes served, peaks and length measured at ingest). */
export type AuditionTake = {
  readonly id: string;
  readonly title: string;
  readonly src: string | null;
  readonly peaks: readonly number[];
  readonly lengthS: number | null;
  readonly verdict: string;
  readonly stage: string | null;
};

/** The hunt `?h=` opens, whole. */
export type HuntOpenView = {
  readonly id: string;
  readonly kind: "music" | "sfx";
  readonly idea: string;
  readonly createdAt: string;
  readonly draftedBy: string | null;
  readonly nodes: readonly HuntLeafView[];
  readonly takes: Readonly<Record<string, AuditionTake>>;
  readonly lesson: { readonly id: string; readonly claim: string; readonly technique: readonly string[]; readonly n: number; readonly keepRate: number | null; readonly confirmedAt: string } | null;
  /** A render of this hunt is queued or running. */
  readonly inFlight: boolean;
  /** Why the ingest measures could not be read, when they could not. */
  readonly measures: string | null;
};

/** A past hunt on the shelf: its counts and its map in miniature (a column of leaf states per axis). */
export type HuntCardView = {
  readonly id: string;
  readonly idea: string;
  readonly createdAt: string;
  readonly counts: HuntCounts;
  readonly lessonId: string | null;
  readonly mini: readonly { readonly axis: string; readonly leaves: readonly { readonly state: LeafState; readonly winner: boolean }[] }[];
};

/** A leaf's newest take: what the audition plays and the crown names. */
export const headTake = (leaf: Pick<HuntNodeView, "takeIds">): string | undefined => leaf.takeIds[leaf.takeIds.length - 1];

/* ── the tree ──────────────────────────────────────────────────────────── */

export type MapRow<N extends HuntNodeView = HuntNodeView> =
  | { readonly kind: "group"; readonly id: string; readonly depth: number; readonly node: N }
  | { readonly kind: "leaf"; readonly id: string; readonly depth: number; readonly node: N };

export type MapColumn<N extends HuntNodeView = HuntNodeView> = {
  readonly id: string;
  readonly axis: string;
  readonly label: string;
  readonly rationale: string | null;
  readonly rows: readonly MapRow<N>[];
  /** The column's leaves, in board order: what its branch pill selects. */
  readonly leafIds: readonly string[];
};

export type HuntTree<N extends HuntNodeView = HuntNodeView> = {
  /** The parentless node that stands for the idea, when the drafter emitted one. */
  readonly root: N | null;
  readonly columns: readonly MapColumn<N>[];
  /** Every leaf, in board order (column by column, top to bottom). */
  readonly leaves: readonly N[];
};

export function buildTree<N extends HuntNodeView>(nodes: readonly N[]): HuntTree<N> {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const parent = new Map<string, string | null>(nodes.map((n) => [n.id, n.parentId !== null && n.parentId !== n.id && byId.has(n.parentId) ? n.parentId : null] as const));
  // A parentId cycle (a hand-patched map: the store checks only that a parent exists) has no top,
  // so every node on it, and under it, was never reached and vanished. The cycle's first node in
  // list order is cut to a top; a walk that loops without returning to its start is under a cycle
  // another node's cut will open.
  for (const n of nodes) {
    const seen = new Set<string>();
    for (let up = parent.get(n.id) ?? null; up !== null && !seen.has(up); up = parent.get(up) ?? null) {
      if (up === n.id) {
        parent.set(n.id, null);
        break;
      }
      seen.add(up);
    }
  }
  const kids = new Map<string, N[]>();
  const tops: N[] = [];
  for (const n of nodes) {
    const p = parent.get(n.id) ?? null;
    if (p === null) tops.push(n);
    else kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const hasKids = (n: N): boolean => (kids.get(n.id)?.length ?? 0) > 0;
  const only = tops.length === 1 ? tops[0] : undefined;
  const root = only !== undefined && hasKids(only) ? only : null;
  const level = root === null ? tops : (kids.get(root.id) ?? []);
  const seen = new Set<string>(root === null ? [] : [root.id]);
  const rowsOf = (n: N, depth: number): MapRow<N>[] => {
    if (seen.has(n.id)) return [];
    seen.add(n.id);
    if (!hasKids(n)) return [{ kind: "leaf", id: n.id, depth, node: n }];
    return [{ kind: "group", id: n.id, depth, node: n }, ...(kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, depth + 1))];
  };
  const leafIds = (rows: readonly MapRow<N>[]): string[] => rows.flatMap((r) => (r.kind === "leaf" ? [r.id] : []));
  const columns: MapColumn<N>[] = [];
  const loose = new Map<string, N[]>();
  for (const n of level) {
    if (hasKids(n)) {
      seen.add(n.id);
      const rows = (kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, 0));
      columns.push({ id: n.id, axis: n.axis, label: n.label, rationale: n.rationale === "" ? null : n.rationale, rows, leafIds: leafIds(rows) });
    } else {
      const axis = n.axis.trim() === "" ? "variant" : n.axis.trim();
      loose.set(axis, [...(loose.get(axis) ?? []), n]);
    }
  }
  for (const [axis, ns] of loose) {
    const rows = ns.map((n): MapRow<N> => ({ kind: "leaf", id: n.id, depth: 0, node: n }));
    columns.push({ id: `axis:${axis}`, axis, label: axis, rationale: null, rows, leafIds: leafIds(rows) });
  }
  const leaves = columns.flatMap((c) => c.rows.flatMap((r) => (r.kind === "leaf" ? [r.node] : [])));
  return { root, columns, leaves };
}

/* ── the hunt at rest ──────────────────────────────────────────────────── */

export type HuntCounts = { readonly leaves: number; readonly rendered: number; readonly awaiting: number; readonly failed: number; readonly winners: number };

export function countsOf(nodes: readonly HuntNodeView[]): HuntCounts {
  const l = buildTree(nodes).leaves;
  return {
    leaves: l.length,
    rendered: l.filter((x) => x.state === "rendered").length,
    awaiting: l.filter((x) => x.state === "awaiting-return").length,
    failed: l.filter((x) => x.state === "failed").length,
    winners: l.filter((x) => x.winner).length,
  };
}

/** Seconds to a tenth under ten (an SFX leaf can be 0.6 s), m:ss above. */
export function lengthOf(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "–";
  // The tenth is taken before the threshold: 9.96 s is "0:10", like 10 s, never "10s".
  const t = Math.round(s * 10) / 10;
  if (t < 10) return `${t}s`;
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

/** The operator's own examples (v1 round-4 brief): the idea box shows the SHAPE of a good idea. */
export const IDEA_EXAMPLE = {
  music: "a tense but hopeful underscore for a 60s explainer about inflation",
  sfx: "a satisfying UI confirm sound",
} as const;

/* ── selection ─────────────────────────────────────────────────────────── */

export type Selection = { readonly ids: readonly string[]; readonly anchor: string | null };
export const EMPTY_SELECTION: Selection = { ids: [], anchor: null };

const inOrder = (order: readonly string[], ids: readonly string[]): string[] => {
  const want = new Set(ids);
  return order.filter((o) => want.has(o));
};

/** Plain replaces, toggle adds or drops one, shift extends a range in board order from the anchor. */
export function clickSelect(sel: Selection, order: readonly string[], id: string, mods: { readonly shift?: boolean; readonly toggle?: boolean } = {}): Selection {
  if (!order.includes(id)) return sel;
  if (mods.shift === true && sel.anchor !== null && order.includes(sel.anchor)) {
    const a = order.indexOf(sel.anchor);
    const b = order.indexOf(id);
    return { ids: inOrder(order, [...sel.ids, ...order.slice(Math.min(a, b), Math.max(a, b) + 1)]), anchor: sel.anchor };
  }
  if (mods.toggle === true || mods.shift === true) {
    const has = sel.ids.includes(id);
    return { ids: has ? sel.ids.filter((x) => x !== id) : inOrder(order, [...sel.ids, id]), anchor: id };
  }
  return { ids: [id], anchor: id };
}

/** A branch's whole set of leaves - or, when all of them are already held, none of them. */
export function toggleGroup(sel: Selection, order: readonly string[], group: readonly string[]): Selection {
  const all = group.length > 0 && group.every((g) => sel.ids.includes(g));
  return { ids: all ? sel.ids.filter((x) => !group.includes(x)) : inOrder(order, [...sel.ids, ...group]), anchor: all ? sel.anchor : (group[0] ?? sel.anchor) };
}

/* ── the render plan ───────────────────────────────────────────────────── */

/** How a leaf's engine is reached from the hunt: rendered by the desk's producer, by hand, or not. */
export type Reach = "render" | "hand" | "none";

export type RenderPlan<N extends HuntNodeView = HuntNodeView> = {
  readonly render: readonly N[];
  readonly byHand: readonly N[];
  readonly unreachable: readonly N[];
  readonly settled: readonly N[];
  /** Seconds of audio the render asks for - what the receipt prices. */
  readonly seconds: number;
};

/** Total seconds of audio, to a tenth. */
export const secondsOf = (nodes: readonly Pick<HuntNodeView, "durationS">[]): number =>
  Math.round(nodes.reduce((a, n) => a + (Number.isFinite(n.durationS) && n.durationS > 0 ? n.durationS : 0), 0) * 10) / 10;

/**
 * What "render the selection" will do. Only a reachable leaf in `idea` or `failed` spends: a
 * heard leaf is not rendered twice by a selection, a leaf in flight is not queued again, and a
 * branch is never a unit (only leaves render).
 */
export function renderPlan<N extends HuntNodeView>(nodes: readonly N[], selected: readonly string[], reach: (provider: string) => Reach): RenderPlan<N> {
  const leaves = new Set(buildTree(nodes).leaves.map((l) => l.id));
  const want = new Set(selected);
  const render: N[] = [];
  const byHand: N[] = [];
  const unreachable: N[] = [];
  const settled: N[] = [];
  for (const n of nodes) {
    if (!want.has(n.id) || !leaves.has(n.id)) continue;
    const r = reach(n.provider);
    if (n.state === "rendered" || n.state === "rendering") settled.push(n);
    else if (r === "hand") byHand.push(n);
    else if (r === "none") unreachable.push(n);
    else render.push(n);
  }
  return { render, byHand, unreachable, settled, seconds: secondsOf(render) };
}

/* ── the hunt, squared with the store ──────────────────────────────────── */

export const INTERRUPTED = "interrupted before a take came back";

/**
 * A stored hunt's nodes, squared with the takes filed against it (huntId + nodeId). A take the
 * node does not list yet is attached and the leaf is heard; a leaf `rendering` with no take is
 * failed with INTERRUPTED - unless a render job is still in flight for it (`inFlight`), which v1
 * could not know and so failed a leaf the render was about to answer.
 */
export function reconcile<N extends HuntNodeView>(huntId: string, nodes: readonly N[], takes: readonly { readonly id: string; readonly huntId: string | null; readonly nodeId: string | null }[], inFlight: ReadonlySet<string> = new Set()): N[] {
  const mine = takes.filter((t) => t.huntId === huntId);
  return nodes.map((n) => {
    const found = mine.filter((t) => t.nodeId === n.id).map((t) => t.id);
    const ids = [...n.takeIds, ...found.filter((id) => !n.takeIds.includes(id))];
    if (ids.length > 0 && n.state !== "rendered") return { ...n, takeIds: ids, state: "rendered", error: null };
    if (ids.length === 0 && n.state === "rendering" && !inFlight.has(n.id)) return { ...n, state: "failed", error: INTERRUPTED };
    return ids.length === n.takeIds.length ? n : { ...n, takeIds: ids };
  });
}

/* ── the crown ─────────────────────────────────────────────────────────── */

export type CrownTake = { readonly id: string; readonly verdict: string; readonly stage: string | null };

/**
 * May this take be crowned (on) or uncrowned (off)? A crown is a KEEP: the take lands pending on
 * the Arrange board. It never overrules a verdict somebody gave (a rejected take stays rejected),
 * and an uncrown only reaches back into the take while it still sits where a crown put it - once
 * Arrange has moved it on, it is that board's.
 */
export function admitCrown(leaf: Pick<HuntNodeView, "label" | "state" | "takeIds" | "winner">, take: CrownTake, on: boolean): { readonly ok: true; readonly keep: boolean; readonly unkeep: boolean } | { readonly ok: false; readonly reason: string } {
  if (!leaf.takeIds.includes(take.id)) return { ok: false, reason: `${leaf.label} did not make that take` };
  if (on) {
    if (take.verdict === "rejected") return { ok: false, reason: `${leaf.label}: the take was rejected; a crown does not overrule a verdict` };
    return { ok: true, keep: take.verdict === "unjudged", unkeep: false };
  }
  if (!leaf.winner) return { ok: false, reason: `${leaf.label} wears no crown` };
  const pending = take.verdict === "kept" && (take.stage === null || take.stage === "pending");
  return { ok: true, keep: false, unkeep: pending };
}

/* ── a leaf, briefed ───────────────────────────────────────────────────── */

/** The envelope-first anatomy of an SFX prompt (sound-effect-generation / envelope-first-briefing). */
export const SFX_PARTS = ["event", "material", "attack", "body", "tail", "space", "duration", "loop"] as const;
export type SfxPart = (typeof SFX_PARTS)[number];

/** The fields the drafter labelled, in briefing order; unlabelled prose yields nothing - never a guess. */
export function sfxAnatomy(prompt: string): { readonly part: SfxPart; readonly text: string }[] {
  const out: { part: SfxPart; text: string }[] = [];
  const re = new RegExp(`\\b(${SFX_PARTS.join("|")})\\s*:\\s*([^;·|\\n]+)`, "gi");
  for (let m = re.exec(prompt); m !== null; m = re.exec(prompt)) {
    const word = (m[1] ?? "").toLowerCase();
    const part = SFX_PARTS.find((p) => p === word);
    const text = (m[2] ?? "").trim().replace(/[.,]$/, "");
    if (part !== undefined && text !== "" && !out.some((o) => o.part === part)) out.push({ part, text });
  }
  return out.sort((a, b) => SFX_PARTS.indexOf(a.part) - SFX_PARTS.indexOf(b.part));
}

/**
 * Whether an SFX leaf asks for a loop. The node's own flag decides; only a hunt stored before
 * the flag reads the prompt - a labelled `loop:` field first ("loop: no" is a one-shot, which a
 * bare word match read as a loop: v1's r2 capture), then the loop-seam technique or the words.
 */
export function loopOf(node: Pick<HuntNodeView, "technique" | "prompt" | "label"> & { readonly loop?: boolean | null }): boolean {
  if (typeof node.loop === "boolean") return node.loop;
  const field = sfxAnatomy(node.prompt).find((a) => a.part === "loop");
  // Whole words: an unanchored prefix read "one-shot", "once" and "only" as `on` and sent a one-shot
  // effect to the vendor as a loop.
  if (field !== undefined) return /^(yes|true|on|seamless|loop(?:ing|able)?)\b/i.test(field.text);
  return node.technique.includes("loop-seam-acceptance") || /(loop|loopable|looping|seamless loop)/i.test(`${node.label} ${node.prompt}`);
}
