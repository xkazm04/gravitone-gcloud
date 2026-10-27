// The rail's `[` / `]` step, pure so it is asserted without a DOM (tests/next-server/board-rail.test.ts).
// It walks the open piles when there are any, else the whole rail, and wraps at both ends. A desk
// whose own packet is not on that list (a decided packet's page: the open piles are listed, it is
// not) steps from just outside the list: `]` lands on the first pile and `[` on the last.
import type { PacketSummary } from "@gt/domain/board";

export function stepTarget(rail: readonly PacketSummary[], id: string, dir: 1 | -1): string | undefined {
  const open = rail.filter((p) => p.state === "open");
  const list = open.length > 0 ? open : rail;
  if (list.length === 0) return undefined;
  const i = list.findIndex((p) => p.id === id);
  const at = i < 0 ? (dir === 1 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  const to = list[at];
  return to === undefined || to.id === id ? undefined : to.id;
}
