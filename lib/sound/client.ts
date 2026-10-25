// A take's bytes as a browser URL - all that is left of v1's sound client.
//
// This module was the browser's only way to the sound store: typed wrappers over /api/sound/*
// for the Sound lab (app/playground) and the v1 Foundry canvas (lib/board/sources/audio.ts). Both
// retired in Phase 6 wave C, and with them every fetcher here (takes, insights, lessons, groups,
// hunts, the Suno and mv queues): the Audio desk reads and writes the store on the server through
// Server Actions (app/(studio)/audio), so no browser call to those routes remains. The one export
// still read is the file URL the Cut timeline hands an <audio> element (lib/cut/deriveTimeline.ts).
//
// It stays a client-side helper on purpose: lib/imagingClient.ts is "use client", so on the server
// this export is a client reference that throws when called (tests/next-server/parts-verdict-server
// .test.ts stands that reference in, which is how the L40 defect is held).

import { withAccess } from "@/lib/imagingClient";
import { takeFileHref } from "./takeHref.ts";

/** The file URL for a take's bytes - usable directly as an <audio src>. An <audio> element cannot
 *  send the Authorization header, so the credential rides through the one client door,
 *  `withAccess` (the file route accepts it). */
export const takeFileUrl = (id: string) => withAccess(takeFileHref(id));
