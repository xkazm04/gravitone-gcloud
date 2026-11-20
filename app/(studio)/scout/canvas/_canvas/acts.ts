// EVERY ACT THE CANVAS TAKES - over the store (./store.ts) and the port (../_port/contract.ts). An act changes the
// scene at once (the river redraws under the operator's hand), then asks the port; a refusal rolls the change back and
// shows the side's own sentence. A reel's road is the one exception to "at once": the port answers with where each
// reel now stands, and the screen plays the steps out (tables.ts CHAIN `ms`, motion only) before it lands there.

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { AudioState, CanvasSlot, ReelAudio, RoundGoal } from "../_port/contract.ts";
import { rescene } from "./scene/index.ts";
import type { Anchor } from "./scene/scopes.ts";
import type { Item, River } from "./scene/types.ts";
import type { CanvasStore, LogEntry } from "./store.ts";
import { CHAIN, CHAIN_DONE, chainIx, VERDICT, type ChainKey, type Decision, type Stance, type Verdict } from "./tables.ts";
import { hash } from "./scene/geo.ts";


/** The port's answer, or null after showing its refusal. */
async function ask<T>(st: CanvasStore, call: () => Promise<ActionResult<T>>): Promise<T | null> {
  st.ui.busy++;
  try {
    const r = await call();
    if (r.ok) return r.value;
    st.refuse(r.error.error);
    return null;
  } catch (e) {
    st.refuse(e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    st.ui.busy--;
    st.changed("ui");
  }
}

const redraw = (st: CanvasStore, touched: readonly River[], what: "verdict" | "audio" | "steer"): void => {
  rescene(st.scene, touched);
  st.changed(what);
};

/* ---------- verdicts (the Board's patch, undo, commit) ---------- */

function apply(it: Item, state: Item["state"]): void {
  it.state = state;
}

export function verdict(st: CanvasStore, it: Item, v: Verdict, extra: { reasons?: readonly string[]; note?: string } = {}): LogEntry {
  const V = VERDICT[v];
  const e: LogEntry = { it, prev: it.state, prevEp: it.ep, verdict: v, reasons: extra.reasons ?? [], note: extra.note ?? "", packet: it.node?.packet ?? null, committed: false };
  st.ui.log.push(e);
  apply(it, it.node !== null ? V.to : V.ep);
  redraw(st, [it.river], "verdict");
  if (it.node !== null) {
    void ask(st, () => st.port.verdicts({ changes: [{ node: it.id, verdict: v, reasons: e.reasons, ...(e.note === "" ? {} : { note: e.note }) }] })).then((ok) => {
      if (ok !== null) return;
      st.ui.log = st.ui.log.filter((x) => x !== e);
      apply(it, e.prev);
      redraw(st, [it.river], "verdict");
    });
  }
  return e;
}

export const uncommitted = (st: CanvasStore): LogEntry[] => st.ui.log.filter((e) => !e.committed);

export function undo(st: CanvasStore): LogEntry | null {
  const i = st.ui.log.map((e) => e.committed).lastIndexOf(false);
  if (i < 0) return null;
  const [e] = st.ui.log.splice(i, 1);
  if (e === undefined) return null;
  apply(e.it, e.prev);
  redraw(st, [e.it.river], "verdict");
  if (e.packet !== null) void ask(st, () => st.port.undo({ packet: e.packet as string }));
  return e;
}

/** Commits every packet an uncommitted verdict touched. Answers the packets. */
export async function commit(st: CanvasStore): Promise<readonly string[]> {
  const open = uncommitted(st);
  const packets = [...new Set(open.map((e) => e.packet).filter((p): p is string => p !== null))];
  if (open.length === 0) return [];
  const done = packets.length === 0 ? { packets: [] } : await ask(st, () => st.port.commit({ packets }));
  if (done === null) return [];
  for (const e of open) e.committed = true;
  st.changed("commit");
  st.say(`committed · ${packets.length} ${packets.length === 1 ? "packet" : "packets"}`);
  return packets;
}

/* ---------- notes, the goal, the steer ---------- */

export async function note(st: CanvasStore, a: Anchor, text: string, stance: Stance): Promise<boolean> {
  if (text.trim() === "" && stance === "") return false;
  const r = await ask(st, () => st.port.note({ kind: a.kind, key: a.key, name: a.name, text: text.trim(), stance }));
  if (r === null) return false;
  st.ui.notes = [...r.notes];
  st.changed("note");
  return true;
}

export async function unnote(st: CanvasStore, id: string): Promise<void> {
  const r = await ask(st, () => st.port.unnote({ id }));
  if (r === null) return;
  st.ui.notes = [...r.notes];
  st.changed("note");
}

export async function setGoal(st: CanvasStore, goal: RoundGoal): Promise<void> {
  const prev = st.ui.goal;
  st.ui.goal = goal;
  st.changed("steer");
  const r = await ask(st, () => st.port.goal(goal));
  st.ui.goal = r === null ? prev : r.goal;
  st.changed("steer");
}

export async function pause(st: CanvasStore, r: River): Promise<void> {
  if (r.synthetic || r.group === null) return;
  const was = r.paused;
  r.paused = !was;
  redraw(st, [r], "steer");
  const ok = await ask(st, () => st.port.pause({ ref: r.group as string, paused: !was }));
  if (ok === null) {
    r.paused = was;
    redraw(st, [r], "steer");
  }
}

export async function split(st: CanvasStore, audience: Record<string, number>): Promise<void> {
  const prev = st.ui.split;
  st.ui.split = audience;
  st.ui.splitSet = true;
  st.changed("steer");
  const r = await ask(st, () => st.port.split({ audience }));
  if (r === null) st.ui.split = prev;
  else st.ui.split = { ...r.split };
  st.changed("steer");
}

/* ---------- a reel's road to the calendar ---------- */

/** The record the port answered, held until the screen has played the steps out. */
const landing = new WeakMap<Item, { readonly audio: ReelAudio | undefined; readonly slot: CanvasSlot | null }>();

function startStep(it: Item, key: ChainKey, delay: number): void {
  const a = it.audio;
  if (a === null) return;
  const step = CHAIN[chainIx(key)];
  a.run = { key, t0: performance.now() + delay, dur: (step?.ms ?? 0) * (0.75 + hash(it.id + key) * 0.6) };
}

/** Plays `it` from where it stands to the port's answer. */
function play(st: CanvasStore, s: AudioState, its: readonly Item[]): void {
  its.forEach((it, i) => {
    const a = it.audio;
    if (a === null) return;
    const to = s.audio[it.id];
    const slot = s.slots.find((x) => x.node === it.id && x.state !== "cancelled") ?? null;
    landing.set(it, { audio: to, slot });
    const target = to?.step ?? a.step;
    a.queue = CHAIN.slice(a.step, target).map((c) => c.key).filter((k) => k !== "decide");
    const next = a.queue.shift();
    if (next !== undefined) startStep(it, next, i * 260);
    else land(st, it);
  });
  st.ui.slots = s.slots.filter((x) => x.state !== "cancelled");
  st.changed("audio");
}

function land(st: CanvasStore, it: Item): void {
  const a = it.audio;
  const l = landing.get(it);
  if (a === null || l === undefined) return;
  landing.delete(it);
  const had = a.slot;
  a.step = l.audio?.step ?? a.step;
  a.brief = l.audio?.brief ?? a.brief;
  a.decision = l.audio?.decision ?? a.decision;
  a.channel = l.audio?.channel ?? a.channel;
  a.slot = l.slot;
  a.run = null;
  if (had === null && l.slot !== null) {
    const port = st.scene.chanById.get(l.slot.channel)?.port ?? null;
    if (port !== null) st.ui.flyers.push({ it, port, slot: l.slot, t0: performance.now(), dur: 1500 });
  }
}

/** Advances the played steps; called every frame. */
export function tick(st: CanvasStore, now: number): void {
  let any = false;
  for (const it of st.scene.reels) {
    const a = it.audio;
    const r = a?.run ?? null;
    if (a === null || r === null || now < r.t0 + r.dur) continue;
    a.step = Math.max(a.step, chainIx(r.key) + 1);
    a.run = null;
    const next = a.queue.shift();
    if (next !== undefined) startStep(it, next, 60);
    else land(st, it);
    any = true;
  }
  if (any) redraw(st, [], "audio");
  if (st.ui.flyers.length > 0) st.ui.flyers = st.ui.flyers.filter((f) => now < f.t0 + f.dur);
}

const ids = (its: readonly Item[]): string[] => its.map((it) => it.id);

export async function brief(st: CanvasStore, its: readonly Item[]): Promise<void> {
  const todo = its.filter((it) => it.audio !== null && it.audio.step === 0 && it.audio.run === null);
  if (todo.length === 0) return;
  const s = await ask(st, () => st.port.audio({ verb: "brief", nodes: ids(todo) }));
  if (s !== null) play(st, s, todo);
}

export async function decide(st: CanvasStore, it: Item, d: Decision): Promise<void> {
  const a = it.audio;
  if (a === null) return;
  const prev = a.decision;
  a.decision = d;
  st.changed("audio");
  const s = await ask(st, () => st.port.audio({ verb: "decide", node: it.id, decision: d }));
  if (s === null) {
    a.decision = prev;
    st.changed("audio");
  }
}

/** A reel may run when its brief is in, a choice is made, and its cut is not laid yet. */
export const canRun = (it: Item): boolean => {
  const a = it.audio;
  if (a === null || a.step >= 4 || a.run !== null) return false;
  return a.step >= 1 && a.decision !== null && Object.values(a.decision).some((v) => v !== "none");
};

export async function run(st: CanvasStore, its: readonly Item[], toCalendar: boolean): Promise<number> {
  const todo = its.filter(canRun);
  if (todo.length === 0) return 0;
  const s = await ask(st, () => st.port.audio({ verb: "run", nodes: ids(todo), toCalendar, cadence: st.ui.cadence }));
  if (s !== null) play(st, s, todo);
  return s === null ? 0 : todo.length;
}

export async function schedule(st: CanvasStore, its: readonly Item[]): Promise<number> {
  const todo = its.filter((it) => it.audio !== null && it.audio.step === CHAIN_DONE - 1 && it.audio.run === null);
  if (todo.length === 0) return 0;
  const s = await ask(st, () => st.port.audio({ verb: "schedule", nodes: ids(todo), cadence: st.ui.cadence }));
  if (s !== null) play(st, s, todo);
  return s === null ? 0 : todo.length;
}

export async function slotAct(st: CanvasStore, verb: "move" | "cancel" | "publish", slot: CanvasSlot, by = 0): Promise<void> {
  const s = await ask(st, () => st.port.audio(verb === "move" ? { verb, slot: slot.id, by } : { verb, slot: slot.id }));
  if (s === null) return;
  const it = st.scene.itemBy.get(slot.node);
  if (it !== undefined && it.audio !== null) {
    const to = s.audio[it.id];
    it.audio.step = to?.step ?? it.audio.step;
    it.audio.slot = s.slots.find((x) => x.node === it.id && x.state !== "cancelled") ?? null;
  }
  st.ui.slots = s.slots.filter((x) => x.state !== "cancelled");
  redraw(st, it === undefined ? [] : [it.river], "audio");
}
