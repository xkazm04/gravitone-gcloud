import "server-only";

// THE RELEASE TAB'S REAL SIDE (spark audio-distribution, S1): the shelf is the kept takes in the sound
// store (finalized first), the channel rows are the publish readiness the Calendar reads, and there
// are no releases yet - S1 persists none (S2 adds the store and the `release:<id>` Calendar slots).
// Only YouTube has an adapter today; the four other direct channels are rows with that sentence, and
// the five DSPs are `not-reachable` until a licensed delivery partner is researched (wave 1).
import type { ChannelRow, ShelfTake } from "@gt/domain/release";

import { channelReadiness } from "../../../../../lib/publish/channels.ts";
import { takeFileHref } from "../../../../../lib/sound/takeHref.ts";
import { listTakes } from "../../../../../lib/sound/takes.ts";
import type { ReleasePort, ReleaseRead } from "./port.ts";

async function shelf(): Promise<ShelfTake[]> {
  const kept = await listTakes({ verdict: "kept" });
  const rank = (s: string | null) => (s === "finalized" ? 0 : 1);
  return [...kept]
    .filter((t) => t.kind === "music")
    .sort((a, b) => rank(a.stage) - rank(b.stage))
    .map((t) => ({
      takeId: t.id,
      title: t.label ?? t.title,
      durationS: t.measured?.durationS ?? t.durationS ?? 0,
      audioHref: t.file === null ? null : takeFileHref(t.id),
      provider: t.provider,
      label: t.label,
      lufs: t.measured?.lufs ?? null,
      truePeakDb: t.measured?.truePeakDb ?? null,
    }));
}

function channels(): ChannelRow[] {
  const yt = channelReadiness().channels.find((c) => c.id === "youtube");
  const youtube: ChannelRow = {
    id: "youtube",
    kind: "direct",
    state: yt === undefined ? "not-wired" : yt.status === "live" ? "ready" : yt.status === "dry" ? "dry" : "not-wired",
    detail: yt?.note ?? null,
  };
  const others = (["soundcloud", "audius", "mixcloud", "archive"] as const).map((id): ChannelRow => ({ id, kind: "direct", state: "not-wired", detail: "adapter not built" }));
  const dsps = (["spotify", "apple", "amazon", "tidal", "deezer"] as const).map((id): ChannelRow => ({ id, kind: "dsp", state: "not-reachable", detail: "delivery needs a licensed distributor" }));
  return [youtube, ...others, ...dsps];
}

export const realPort: ReleasePort = {
  read: async (): Promise<ReleaseRead> => ({ source: "real", artist: "", shelf: await shelf(), records: [], channels: channels(), mvLooks: [] }),
};
