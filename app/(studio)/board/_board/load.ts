import "server-only";

// What the Board's two entries (the full page and the sheet over the Floor) read before they
// render: the packet and the rail, through the same server port the actions answer from, so
// the first paint and every later write agree on the revision.
//
// A render is also when v1 is caught up: the apply reconciler (lib/decision/v1/applier.ts)
// starts a bounded sweep of due applies if its claim is free, and is never awaited here.
// And an aggregate pile linked bare (`pkt:audio:audio/triage`) loads as the pile it is now;
// the address follows it (wave B ruling 4), so a reload and a pasted link name that pile.

import { redirect } from "next/navigation";

import type { PacketSummary } from "@gt/domain/board";
import type { ErrorEnvelope } from "@gt/domain/errors";
import type { BoardPacket } from "@gt/ui/board/port";

import { reconcileApplies } from "../../../../lib/decision/v1/applier.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { publicError } from "../../../_server/http.ts";
import { boardFor } from "../../_shell/links.ts";
import { packetParam } from "../_port/param.ts";
import { serverBoard, SIDE } from "../_port/port.ts";

export type BoardLoad =
  | { readonly ok: true; readonly id: string; readonly packet: BoardPacket; readonly rail: readonly PacketSummary[] }
  | { readonly ok: false; readonly id: string; readonly error: ErrorEnvelope };

/** Start a sweep of due v1 applies if one is due; its outcome reaches the page on the next read. */
export function catchUpV1(): void {
  if (SIDE !== "real") return;
  const k = kernel();
  const swept = k.ok ? reconcileApplies(k.value.store) : k;
  if (!swept.ok) console.error(`[decision-apply] ${swept.error.message}`);
}

export async function loadBoard(params: Promise<{ readonly packet: string }>): Promise<BoardLoad> {
  const id = packetParam((await params).packet);
  catchUpV1();
  const board = serverBoard();
  // In order: the load may open the packet, and the rail should list it as opened.
  const packet = await board.loadPacket({ id });
  if (!packet.ok) return { ok: false, id, error: publicError(packet.error, "board load") };
  if (packet.value.view.id !== id) redirect(boardFor(packet.value.view.id));
  const list = await board.listPackets();
  // The desk still draws without its rail, but an empty rail reads as a clear Weir: say why it is empty.
  if (!list.ok) console.error(`[board] rail: ${list.error.message}`);
  return { ok: true, id, packet: packet.value, rail: list.ok ? list.value.packets : [] };
}
