// /audio - the Audio lane's composer surface (owner ruling 2026-10-17: v1's Library Audio tab,
// "the Recipe Book", rebuilt in the kit; Phase 5, L52). Terms, the composer, its variations, the
// drafts sent to Suno and the references, read from v1's sound stores on the server
// (./_audio/read.ts) and handed to one client island; a seed leaves through a receipt.
//
// What it does not do is judge: keep and reject belong to the Board's audio triage, and the
// kept takes are Library audio items.
import type { Metadata } from "next";

import { setHand, sunoConfirm, sunoReceipt } from "./_audio/actions.ts";
import { AudioLane } from "./_audio/AudioLane.tsx";
import { audioNow, readAudio } from "./_audio/read.ts";

export const metadata: Metadata = { title: "Gravitone · Audio" };

export default async function AudioPage() {
  const view = await readAudio();
  return <AudioLane view={view} nowMs={audioNow()} acts={{ setHand, sunoReceipt, sunoConfirm }} />;
}
