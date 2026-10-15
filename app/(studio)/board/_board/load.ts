import "server-only";

// What the Board's two entries (the full page and the sheet over the Floor) read before they
// render: the packet and the rail, through the same server port the actions answer from, so
// the first paint and every later write agree on the revision.

import type { PacketSummary } from "@gt/domain/board";
import type { ErrorEnvelope } from "@gt/domain/errors";
import type { BoardPacket } from "@gt/ui/board/port";

import { publicError } from "../../../_server/http.ts";
import { packetParam } from "../_port/param.ts";
import { serverBoard } from "../_port/port.ts";

export type BoardLoad =
  | { readonly ok: true; readonly id: string; readonly packet: BoardPacket; readonly rail: readonly PacketSummary[] }
  | { readonly ok: false; readonly id: string; readonly error: ErrorEnvelope };

export async function loadBoard(params: Promise<{ readonly packet: string }>): Promise<BoardLoad> {
  const id = packetParam((await params).packet);
  const board = serverBoard();
  const [packet, list] = await Promise.all([board.loadPacket({ id }), board.listPackets()]);
  if (!packet.ok) return { ok: false, id, error: publicError(packet.error, "board load") };
  return { ok: true, id, packet: packet.value, rail: list.ok ? list.value.packets : [] };
}
