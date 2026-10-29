import { parseAt } from "./door.ts";
import { ok, type Result } from "./errors.ts";
import {
  STUDIO_ACTION_KINDS,
  STUDIO_ACTION_SCHEMAS,
  STUDIO_MAX,
  STUDIO_NODE_KINDS,
  STUDIO_NODE_SCHEMAS,
  studioTurnEnvelopeSchema,
  type StudioAction,
  type StudioActionKind,
  type StudioDropped,
  type StudioNode,
  type StudioNodeKind,
  type StudioTurn,
} from "./audio.studio.ts";

// THE ONE DOOR FOR A STUDIO TURN (registry schema-driven-ui: one validation door, honest repair).
// Every turn - an agent's answer through the MCP door, a recorded session, a fixture - passes here
// before a page renders it. A broken ENVELOPE refuses the whole turn (nothing to attribute it to).
// A broken NODE or ACTION is dropped on its own and SAID: `dropped` names where it was, what it
// claimed to be and why, so the page can show "1 piece could not be shown" and the agent's author
// gets a measurable defect. Never silent, never all-or-nothing.

export type ParsedTurn = { readonly turn: StudioTurn; readonly dropped: readonly StudioDropped[] };

const kindOf = (v: unknown): string => (typeof v === "object" && v !== null && typeof (v as { kind?: unknown }).kind === "string" ? (v as { kind: string }).kind : "?");

/** Node kinds an action may point at, per action kind (`play` plays anything that carries audio). */
const TARGETS: Partial<Record<StudioActionKind, readonly StudioNodeKind[]>> = {
  play: ["track", "stems", "duel", "candidates"],
  hear: ["candidates"],
  use_candidate: ["candidates"],
  settle_pull: ["pull"],
  pick: ["duel"],
};
const STEM_ACTIONS: readonly StudioActionKind[] = ["swap_stem", "mute", "solo", "level", "pan"];

export function parseStudioTurn(input: unknown): Result<ParsedTurn> {
  const env = parseAt("studio turn", studioTurnEnvelopeSchema, input);
  if (!env.ok) return env;
  const { show: rawShow = [], actions: rawActions = [], mix, ...rest } = env.value;
  const dropped: StudioDropped[] = [];
  const drop = (at: string, item: unknown, reason: string): void => {
    dropped.push({ at, kind: kindOf(item), reason });
  };
  if (mix !== undefined && rest.from === "agent") dropped.push({ at: "mix", kind: "mix", reason: "an agent turn carries no mix" });
  // `Parsed` widens a record's values to optional; the schema already refused an absent value.
  const head = mix !== undefined && rest.from === "user" ? { ...rest, mix: mix as NonNullable<StudioTurn["mix"]> } : rest;
  if (head.from === "user" && (rawShow.length > 0 || rawActions.length > 0)) {
    rawShow.forEach((n, i) => drop(`show[${i}]`, n, "a user turn shows nothing"));
    rawActions.forEach((a, i) => drop(`actions[${i}]`, a, "a user turn proposes nothing"));
    return ok({ turn: { ...head, show: [], actions: [] }, dropped });
  }

  const show: StudioNode[] = [];
  rawShow.forEach((raw, i) => {
    const at = `show[${i}]`;
    const kind = kindOf(raw);
    if (!(STUDIO_NODE_KINDS as readonly string[]).includes(kind)) return drop(at, raw, kind === "?" ? "not a node (no kind)" : `unknown kind "${kind}"`);
    if (show.length >= STUDIO_MAX.nodes) return drop(at, raw, `past the ${STUDIO_MAX.nodes}-piece cap`);
    const r = parseAt(at, STUDIO_NODE_SCHEMAS[kind as StudioNodeKind], raw);
    if (!r.ok) return drop(at, raw, r.error.message);
    const node = r.value as StudioNode;
    if (show.some((n) => n.id === node.id)) return drop(at, raw, `id "${node.id}" is already on screen`);
    const fault = nodeFault(node, rawShow);
    if (fault !== null) return drop(at, raw, fault);
    show.push(node);
  });

  const stems = new Set(show.flatMap((n) => (n.kind === "stems" ? n.rows.map((r) => r.id) : [])));
  const actions: StudioAction[] = [];
  rawActions.forEach((raw, i) => {
    const at = `actions[${i}]`;
    const kind = kindOf(raw);
    if (!(STUDIO_ACTION_KINDS as readonly string[]).includes(kind)) return drop(at, raw, kind === "?" ? "not an action (no kind)" : `unknown action "${kind}"`);
    if (actions.length >= STUDIO_MAX.actions) return drop(at, raw, `past the ${STUDIO_MAX.actions}-action cap`);
    const r = parseAt(at, STUDIO_ACTION_SCHEMAS[kind as StudioActionKind], raw);
    if (!r.ok) return drop(at, raw, r.error.message);
    const a = r.value as StudioAction;
    if (actions.some((x) => x.id === a.id)) return drop(at, raw, `action id "${a.id}" is used twice`);
    const fault = actionFault(a, show, stems);
    if (fault !== null) return drop(at, raw, fault);
    actions.push(a);
  });
  return ok({ turn: { ...head, show, actions }, dropped });
}

/** What a valid-looking node still gets wrong against itself or its turn; null when nothing. */
function nodeFault(node: StudioNode, rawShow: readonly unknown[]): string | null {
  if (node.kind === "stems") {
    const ids = node.rows.map((r) => r.id);
    const twice = ids.find((x, i) => ids.indexOf(x) !== i);
    if (twice !== undefined) return `stem id "${twice}" appears twice`;
    const sections = rawShow.find((n) => kindOf(n) === "sections") as { rows?: unknown[] } | undefined;
    const count = Array.isArray(sections?.rows) ? sections.rows.length : null;
    const off = count === null ? undefined : node.rows.find((r) => r.enters !== undefined && r.enters.length !== count);
    if (off !== undefined) return `stem "${off.id}" enters ${off.enters?.length} sections, the turn shows ${count}`;
  }
  if (node.kind === "candidates") {
    const ids = node.rows.map((r) => r.id);
    const twice = ids.find((x, i) => ids.indexOf(x) !== i);
    if (twice !== undefined) return `candidate "${twice}" appears twice`;
  }
  return null;
}

/** What a valid-looking action points at that this turn does not show; null when nothing. */
function actionFault(a: StudioAction, show: readonly StudioNode[], stems: ReadonlySet<string>): string | null {
  const targets = TARGETS[a.kind];
  if (targets !== undefined && "node" in a) {
    const node = show.find((n) => n.id === a.node);
    if (node === undefined) return `names piece "${a.node}", which is not on screen`;
    if (!targets.includes(node.kind)) return `a ${a.kind} cannot point at a ${node.kind} piece`;
    if ((a.kind === "hear" || a.kind === "use_candidate") && node.kind === "candidates" && !node.rows.some((r) => r.id === a.candidate))
      return `names candidate "${a.candidate}", which "${a.node}" does not offer`;
  }
  const stem = STEM_ACTIONS.includes(a.kind) || (a.kind === "play" && a.stem !== undefined) ? (a as { stem?: string }).stem : undefined;
  if (stem !== undefined && !stems.has(stem)) return `names stem "${stem}", which is not on screen`;
  return null;
}
