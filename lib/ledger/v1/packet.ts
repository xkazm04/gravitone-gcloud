import type { PacketSource } from "@gt/domain/source";

// A WEIR PILE'S PACKET ID, in lib/ so the projection, the decision adapters
// (lib/decision/v1) and the app's links all spell it once (Phase 3 COMMON
// decision 3). The rule is L20's, from app/(studio)/_shell/links.ts
// `packetIdOf` / `parsePacketId`, moved here because lib/ may not import app/;
// links.ts keeps a byte-equal copy until wave C points it at this module
// (tests/next-server/decision-v1-registry.test.ts holds the two equal).
//
// The id is DERIVED, never minted: the same pile always names the same packet,
// so opening is idempotent and the Floor, the Board and the applier agree on
// it without a lookup table. The source is the first segment and the run id
// is the REST, so a run id that itself holds a colon survives the round trip.
// Client-safe: plain strings, types only from @gt/domain; the brand is minted
// at the kernel's door.

const PACKET = "pkt:";

/** `pkt:<source>:<runId>` - the one spelling of a Weir pile's packet id. */
export function packetIdOf(source: string, runId: string): string {
  return `${PACKET}${source}:${runId}`;
}

/** The inverse of {@link packetIdOf}; null for anything it could not have produced. */
export function parsePacketId(id: string): { readonly source: string; readonly runId: string } | null {
  if (!id.startsWith(PACKET)) return null;
  const rest = id.slice(PACKET.length);
  const i = rest.indexOf(":");
  if (i <= 0 || i === rest.length - 1) return null;
  return { source: rest.slice(0, i), runId: rest.slice(i + 1) };
}

/**
 * The projection's Weir source (lib/ledger/v1/sources/*, WeirItem.source) to
 * the packet source that decides it. Seven are the same word; v1's article store
 * projects as `articles` and its packets are `article`, and the sound shelf
 * (takes.json, ./sources/sound.ts) projects as `sound` and is triaged as
 * `audio` (@gt/domain/source).
 * A projection source absent here has no Weir pile to decide.
 */
const WEIR_TO_PACKET: ReadonlyMap<string, PacketSource> = new Map<string, PacketSource>([
  ["forge", "forge"],
  ["extract", "extract"],
  ["dojo", "dojo"],
  ["strips", "strips"],
  ["articles", "article"],
  ["suno", "suno"],
  ["mv", "mv"],
  ["sound", "audio"],
  ["scout", "scout"],
  ["seeds", "seeds"],
]);

/** The packet a Weir pile opens as, or undefined when its source has no decision adapter. */
export function weirPacketId(item: { readonly source: string; readonly id: string }): string | undefined {
  const source = WEIR_TO_PACKET.get(item.source);
  return source === undefined ? undefined : packetIdOf(source, item.id);
}
