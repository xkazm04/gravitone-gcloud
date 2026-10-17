// WHERE A v1 SOUND LAB ADDRESS GOES NOW (Phase 6 wave C; plan §5.7: deep links become redirects;
// owner ruling 2026-10-17: every Sound lab tool rebuilt in /audio).
//
// v1 kept the lab's view in the query (app/playground/PlaygroundView.tsx): `m` the module
// (triage | arrange | hunt), `kind` music | sfx, and the hunt's own `h` (hunt/index.tsx). Each
// lands where that work is done now:
//   · `m=triage`        the Board's audio triage packet - judging moved there in Phase 3, and the
//                       v1 page already sent this address there (wave B ruling 4: the bare pile
//                       resolves to the pile it is now);
//   · `m=arrange|hunt`  that section of the Audio desk, the kind carried; a hunt keeps its `h`,
//                       since the desk reads the same hunt store (lib/sound/hunt.ts);
//   · anything else     the desk itself, the kind carried.
// An unknown kind reads as music, as v1's view read it. Pure, so the table is asserted without a
// server (tests/next-server/retire-redirects.test.ts).

import { deskHref } from "../audio/_audio/desk.ts";
import { huntHref, huntParam } from "../audio/_hunt/url.ts";
import { boardFor, packetIdOf } from "../_shell/links.ts";

type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function playgroundTarget(q: Query): string {
  const m = one(q["m"]);
  const kind = one(q["kind"]) === "sfx" ? "sfx" : "music";
  if (m === "triage") return boardFor(packetIdOf("audio", "audio/triage"));
  if (m === "hunt") return huntHref(kind, huntParam(q));
  if (m === "arrange") return deskHref({ section: "arrange", kind });
  return deskHref({ section: "compose", kind });
}
