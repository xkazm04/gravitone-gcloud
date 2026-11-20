import "server-only";

// THE REAL SIDE - the scout's stores and the Board's doors. The view: the decision graph (graph.ts buildGraph, effort
// from the kernel store), the channel store, the open scout packets' cells and the night folders' files (./media.ts),
// the operator's notes and goal (lib/foundry/scout/notes.ts). Verdicts go through the Board's OWN doors - patch, undo,
// preview then commit - one packet per call, so a verdict given on the canvas is the same record a verdict given on the
// Board is; a commit spends nothing (a scout night's apply enqueues no job, and a dry night records verdicts only).
//
// What is not built yet answers with its sentence (docs/scout-canvas-port.md): the reel -> production -> calendar
// chain, dispatching a night, and the steer's writes while the baseline archives them (ARCHIVED_DOOR).

import { randomUUID } from "node:crypto";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { ScoutGraph } from "@gt/domain/scoutGraph";

import { kernel } from "../../../../../lib/kernelStore.ts";
import { buildGraph } from "../../../../../lib/foundry/scout/graph.ts";
import { readChannels } from "../../../../../lib/foundry/scout/channels.ts";
import { addNote, readNotes, removeNote, setRoundGoal } from "../../../../../lib/foundry/scout/notes.ts";
import { ARCHIVED_DOOR } from "../../../../../lib/foundry/scout/baseline.ts";
import { onBaseline } from "../../../../../lib/foundry/scout/store.ts";
import { pauseBranch, readSteer, resumeBranch, setSplit } from "../../../../../lib/foundry/scout/steer.ts";
import type { SeedRef } from "../../../../../lib/foundry/scout/types.ts";
import { serverBoard } from "../../../board/_port/port.ts";
import { isScoutPacket } from "../../_scout/ScoutHead.tsx";
import type { CanvasView, ScoutNote, VerdictInput } from "./contract.ts";
import { mediaOf, type OpenCell } from "./media.ts";
import type { ServerCanvas } from "./port.ts";

export const AUDIO_REFUSAL = "not built yet: a data reel cannot become a production (no reel source kind), so audio cannot be generated or laid for it here (docs/scout-canvas-port.md Phase 4b)";
export const DISPATCH_REFUSAL = "a night runs as a /scout seat session; dispatching it from here is not built yet (docs/scout-canvas-port.md Phase 5)";

/** The node a Board cell belongs to: `c-07/panel-2` in `pkt:scout:<night>[:n]` → `cand:<night>/c-07`; a seed cell is itself. */
function nodeOfCell(packet: string, cell: string): string | null {
  const scout = /^pkt:scout:([^:]+)(?::\d+)?$/.exec(packet);
  if (scout?.[1] !== undefined) return `cand:${scout[1]}/${cell.split("/")[0] ?? cell}`;
  const seeds = /^pkt:seeds:([^:]+)(?::\d+)?$/.exec(packet);
  if (seeds?.[1] !== undefined) return `seed:${seeds[1]}/${cell}`;
  return null;
}

type OpenPacket = { readonly id: string; readonly rev: number; readonly cells: Map<string, OpenCell[]> };

/** Every open scout or seeds packet, loaded: its revision and its cells by node. */
async function openPackets(): Promise<Result<OpenPacket[]>> {
  const b = serverBoard();
  const list = await b.listPackets();
  if (!list.ok) return list;
  const out: OpenPacket[] = [];
  for (const p of list.value.packets.filter((x) => isScoutPacket(x) && x.state === "open")) {
    const loaded = await b.loadPacket({ id: p.id });
    if (!loaded.ok) continue;
    const cells = new Map<string, OpenCell[]>();
    for (const it of loaded.value.view.items) {
      const node = nodeOfCell(p.id, it.id);
      if (node === null) continue;
      const xs = cells.get(node) ?? [];
      xs.push({ id: it.id, url: it.url });
      cells.set(node, xs);
    }
    out.push({ id: p.id, rev: loaded.value.view.rev, cells });
  }
  return ok(out);
}

const notesOut = (f: Awaited<ReturnType<typeof readNotes>>): readonly ScoutNote[] => f.notes.map(({ by: _by, ...n }) => n);

async function view(): Promise<Result<CanvasView>> {
  const k = kernel();
  if (!k.ok) return k;
  try {
    const [graph, channels, notes, steer, packets] = await Promise.all([buildGraph({ store: k.value.store }), readChannels(), readNotes(), readSteer(), openPackets()]);
    const open = new Map<string, OpenCell[]>();
    if (packets.ok) for (const p of packets.value) for (const [n, cs] of p.cells) open.set(n, [...(open.get(n) ?? []), ...cs]);
    const archived = onBaseline();
    return ok({
      graph,
      channels: channels.map((c) => ({ channel: c.channel, episodes: c.episodes })),
      media: await mediaOf(graph, open),
      notes: notesOut(notes),
      goal: notes.goal,
      audio: {},
      slots: [],
      today: new Date().toISOString().slice(0, 10),
      ...(steer.split === undefined ? {} : { split: steer.split.audience }),
      caps: { verdicts: true, notes: true, steer: !archived, audio: false, dispatch: false },
      refusals: { audio: AUDIO_REFUSAL, dispatch: DISPATCH_REFUSAL, ...(archived ? { steer: ARCHIVED_DOOR } : {}) },
    });
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

/** The open packet that decides a node now (its own, or the remainder a partial commit left). */
function packetOf(packets: readonly OpenPacket[], node: string): OpenPacket | undefined {
  return packets.find((p) => p.cells.has(node));
}

async function verdicts(changes: readonly VerdictInput[], by: string | undefined): Promise<Result<{ readonly packets: readonly string[] }>> {
  const packets = await openPackets();
  if (!packets.ok) return packets;
  const byPacket = new Map<OpenPacket, { candidate: string; verdict: "keep" | "reject" | null; reasons: readonly string[]; note?: string }[]>();
  for (const c of changes) {
    const p = packetOf(packets.value, c.node);
    if (p === undefined) return err("not-found", `${c.node} waits in no open packet; it was decided elsewhere - reload`);
    const rows = byPacket.get(p) ?? [];
    for (const cell of p.cells.get(c.node) ?? []) rows.push({ candidate: cell.id, verdict: c.verdict, reasons: c.reasons, ...(c.note === undefined ? {} : { note: c.note }) });
    byPacket.set(p, rows);
  }
  const b = serverBoard();
  const who = by === undefined ? {} : { who: by };
  for (const [p, rows] of byPacket) {
    const r = await b.patch({ id: p.id, baseRev: p.rev, changes: rows }, who);
    if (!r.ok) return r;
  }
  return ok({ packets: [...byPacket.keys()].map((p) => p.id) });
}

async function undo(packet: string, by: string | undefined): Promise<Result<{ readonly packet: string }>> {
  const b = serverBoard();
  const loaded = await b.loadPacket({ id: packet });
  if (!loaded.ok) return loaded;
  const r = await b.undo({ id: packet, baseRev: loaded.value.view.rev }, by === undefined ? {} : { who: by });
  return r.ok ? ok({ packet }) : r;
}

async function commit(packets: readonly string[], by: string | undefined) {
  const b = serverBoard();
  const who = by === undefined ? {} : { who: by };
  const done: { packet: string; kept: number; rejected: number }[] = [];
  for (const id of packets) {
    const pv = await b.preview({ id }, who);
    if (!pv.ok) return pv;
    const r = await b.commit({ id, rev: pv.value.rev, token: pv.value.token, ticket: randomUUID(), undecidedAs: "leave" }, who);
    if (!r.ok) return r;
    done.push({ packet: id, kept: r.value.kept, rejected: r.value.rejected });
  }
  return ok({ packets: done });
}

/** The seeds a river (a graph group `<audience>/<genre>`) grows from: what the steer pauses. */
function seedsOf(g: ScoutGraph, group: string): SeedRef[] {
  return [...new Set(g.nodes.filter((n) => n.stage === "seed" && `${n.audience ?? ""}/${n.genre ?? ""}` === group && n.seed !== undefined).map((n) => n.seed as SeedRef))];
}

export const realCanvas: ServerCanvas = {
  view,
  verdicts,
  undo,
  commit,
  note: async (d, by) => {
    const r = await addNote({ kind: d.kind, key: d.key, name: d.name, text: d.text, stance: d.stance }, by);
    return r.ok ? ok({ notes: notesOut(r.value) }) : r;
  },
  unnote: async (id) => {
    const r = await removeNote(id);
    return r.ok ? ok({ notes: notesOut(r.value) }) : r;
  },
  goal: async (goal) => {
    const r = await setRoundGoal({ text: goal.text, targets: goal.targets.map((t) => ({ channel: t.channel, n: t.n })) });
    return r.ok ? ok({ goal: r.value.goal }) : r;
  },
  pause: async (group, paused, by) => {
    if (onBaseline()) return err("refused", ARCHIVED_DOOR);
    const k = kernel();
    if (!k.ok) return k;
    const g = await buildGraph({ store: k.value.store });
    let last: Awaited<ReturnType<typeof pauseBranch>> | null = null;
    for (const ref of seedsOf(g, group)) {
      last = paused ? await pauseBranch(ref, by) : await resumeBranch(ref, by);
      if (!last.ok) return last;
    }
    return ok({ paused: last?.ok === true ? last.value.paused : (await readSteer()).paused });
  },
  split: async (audience, by) => {
    const r = await setSplit({ audience }, by);
    return r.ok ? ok({ split: r.value.split?.audience ?? audience }) : r;
  },
  audio: async () => err("refused", AUDIO_REFUSAL),
};
