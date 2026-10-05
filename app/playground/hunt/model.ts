// THE HUNT'S ARITHMETIC — pure, no React, no fetch, so a probe can drive every
// branch (tests/golden-path/sound-hunt.probe.spec.ts).
//
// A hunt (lib/sound/types.ts#Hunt) is a flat list of nodes linked by
// `parentId`, drafted by the text engine. Nothing in the contract promises the
// SHAPE of that list: the drafter may emit one root node carrying the idea with
// axes beneath it, or bare axes with no root, or leaves with no branch at all
// (an axis named only on the leaf). A board that trusted one shape would draw
// the others as a heap. So the shape is NORMALISED here, once:
//
//   root     the single parentless node, IF it has children — otherwise the
//            hunt's own `idea` is the root and no node is spent on it;
//   columns  one per top-level branch; a branch's descendants are listed
//            beneath it depth-first, inner branches as group rows;
//   loose    top-level leaves are gathered into a column per `axis`, because
//            the axis is the one thing every node carries.
//
// A LEAF is a node with no children, and only leaves render: a branch is a
// question ("which tempo?"), a leaf is an answer you can listen to.

import type {
  GenerateRequest,
  Hunt,
  HuntNode,
  Lesson,
  ProviderId,
  SoundKind,
  SoundTake,
} from "@/lib/sound/types";

/* ── the tree ──────────────────────────────────────────────────────────── */

export type MapRow =
  | {
      kind: "group";
      id: string;
      label: string;
      axis: string;
      depth: number;
      node: HuntNode;
    }
  | { kind: "leaf"; id: string; depth: number; node: HuntNode };

export interface MapColumn {
  id: string;
  axis: string;
  label: string;
  rationale: string | null;
  /** null when the column was gathered from loose leaves sharing an axis. */
  node: HuntNode | null;
  rows: MapRow[];
}

export interface HuntTree {
  /** The parentless node that stands for the idea, when the drafter emitted one. */
  rootNode: HuntNode | null;
  columns: MapColumn[];
  /** Every leaf, in board order (column by column, top to bottom). */
  leaves: HuntNode[];
}

export function buildTree(nodes: readonly HuntNode[]): HuntTree {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const kids = new Map<string, HuntNode[]>();
  const tops: HuntNode[] = [];
  for (const n of nodes) {
    // A parent the list does not contain is no parent: the node is drawn at the
    // top rather than dropped, because a dropped leaf is a variant nobody hears.
    const p =
      n.parentId && n.parentId !== n.id && byId.has(n.parentId)
        ? n.parentId
        : null;
    if (p === null) tops.push(n);
    else kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const hasKids = (n: HuntNode) => (kids.get(n.id)?.length ?? 0) > 0;

  let rootNode: HuntNode | null = null;
  let level = tops;
  if (tops.length === 1 && hasKids(tops[0])) {
    rootNode = tops[0];
    level = kids.get(rootNode.id) ?? [];
  }

  const columns: MapColumn[] = [];
  const loose = new Map<string, HuntNode[]>();
  const seen = new Set<string>();
  const rowsOf = (n: HuntNode, depth: number): MapRow[] => {
    // A cycle in parentId would recurse forever; the second visit is cut.
    if (seen.has(n.id)) return [];
    seen.add(n.id);
    if (!hasKids(n)) return [{ kind: "leaf", id: n.id, depth, node: n }];
    return [
      { kind: "group", id: n.id, label: n.label, axis: n.axis, depth, node: n },
      ...(kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, depth + 1)),
    ];
  };

  for (const n of level) {
    if (hasKids(n)) {
      seen.add(n.id);
      columns.push({
        id: n.id,
        axis: n.axis,
        label: n.label,
        rationale: n.rationale || null,
        node: n,
        rows: (kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, 0)),
      });
    } else {
      const axis = n.axis.trim() || "variant";
      loose.set(axis, [...(loose.get(axis) ?? []), n]);
    }
  }
  for (const [axis, ns] of loose) {
    columns.push({
      id: `axis:${axis}`,
      axis,
      label: axis,
      rationale: null,
      node: null,
      rows: ns.map((n) => ({
        kind: "leaf" as const,
        id: n.id,
        depth: 0,
        node: n,
      })),
    });
  }

  const leaves = columns.flatMap((c) =>
    c.rows.flatMap((r) => (r.kind === "leaf" ? [r.node] : [])),
  );
  return { rootNode, columns, leaves };
}

export const isLeaf = (tree: HuntTree, id: string) =>
  tree.leaves.some((l) => l.id === id);

/* ── the layout ────────────────────────────────────────────────────────── */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLayout {
  width: number;
  height: number;
  root: Box;
  columns: {
    id: string;
    header: Box;
    rows: { id: string; kind: MapRow["kind"]; box: Box }[];
  }[];
  /** SVG path data, in layout coordinates. `to` names the node the edge enters. */
  edges: { id: string; to: string; d: string }[];
}

export const DIMS = {
  pad: 12,
  rootW: 208,
  rootH: 236,
  /** Between the root and the branch cards — where the fan curves live. */
  fanW: 40,
  headerW: 200,
  /** Between a branch card and its first leaf — where the comb's spine runs. */
  busW: 26,
  leafW: 256,
  leafH: 204,
  leafGap: 12,
  /** The comb above each line of leaves. */
  combH: 16,
  lineGap: 12,
  groupH: 30,
  branchGap: 26,
} as const;

export type Dims = { [K in keyof typeof DIMS]: number };

/** The width of everything left of the first leaf, plus the right margin. */
const fixedW = (d: Dims) =>
  d.pad + d.rootW + d.fanW + d.headerW + d.busW + d.pad;

/** How many leaves a line holds in a viewport `viewW` wide — at least one,
 *  at most six (past six a branch stops reading as one row of answers). */
export function leavesPerLine(viewW: number, d: Dims = DIMS): number {
  const n = Math.floor((viewW - fixedW(d) + d.leafGap) / (d.leafW + d.leafGap));
  return Math.max(1, Math.min(6, n));
}

/**
 * A left-to-right mind map in fixed layout units: the idea on the left, a
 * card per branch fanned to its right, and each branch's leaves combed into
 * lines of `perLine` beside it. Fixed card sizes keep the board deterministic
 * — the cards clamp their text to fit; the layout never measures the DOM.
 * `perLine` is the one input the viewport decides, so a wide screen gets
 * wider rows instead of smaller type.
 */
export function layoutTree(
  tree: HuntTree,
  perLine: number,
  d: Dims = DIMS,
): MapLayout {
  const per = Math.max(1, Math.floor(perLine));
  const linesW = per * d.leafW + (per - 1) * d.leafGap;
  const width = fixedW(d) + linesW;
  const hx = d.pad + d.rootW + d.fanW;
  const x0 = hx + d.headerW + d.busW;
  const busX = hx + d.headerW + d.busW / 2;

  const columns: MapLayout["columns"] = [];
  const edges: MapLayout["edges"] = [];
  let y = d.pad;

  for (const c of tree.columns) {
    // Lines: a group row breaks the line and takes a thin line of its own.
    type Line = { group: MapRow } | { leaves: MapRow[] };
    const lines: Line[] = [];
    for (const r of c.rows) {
      const last = lines[lines.length - 1];
      if (r.kind === "group") lines.push({ group: r });
      else if (last && "leaves" in last && last.leaves.length < per)
        last.leaves.push(r);
      else lines.push({ leaves: [r] });
    }

    const top = y;
    const header: Box = { x: hx, y: top + d.combH, w: d.headerW, h: d.leafH };
    const hookY = header.y + 30;
    const rows: MapLayout["columns"][number]["rows"] = [];
    let ly = top;
    for (const line of lines) {
      if ("group" in line) {
        rows.push({
          id: line.group.id,
          kind: "group",
          box: { x: x0, y: ly, w: linesW, h: d.groupH },
        });
        ly += d.groupH + 4;
        continue;
      }
      const busY = ly + d.combH / 2;
      const boxes = line.leaves.map((r, i) => ({
        id: r.id,
        kind: "leaf" as const,
        box: {
          x: x0 + i * (d.leafW + d.leafGap),
          y: ly + d.combH,
          w: d.leafW,
          h: d.leafH,
        },
      }));
      rows.push(...boxes);
      const lastCx = boxes[boxes.length - 1].box.x + d.leafW / 2;
      edges.push({
        id: `${c.id}>line@${ly}`,
        to: c.id,
        d: `M ${hx + d.headerW} ${hookY} H ${busX} V ${busY} H ${lastCx}`,
      });
      for (const b of boxes) {
        const cx = b.box.x + d.leafW / 2;
        edges.push({
          id: `${c.id}>${b.id}`,
          to: b.id,
          d: `M ${cx} ${busY} V ${b.box.y}`,
        });
      }
      ly += d.combH + d.leafH + d.lineGap;
    }
    const bottom = Math.max(header.y + header.h, ly - d.lineGap);
    columns.push({ id: c.id, header, rows });
    y = bottom + d.branchGap;
  }

  // The idea sits level with the first branch rather than at the middle of
  // the board: a tall map would otherwise open on an empty corner, with the
  // one card that names the problem a screen below the fold.
  const root: Box = {
    x: d.pad,
    y: columns[0]?.header.y ?? d.pad + d.combH,
    w: d.rootW,
    h: d.rootH,
  };
  const rootOut = { x: root.x + root.w, y: root.y + 30 };
  for (const c of columns) {
    const ty = c.header.y + 30;
    const cx = rootOut.x + d.fanW / 2;
    edges.unshift({
      id: `root>${c.id}`,
      to: c.id,
      d: `M ${rootOut.x} ${rootOut.y} C ${cx} ${rootOut.y}, ${cx} ${ty}, ${hx} ${ty}`,
    });
  }

  const height = Math.max(y - d.branchGap, root.y + root.h) + d.pad;
  return { width, height, root, columns, edges };
}

/** The scale that fits a layout's width into a viewport, never enlarging past
 *  1 — the board scrolls down, so only the width has to fit. */
export const fitScale = (layoutW: number, viewW: number) =>
  layoutW <= 0 || viewW <= 0 ? 1 : Math.min(1, viewW / layoutW);

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

/* ── the render plan ───────────────────────────────────────────────────── */

/** How a provider is reached in this deployment (app/playground/engines.ts#Transport). */
export type Reach = "api" | "manual" | "none";

export interface RenderPlan {
  /** ElevenLabs leaves that will be rendered, in board order. */
  render: HuntNode[];
  /** Suno leaves — a manual round trip each, not a render. */
  byHand: HuntNode[];
  /** Leaves whose engine is declared but not installed, or withheld here. */
  unreachable: HuntNode[];
  /** Selected leaves that already have a take, or are rendering now. */
  settled: HuntNode[];
  /** Seconds of audio the render will request — the one exact link of the price. */
  seconds: number;
}

/**
 * What "render the selection" will actually do. Only an `api` leaf in state
 * `idea` or `failed` spends; a rendered leaf is not rendered twice by a
 * selection (re-rendering is a deliberate act on the leaf itself), and a
 * leaf already in flight is not queued again.
 */
export function renderPlan(
  nodes: readonly HuntNode[],
  selected: readonly string[],
  reach: (p: ProviderId) => Reach,
): RenderPlan {
  const plan: RenderPlan = {
    render: [],
    byHand: [],
    unreachable: [],
    settled: [],
    seconds: 0,
  };
  const want = new Set(selected);
  for (const n of nodes) {
    if (!want.has(n.id)) continue;
    const r = reach(n.provider);
    if (n.state === "rendered" || n.state === "rendering") plan.settled.push(n);
    else if (r === "manual") plan.byHand.push(n);
    else if (r === "none") plan.unreachable.push(n);
    else plan.render.push(n);
  }
  plan.seconds = secondsOf(plan.render);
  return plan;
}

/** Total seconds of audio, to a tenth — an SFX leaf can be half a second. */
export const secondsOf = (nodes: readonly Pick<HuntNode, "durationS">[]) =>
  Math.round(
    nodes.reduce(
      (a, n) =>
        a + (Number.isFinite(n.durationS) && n.durationS > 0 ? n.durationS : 0),
      0,
    ) * 10,
  ) / 10;

/* ── a leaf, briefed ───────────────────────────────────────────────────── */

/**
 * Whether an SFX leaf asks for a loop. The node's own `loop` decides
 * (HuntNode.loop, drafted by the sound-hunt turn since the r4 closeout). A
 * hunt stored before the field reads it as null, and only then is the prompt
 * read: a labelled `loop:` field in an envelope-first prompt — "loop: no" is a
 * one-shot, which a bare word match read as a loop (r2 capture: every UI tap
 * drew the loop glyph) — then the loop-seam technique or the prompt's words.
 * The glyph on the card and the flag the render sends are this one answer.
 */
export function loopOf(
  node: Pick<HuntNode, "technique" | "prompt" | "label"> & {
    loop?: boolean | null;
  },
): boolean {
  if (typeof node.loop === "boolean") return node.loop;
  const field = sfxAnatomy(node.prompt).find((a) => a.part === "loop");
  if (field) return /^(yes|true|on|seamless|loop)/i.test(field.text);
  return (
    node.technique.includes("loop-seam-acceptance") ||
    /(loop|loopable|looping|seamless loop)/i.test(
      `${node.label} ${node.prompt}`,
    )
  );
}

/** The envelope-first anatomy of an SFX prompt (media-generation /
 *  sound-effect-generation / envelope-first-briefing): the fields the drafter
 *  labelled, in the briefing order. Unlabelled prose yields nothing — the
 *  prompt is then shown as written, never re-parsed into a guess. */
export const SFX_PARTS = [
  "event",
  "material",
  "attack",
  "body",
  "tail",
  "space",
  "duration",
  "loop",
] as const;
export type SfxPart = (typeof SFX_PARTS)[number];

export function sfxAnatomy(prompt: string): { part: SfxPart; text: string }[] {
  const out: { part: SfxPart; text: string }[] = [];
  const re = new RegExp(
    `\\b(${SFX_PARTS.join("|")})\\s*:\\s*([^;·|\\n]+)`,
    "gi",
  );
  for (let m = re.exec(prompt); m; m = re.exec(prompt)) {
    const part = m[1].toLowerCase() as SfxPart;
    const text = m[2].trim().replace(/[.,]$/, "");
    if (text && !out.some((o) => o.part === part)) out.push({ part, text });
  }
  return out.sort(
    (a, b) => SFX_PARTS.indexOf(a.part) - SFX_PARTS.indexOf(b.part),
  );
}

/** The generate request one leaf makes, from the leaf's own fields — terms,
 *  tempo, key and loop are what the drafter stated beside the prompt, never
 *  re-read from its text. Nothing is clamped: a duration the engine refuses
 *  comes back as the engine's own words on the leaf. Prompt influence stays
 *  the vendor's default (null): a hunt varies the brief, not the knob. */
export function generateRequestFor(
  hunt: Pick<Hunt, "id" | "kind">,
  node: HuntNode,
): GenerateRequest {
  const sfx = hunt.kind === "sfx";
  return {
    kind: hunt.kind,
    provider: "elevenlabs",
    op: sfx ? "sfx" : "compose",
    prompt: node.prompt,
    negative: node.negative,
    durationS: node.durationS,
    loop: sfx ? loopOf(node) : null,
    promptInfluence: null,
    technique: [...node.technique],
    terms: {
      genre: [...node.terms.genre],
      mood: [...node.terms.mood],
      instrument: [...node.terms.instrument],
      sfxCategory: node.terms.sfxCategory,
    },
    tempoBpm: sfx ? null : node.tempoBpm,
    key: sfx ? null : node.key,
    origin: "hunt",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: hunt.id,
    nodeId: node.id,
    title: node.label,
  };
}

/** Replace one node in the list, leaving the others untouched. */
export const withNode = (
  nodes: readonly HuntNode[],
  id: string,
  patch: Partial<HuntNode>,
): HuntNode[] => nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));

/* ── the hunt, squared with the store ─────────────────────────────────── */

/**
 * A hunt as stored, squared with the takes that exist. A take filed against a
 * node (huntId + nodeId) that the node does not list yet — a render that
 * finished after the page that asked for it was closed — is attached. A node
 * left `rendering` with no take was interrupted; it reads as failed with that
 * reason, locally, so it can be rendered again rather than spin forever.
 */
export function reconcile(
  h: Hunt,
  takes: readonly Pick<SoundTake, "id" | "huntId" | "nodeId">[],
): Hunt {
  const mine = takes.filter((t) => t.huntId === h.id);
  if (!mine.length && !h.nodes.some((n) => n.state === "rendering")) return h;
  const nodes = h.nodes.map((n) => {
    const found = mine.filter((t) => t.nodeId === n.id).map((t) => t.id);
    const ids = [
      ...n.takeIds,
      ...found.filter((id) => !n.takeIds.includes(id)),
    ];
    if (ids.length && n.state !== "rendered")
      return { ...n, takeIds: ids, state: "rendered" as const, error: null };
    if (!ids.length && n.state === "rendering")
      return {
        ...n,
        state: "failed" as const,
        error: "interrupted before a take came back",
      };
    return ids.length !== n.takeIds.length ? { ...n, takeIds: ids } : n;
  });
  return { ...h, nodes };
}

/* ── the hunt at rest ──────────────────────────────────────────────────── */

export interface HuntCounts {
  leaves: number;
  rendered: number;
  awaiting: number;
  failed: number;
  winners: number;
}

export function countsOf(hunt: Pick<Hunt, "nodes">): HuntCounts {
  const t = buildTree(hunt.nodes);
  return {
    leaves: t.leaves.length,
    rendered: t.leaves.filter((l) => l.state === "rendered").length,
    awaiting: t.leaves.filter((l) => l.state === "awaiting-return").length,
    failed: t.leaves.filter((l) => l.state === "failed").length,
    winners: t.leaves.filter((l) => l.winner).length,
  };
}

/** A leaf's length: seconds to a tenth under ten (an SFX leaf can be 0.6s),
 *  m:ss above. */
export function lengthOf(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "–";
  if (s < 10) return `${Math.round(s * 10) / 10}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Example problems for the idea box, per kind — the operator's own examples
 *  from the round-4 brief, so the box shows the SHAPE of a good idea. */
export const IDEA_EXAMPLE: Record<SoundKind, string> = {
  music: "a tense but hopeful underscore for a 60s explainer about inflation",
  sfx: "a satisfying UI confirm sound",
};

/* ── the lesson's evidence ─────────────────────────────────────────────── */

export interface HuntEvidence {
  /** Leaves that have a take to judge. */
  heard: HuntNode[];
  winners: HuntNode[];
  /** Axes the winners came from, most first. */
  axes: { axis: string; n: number }[];
  /** Techniques on winners, with how many losers carried the same one. */
  techniques: { technique: string; won: number; lost: number }[];
  takeIds: string[];
}

/** What the hunt measured, read off the nodes alone: which axis and which
 *  technique the winners share, against the leaves that were heard and lost. */
export function evidenceOf(hunt: Pick<Hunt, "nodes">): HuntEvidence {
  const leaves = buildTree(hunt.nodes).leaves;
  const heard = leaves.filter((l) => l.state === "rendered");
  const winners = heard.filter((l) => l.winner);
  const losers = heard.filter((l) => !l.winner);
  const axisN = new Map<string, number>();
  for (const w of winners) axisN.set(w.axis, (axisN.get(w.axis) ?? 0) + 1);
  const tech = new Map<string, { won: number; lost: number }>();
  for (const w of winners)
    for (const t of w.technique)
      tech.set(t, {
        won: (tech.get(t)?.won ?? 0) + 1,
        lost: tech.get(t)?.lost ?? 0,
      });
  for (const l of losers)
    for (const t of l.technique) if (tech.has(t)) tech.get(t)!.lost++;
  return {
    heard,
    winners,
    axes: [...axisN]
      .map(([axis, n]) => ({ axis, n }))
      .sort((a, b) => b.n - a.n),
    techniques: [...tech]
      .map(([technique, v]) => ({ technique, ...v }))
      .sort((a, b) => b.won - a.won || a.lost - b.lost),
    takeIds: winners.flatMap((w) => w.takeIds.slice(-1)),
  };
}

/**
 * A lesson the operator writes by hand, its evidence filled from the hunt —
 * the path when the text engine cannot draft one. The claim starts empty: a
 * lesson is a human's sentence, and an empty box is more honest than a
 * template pretending to be a finding.
 */
export function handLesson(
  hunt: Pick<Hunt, "id" | "kind" | "nodes">,
): Omit<Lesson, "id" | "confirmedAt"> {
  const e = evidenceOf(hunt);
  const providers = [...new Set(e.winners.map((w) => w.provider))];
  return {
    kind: hunt.kind,
    source: "hunt",
    provider: providers.length === 1 ? providers[0] : null,
    huntId: hunt.id,
    claim: "",
    technique: e.techniques.filter((t) => t.won > 0).map((t) => t.technique),
    evidence: {
      n: e.heard.length,
      keepRate: e.heard.length
        ? Math.round((e.winners.length / e.heard.length) * 100) / 100
        : null,
      meanScore: null,
      takeIds: e.takeIds,
    },
  };
}
