// THE RUN JOURNAL — the manifest's capped, human-readable log.
//
// Its own file because the breaker, the spend stops and every perform file
// write to it, and none of them owns it. It has no dependencies, so it can be
// imported from anywhere in this directory without a cycle.

import type { EngineIO } from "./engine";
import type { ExtractManifest } from "./types";

export function log(m: ExtractManifest, io: EngineIO, msg: string) {
  m.log.push({ at: io.now(), msg });
  if (m.log.length > 400) m.log.splice(0, m.log.length - 400);
}
