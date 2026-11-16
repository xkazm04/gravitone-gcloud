// THE WALK'S DOORS - where a row of a project's plan opens, one pure table for the Plan's rows and
// the part screen's "next" (spark fable-ten, package A). The walk is Research - Script - Frames -
// Motion - Score - Cut, gates between, then a slot on the calendar; before this every gate and
// slot row was text, so a ready part left the operator nowhere to go.
//
// THE RULE is links.ts's: never a door to a route that does not render.
//   work part   its editor, when its kind has one.
//   gate        its Board packet, ONLY when the plan names one (`packetId`, @gt/domain/produce).
//               A gate's id is derivable (`pkt:step:<gate>`) but its existence is not: the packet
//               opens when the judged part is READY (lib/parts/gates.ts), a failed attempt reopens
//               as `#2`, and the Board reads the kernel even on the fixture lane (board/_port/
//               port.ts SIDE) - a derived id would land on a refusal. No packet yet, no link.
//   slot        has a slot (`slotId`: holding it, or missed/failed and reschedulable): that slot's
//               record. Waiting for a person with none (awaiting_gate): the schedule sheet carrying
//               this slot part, so the slot it makes is the plan's. Still behind its upstream: no
//               link - there is nothing to schedule yet.
//   Both ids are read by the kernel in the plan's snapshot (parts/gates.ts gateFacts), so the
//   door exists exactly when the record does.
// Client-safe: types and the two client-safe link helpers only.

import type { PartTab } from "@gt/domain/partView";
import { isEditorKind } from "@gt/domain/partView";
import type { PlanPart } from "@gt/domain/produce";

import { boardFor, calendarFor } from "../../_shell/links.ts";

const enc = encodeURIComponent;

/** A part's editor: `/projects/<project>/<key>`, the key being the part id past `<project>` and its separator. */
export const editorHref = (projectId: string, partId: string): string => `/projects/${enc(projectId)}/${enc(partId.slice(projectId.length + 1))}`;

/** The calendar's schedule sheet for a plan's slot part (the Floor reads `part` beside `item`). */
export const scheduleFor = (slotPartId: string): string => `/floor?cal=1&new=1&part=${enc(slotPartId)}`;

/** A plan row's door, or null when it has none yet (the row keeps its state chip). */
export function planRowHref(projectId: string, p: PlanPart): string | null {
  if (p.kind === "gate") return p.packetId === undefined ? null : boardFor(p.packetId);
  if (p.kind === "slot") {
    // A part that HAS a slot opens it - never a second schedule sheet, which would be a second
    // publish of the same film.
    if (p.slotId !== undefined) return calendarFor(p.slotId);
    return p.state === "ratified" ? calendarFor(null) : p.state === "awaiting_gate" ? scheduleFor(p.id) : null;
  }
  return isEditorKind(p.kind) ? editorHref(projectId, p.id) : null;
}

/** A slot tab's door: its slot when it has one, else the schedule sheet for it. */
export const slotDoor = (tab: Pick<PartTab, "partId" | "slotId">): string => (tab.slotId === undefined ? scheduleFor(tab.partId) : calendarFor(tab.slotId));

export type Door ={ readonly label: string; readonly href: string };

/**
 * The part screen's next door, for the row `nextTab` named. A gate opens its packet once the tab
 * names one; until then (the packet opens a moment after the part turns READY, lib/parts/gates.ts)
 * it opens the Plan, where the gate's row stands with its state - one step short of the Board
 * rather than a dead end or a refusal. A slot opens its slot when it has one, else the schedule
 * sheet for itself. A work part opens its editor; one with no editor has no door.
 */
export function nextDoor(projectId: string, tab: PartTab | null): Door | null {
  if (tab === null) return null;
  if (tab.kind === "gate") return { label: tab.label, href: tab.packetId === undefined ? `/projects/${enc(projectId)}` : boardFor(tab.packetId) };
  if (tab.kind === "slot") return { label: tab.label, href: slotDoor(tab) };
  return tab.editor ? { label: tab.label, href: editorHref(projectId, tab.partId) } : null;
}
