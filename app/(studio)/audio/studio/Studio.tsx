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
import { readPresence } from "./_live/presence.ts";
import { StudioHost } from "./_host/StudioHost.tsx";
import type { StudioUrl } from "./url.ts";

export async function StudioSection({ url, port }: { readonly url: StudioUrl; readonly port?: StudioPort }) {
  const read = await (port ?? (url.source === "fixture" ? fixturePort : ledgerPort)).read();
  const presence = read.source === "live" ? readPresence() : "listening";
  return (
    <StudioHost
      url={url}
      sessions={read.sessions}
      renders={read.renders}
      note={read.note ?? null}
      head={read.head ?? 0}
      presence={presence}
      acts={{ say: sayAct, newSession: newSessionAct }}
    />
  );
}
