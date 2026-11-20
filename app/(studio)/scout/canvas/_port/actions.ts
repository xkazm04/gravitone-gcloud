"use server";

// THE SCOUT CANVAS'S SERVER ACTIONS - the CanvasPort the island calls (./contract.ts), over whichever side ./port.ts
// switches to. Each goes through the one action wrapper (app/_server/action.ts): who first, with `money` key use (a
// verdict, a note, a goal or a reel's road is a write the studio acts on), then the input through its zod door, then the
// body. The door checks shape; each store's own door speaks for what a value may be, and its refusal reaches the screen
// in its words.

import { z } from "zod";

import { action } from "../../../../_server/action.ts";
import type { Principal } from "../../../../../lib/principal.ts";
import type { CanvasPort } from "./contract.ts";
import { serverCanvas } from "./port.ts";
import { ANCHOR_KINDS } from "../_canvas/tables.ts";

type In<K extends keyof CanvasPort> = Parameters<CanvasPort[K]>[0];
type Out<K extends keyof CanvasPort> = ReturnType<CanvasPort[K]>;

/** The ledger names the principal's uid; the shared secret names nobody, so the operator. */
const by = (p: Principal): string => ("uid" in p ? p.uid : "operator");
const uid = (p: Principal): string | undefined => ("uid" in p ? p.uid : undefined);

const nodeId = z.string().min(1).max(200);
const packet = z.string().min(1).max(120);
const stance = z.enum(["more", "turn", "less", "stop", ""]);
const decision = z.object({ voice: z.string().min(1).max(20), music: z.string().min(1).max(20), sound: z.string().min(1).max(20) });
const reason = z.string().min(1).max(64);
/** A record's present values only (zod's record admits undefined). */
const shares = (r: Readonly<Record<string, number | undefined>>): Record<string, number> => Object.fromEntries(Object.entries(r).filter((e): e is [string, number] => e[1] !== undefined));

const verdictsIn = z.object({
  changes: z.array(z.object({ node: nodeId, verdict: z.enum(["keep", "reject"]).nullable(), reasons: z.array(reason).max(11), note: z.string().max(2000).optional() })).min(1).max(500),
});
const noteIn = z.object({ kind: z.enum(ANCHOR_KINDS), key: z.string().min(1).max(300), name: z.string().min(1).max(200), text: z.string().max(2000), stance });
const goalIn = z.object({ text: z.string().max(2000), targets: z.array(z.object({ channel: z.string().min(1).max(16), n: z.number().int().min(0).max(20) })).max(20) });
const audioIn = z.discriminatedUnion("verb", [
  z.object({ verb: z.literal("brief"), nodes: z.array(nodeId).min(1).max(200) }),
  z.object({ verb: z.literal("decide"), node: nodeId, decision }),
  z.object({ verb: z.literal("run"), nodes: z.array(nodeId).min(1).max(200), toCalendar: z.boolean(), cadence: z.number().int().min(1).max(30) }),
  z.object({ verb: z.literal("schedule"), nodes: z.array(nodeId).min(1).max(200), cadence: z.number().int().min(1).max(30) }),
  z.object({ verb: z.literal("move"), slot: z.string().min(1).max(220), by: z.number().int().min(-60).max(60) }),
  z.object({ verb: z.literal("cancel"), slot: z.string().min(1).max(220) }),
  z.object({ verb: z.literal("publish"), slot: z.string().min(1).max(220) }),
]);

const verdictsAction = action("canvas verdicts", verdictsIn, (i, who) => serverCanvas().verdicts(i.changes, uid(who)));
const undoAction = action("canvas undo", z.object({ packet }), (i, who) => serverCanvas().undo(i.packet, uid(who)));
const commitAction = action("canvas commit", z.object({ packets: z.array(packet).min(1).max(40) }), (i, who) => serverCanvas().commit(i.packets, uid(who)));
const noteAction = action("canvas note", noteIn, (i, who) => serverCanvas().note({ kind: i.kind, key: i.key, name: i.name, text: i.text, stance: i.stance }, by(who)));
const unnoteAction = action("canvas unnote", z.object({ id: z.string().min(1).max(64) }), (i) => serverCanvas().unnote(i.id));
const goalAction = action("canvas goal", goalIn, (i) => serverCanvas().goal(i));
const pauseAction = action("canvas pause", z.object({ ref: z.string().min(1).max(200), paused: z.boolean() }), (i, who) => serverCanvas().pause(i.ref, i.paused, by(who)));
const splitAction = action("canvas split", z.object({ audience: z.record(z.string().min(1).max(40), z.number()) }), (i, who) => serverCanvas().split(shares(i.audience), by(who)));
const swapIn = z.object({ production: z.string().min(1).max(120), core: z.string().min(1).max(120) });
const productionVerdictIn = z.object({ production: z.string().min(1).max(120), node: nodeId, verdict: z.enum(["keep", "reject"]).nullable(), reasons: z.array(reason).max(11), note: z.string().max(2000).optional() });
const productionsAction = action("canvas productions", z.object({}), () => serverCanvas().productions());
const coresAction = action("canvas cores", z.object({}), () => serverCanvas().cores());
const swapPreviewAction = action("canvas swap preview", swapIn, (i) => serverCanvas().swapPreview(i));
const swapAcceptAction = action("canvas swap accept", swapIn, (i) => serverCanvas().swapAccept(i));
const productionVerdictAction = action("canvas production verdict", productionVerdictIn, (i) => serverCanvas().productionVerdict({ production: i.production, node: i.node, verdict: i.verdict, reasons: i.reasons, ...(i.note === undefined ? {} : { note: i.note }) }));
const audioAction = action("canvas audio", audioIn, (i) => serverCanvas().audio(i));

export async function canvasVerdictsAction(input: In<"verdicts">): Out<"verdicts"> {
  return verdictsAction(input);
}
export async function canvasUndoAction(input: In<"undo">): Out<"undo"> {
  return undoAction(input);
}
export async function canvasCommitAction(input: In<"commit">): Out<"commit"> {
  return commitAction(input);
}
export async function canvasNoteAction(input: In<"note">): Out<"note"> {
  return noteAction(input);
}
export async function canvasUnnoteAction(input: In<"unnote">): Out<"unnote"> {
  return unnoteAction(input);
}
export async function canvasGoalAction(input: In<"goal">): Out<"goal"> {
  return goalAction(input);
}
export async function canvasPauseAction(input: In<"pause">): Out<"pause"> {
  return pauseAction(input);
}
export async function canvasSplitAction(input: In<"split">): Out<"split"> {
  return splitAction(input);
}
export async function canvasAudioAction(input: In<"audio">): Out<"audio"> {
  return audioAction(input);
}
export async function canvasProductionsAction(): Out<"productions"> {
  return productionsAction({});
}
export async function canvasCoresAction(): Out<"cores"> {
  return coresAction({});
}
export async function canvasSwapPreviewAction(input: In<"swapPreview">): Out<"swapPreview"> {
  return swapPreviewAction(input);
}
export async function canvasSwapAcceptAction(input: In<"swapAccept">): Out<"swapAccept"> {
  return swapAcceptAction(input);
}
export async function canvasProductionVerdictAction(input: In<"productionVerdict">): Out<"productionVerdict"> {
  return productionVerdictAction(input);
}
