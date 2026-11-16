import "server-only";

// THE SONG LAB'S READ (spark yue2-song-lab S2): which side of the port answers the desk - the
// scripted fixture under `source=fixture`, the ledger otherwise - and the rail's tally (matches
// waiting for the ear) without drawing the whole desk.
import { kernel } from "../../../../lib/kernelStore.ts";
import { bracketOf, draws } from "../../../../lib/yue2/draw.ts";
import { fixturePort } from "./_port/fixture.ts";
import { ledgerPort } from "./_port/ledger.ts";
import type { SongLabPort, SongLabRead, SongLabUrl } from "./_port/port.ts";

export function portFor(url: SongLabUrl): SongLabPort {
  return url.source === "fixture" ? fixturePort : ledgerPort;
}

export async function readSongLab(url: SongLabUrl): Promise<SongLabRead> {
  return portFor(url).read(url);
}

/** Matches booked and not yet voted, across every draw (the rail's tally); absent when unreadable. */
export async function openMatches(url: SongLabUrl): Promise<number | undefined> {
  if (url.source === "fixture") return (await fixturePort.read({ ...url, field: false })).draws.reduce((n, d) => n + d.open, 0);
  const k = kernel();
  if (!k.ok) return undefined;
  const all = draws(k.value.store);
  if (!all.ok) return undefined;
  let n = 0;
  for (const d of all.value) {
    const b = await bracketOf(k.value.store, d.drawId);
    if (b.ok) n += b.value.matches.filter((m) => m.pairId !== undefined && m.outcome === undefined && m.takeA !== undefined && m.takeB !== undefined).length;
  }
  return n;
}
