import "server-only";

// THE RELEASE TAB'S READ (spark audio-distribution, S1): which side of the port answers - the scripted
// fixture (S1's default) or the real shelf under `source=real`.
import { fixturePort } from "./_port/fixture.ts";
import type { ReleaseRead, ReleaseUrl } from "./_port/port.ts";
import { realPort } from "./_port/real.ts";

export function readRelease(url: ReleaseUrl): Promise<ReleaseRead> {
  return (url.source === "real" ? realPort : fixturePort).read();
}
