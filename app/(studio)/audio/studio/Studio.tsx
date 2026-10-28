// /audio?s=studio - the audio agent studio's section (spark audio-agent-studio, stage S1). The server
// reads the turn port (./_port/fixture.ts today, a ledger side in stage S2) and hands the client
// island the parsed sessions; the island (./_host/StudioHost.tsx) drives the conversation, the
// transport and the dock, and a variant (./_v/<id>/) draws the rest.
import { fixturePort, type StudioPort } from "./_port/fixture.ts";
import { StudioHost } from "./_host/StudioHost.tsx";
import type { StudioUrl } from "./url.ts";

export async function StudioSection({ url, port = fixturePort }: { readonly url: StudioUrl; readonly port?: StudioPort }) {
  const read = await port.read();
  return <StudioHost url={url} sessions={read.sessions} renders={read.renders} note={read.note ?? null} />;
}
