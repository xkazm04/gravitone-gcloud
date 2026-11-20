// A REEL'S ROAD, SIMULATED - the fixture side's audio -> cut -> calendar (docs/scout-canvas-port.md Phase 4 is the real
// one). Pure over a state value: each verb answers the next state. The brief is drafted from the reel's episode the way
// the winner drafted it (the hook line and the end line as voice, a hit per beat); the slot lands on the reel's channel
// on the next free day at the cadence.

import type { Episode } from "@gt/domain/channel";
import { err, ok, type Result } from "@gt/domain/errors";

import type { AudioInput, AudioState, CanvasSlot, ReelAudio } from "./contract.ts";
import { CALENDAR, CHAIN_DONE } from "../_canvas/tables.ts";

export type ReelInfo = { readonly node: string; readonly kind: "reel" | "reel-cut"; readonly label: string; readonly channel: string | null; readonly ep: Episode | null };

const mmss = (t: number): string => `0:${String(Math.round(t)).padStart(2, "0")}`;
const strip = (b: string): string => b.replace(/^(Hook|End|Turn|Close)\s*:\s*/i, "");

export function draftBrief(r: ReelInfo): NonNullable<ReelAudio["brief"]> {
  const beats = r.ep?.beats ?? [];
  const dur = r.kind === "reel-cut" ? 45 : 8;
  const first = beats[0];
  const last = beats[beats.length - 1];
  return {
    dur,
    vo: first !== undefined && last !== undefined ? [strip(first), strip(last)] : [r.label],
    hits: beats.map((_, i) => mmss((dur * i) / beats.length)).slice(1),
  };
}

function nextFreeDay(slots: readonly CanvasSlot[], channel: string, cadence: number): number {
  const used = slots.filter((s) => s.channel === channel && s.state !== "cancelled").map((s) => s.day);
  let d = used.length > 0 ? Math.max(...used) + cadence : 1;
  while (used.includes(d)) d++;
  return d;
}

export function step(state: AudioState, input: AudioInput, reels: ReadonlyMap<string, ReelInfo>): Result<AudioState> {
  const audio: Record<string, ReelAudio> = { ...state.audio };
  let slots = [...state.slots];
  const at = (id: string): ReelAudio => audio[id] ?? { step: 0 };
  const slotFor = (r: ReelInfo, cadence: number): void => {
    const channel = at(r.node).channel ?? r.channel ?? "D1";
    const s: CanvasSlot = { id: `slot:${r.node}`, node: r.node, channel, day: nextFreeDay(slots, channel, cadence), time: CALENDAR.time, state: "scheduled", title: r.ep?.title ?? r.label };
    slots = [...slots.filter((x) => x.id !== s.id), s];
    audio[r.node] = { ...at(r.node), step: CHAIN_DONE, channel };
  };
  const reel = (id: string): Result<ReelInfo> => {
    const r = reels.get(id);
    return r === undefined ? err("not-found", `no silent reel ${id}`) : ok(r);
  };
  switch (input.verb) {
    case "brief":
      for (const id of input.nodes) {
        const r = reel(id);
        if (!r.ok) return r;
        if (at(id).step > 0) continue;
        const brief = draftBrief(r.value);
        audio[id] = { ...at(id), step: 1, brief, decision: { voice: "dub", music: "score", sound: (r.value.ep?.beats.length ?? 0) > 0 ? "sfx" : "none" } };
      }
      break;
    case "decide":
      if (at(input.node).step >= 2) return err("conflict", "the audio is already generated; the choice is fixed");
      audio[input.node] = { ...at(input.node), decision: input.decision };
      break;
    case "run":
      for (const id of input.nodes) {
        const r = reel(id);
        if (!r.ok) return r;
        const a = at(id);
        if (a.step < 1 || a.step >= 4) continue;
        audio[id] = { ...a, step: 4 };
        if (input.toCalendar) slotFor(r.value, input.cadence);
      }
      break;
    case "schedule":
      for (const id of input.nodes) {
        const r = reel(id);
        if (!r.ok) return r;
        if (at(id).step === CHAIN_DONE - 1) slotFor(r.value, input.cadence);
      }
      break;
    case "move": {
      const s = slots.find((x) => x.id === input.slot);
      if (s === undefined) return err("not-found", `no slot ${input.slot}`);
      const used = slots.filter((x) => x !== s && x.channel === s.channel).map((x) => x.day);
      let day = s.day + input.by;
      while (used.includes(day)) day += Math.sign(input.by);
      if (day < 1) return err("invalid", "a slot lands from tomorrow");
      slots = slots.map((x) => (x === s ? { ...x, day } : x));
      break;
    }
    case "cancel": {
      const s = slots.find((x) => x.id === input.slot);
      if (s === undefined) return err("not-found", `no slot ${input.slot}`);
      slots = slots.filter((x) => x !== s);
      audio[s.node] = { ...at(s.node), step: CHAIN_DONE - 1 };
      break;
    }
    case "publish": {
      const s = slots.find((x) => x.id === input.slot);
      if (s === undefined) return err("not-found", `no slot ${input.slot}`);
      slots = slots.map((x) => (x === s ? { ...x, state: "published", day: 0 } : x));
      break;
    }
  }
  return ok({ audio, slots });
}
