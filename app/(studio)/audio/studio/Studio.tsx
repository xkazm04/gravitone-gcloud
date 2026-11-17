// /audio?s=studio - the audio agent studio's section (spark audio-agent-studio). The server reads the
// turn port - the ledger (./_port/ledger.ts, live: the dock's messages and the outside agent's
// answers) or, under `&source=fixture`, the scripted sessions (./_port/fixture.ts) - and whether the
// agent is listening (./_live/presence.ts), and hands the client island the parsed conversations;
// the island (./_host/StudioHost.tsx) drives the conversation, the transport and the dock, and the
// view draws the rest.
import { fixturePort } from "./_port/fixture.ts";
import { ledgerPort } from "./_port/ledger.ts";
import type { StudioPort } from "./_port/port.ts";
import { newSessionAct, sayAct } from "./_live/acts.ts";
import { dropTasteAct, keepTasteAct, listenAct, pullSunoTakeAct, readSunoTakeAct, sunoLibraryAct } from "./_live/sunoActs.ts";
import { sunoApiStatus } from "../../../../lib/suno/api/client.ts";
import { readPresence } from "./_live/presence.ts";
import { StudioHost } from "./_host/StudioHost.tsx";
import type { StudioUrl } from "./url.ts";
import { readRelease } from "../_release/read.ts";
import { applyReleaseAct, createReleaseAct, releaseThisAct } from "../_release/acts.ts";
import type { ReactNode } from "react";

import { LazyPackaging } from "./_package/LazyPackaging.tsx";

// `cover`: the desk's overview drawn in the conversation's place (../_overview/Overview.tsx); make only.
export async function StudioSection({ url, port, cover }: { readonly url: StudioUrl; readonly port?: StudioPort; readonly cover?: ReactNode }) {
  const read = await (port ?? (url.source === "fixture" ? fixturePort : ledgerPort)).read();
  const presence = read.source === "live" ? readPresence() : "listening";
  // Spark suno-api: the token file only, no network; the reason is the client's own sentence.
  const grant = await sunoApiStatus();
  const connection = grant.connected ? ({ connected: true } as const) : ({ connected: false, reason: grant.reason } as const);
  const host = (
    <StudioHost
      url={url}
      sessions={read.sessions}
      renders={read.renders}
      note={read.note ?? null}
      head={read.head ?? 0}
      presence={presence}
      acts={{ say: sayAct, newSession: newSessionAct, listen: listenAct, keepTaste: keepTasteAct, dropTaste: dropTasteAct, pullSunoTake: pullSunoTakeAct, readSunoTake: readSunoTakeAct, sunoLibrary: sunoLibraryAct }}
      takes={read.takes ?? {}}
      taste={read.taste ?? []}
      connection={connection}
      {...(cover !== undefined ? { cover } : {})}
    />
  );
  // Spark studio-to-release: in package and release the conversation stays, beside the release's steps.
  if (url.stage === undefined || url.stage === "make") return host;
  const release = await readRelease({ source: url.source === "fixture" ? "fixture" : "real", release: url.release ?? null });
  const acts = url.source === "fixture" ? null : { releaseThis: releaseThisAct, create: createReleaseAct, apply: applyReleaseAct };
  return <LazyPackaging url={url} read={release} thread={host} acts={acts} />;
}
