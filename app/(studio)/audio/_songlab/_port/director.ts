// THE DIRECTOR'S BAND FROM THE RELAY (spark yue2-song-lab S2): the lab thread (lib/yue2/labRelay.ts
// `labThread`: the owner's `audio.lab.say` directions and the agent's `audio.lab.turn` answers,
// oldest first), the owner's keeps and drops (lib/yue2/proposals.ts `decisions`) and presence fold
// into the band. Pure and shared by both sides of the port.
//
// The band's line is the agent's NEWEST turn; its proposals are every turn's not removed, each with
// its decision;
// a direction no turn answers yet is said as waiting, and while nobody listens the unanswered
// directions are counted as the inbox. RAN and LEARNED carry the turn's items verbatim; the sums on
// their chips are the desk's own figures (takes, gate, seeded, cut; upsets of decided).
import type { LabSay, LabTurn } from "@gt/domain/audio.yue2.lab";
import type { DetailItem, DirectorView, ProposalState } from "@gt/ui/components/songlab/songlab.ts";

import { hhmm } from "./words.ts";

export type Figures = { readonly takes: number; readonly pass: number; readonly seeded: number; readonly cut: number; readonly decided: number; readonly upsets: number };

export type BandInput = {
  readonly presence: "listening" | "nobody";
  readonly says: readonly LabSay[];
  readonly turns: readonly LabTurn[];
  readonly decisions: Readonly<Record<string, "kept" | "dropped">>;
  readonly figures: Figures;
};

/** `queue_pairs: booked 15 matches` -> its act and its line; a plain sentence keeps a dot for its act. */
function item(text: string): DetailItem {
  const m = /^([a-z_]{2,16}):\s+(.+)$/.exec(text);
  return m === null ? { k: "·", line: text } : { k: m[1] ?? "·", line: m[2] ?? text };
}

export function ranSum(f: Figures): string {
  return `${f.takes} takes · ${f.pass} past gate · ${f.seeded} seeded · ${f.cut} cut`;
}

export function directorOf(input: BandInput): DirectorView {
  const last = input.turns[input.turns.length - 1];
  const answered = new Set(input.turns.flatMap((t) => (t.answers === undefined ? [] : [t.answers])));
  const lastTurnAt = last?.at ?? "";
  // A say is unanswered when no turn names it and no turn came after it.
  const unanswered = input.says.filter((s) => !answered.has(s.turnId) && s.at > lastTurnAt);
  const waiting = unanswered[unanswered.length - 1];
  const f = input.figures;
  const state = (id: string): ProposalState => input.decisions[id] ?? "open";
  return {
    presence: input.presence,
    ...(last === undefined ? {} : { line: { at: hhmm(last.at), text: last.line } }),
    ...(waiting === undefined ? {} : { waiting: waiting.text }),
    // Every proposal still standing - a later turn does not withdraw an earlier one - newest turn first.
    proposals: [...input.turns].reverse().flatMap((t) => t.proposals.map((p) => ({ turnId: t.turnId, id: p.id, kind: p.kind, label: p.label, why: p.why, state: state(p.id) }))).filter((p) => p.state !== "dropped"),
    ran: (last?.ran ?? []).map(item),
    learned: (last?.learned ?? []).map(item),
    ranSum: ranSum(f),
    learnedSum: f.decided > 0 ? `upsets ${f.upsets} of ${f.decided}` : (last?.learned[0] === undefined ? "ear: no votes yet" : item(last.learned[0]).line),
    inbox: input.presence === "nobody" ? unanswered.length : 0,
  };
}
