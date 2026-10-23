// THE FAKE MEDIUM — selected by MEDIUM_DRIVER=fake or injected as deps.medium.
// Touches no browser and no network. `FAKE_MEDIUM` is the probe's handle, the
// shape FAKE_LEONARDO_STUDIO set: its health, a failure to throw, and a log of
// every draft it was asked for (so a probe can see a rework reuse the URL).

import { writeFile } from "node:fs/promises";
import type { MediumDraftInput, MediumDriver, MediumHealth } from "./types";

export const FAKE_MEDIUM: { health: MediumHealth; failWith: string | null; failAfterSave: string | null; calls: MediumDraftInput[]; seq: number } = {
  health: { ok: true },
  failWith: null,
  failAfterSave: null,
  calls: [],
  seq: 0,
};

export function resetFakeMedium(): void {
  FAKE_MEDIUM.health = { ok: true };
  FAKE_MEDIUM.failWith = null;
  FAKE_MEDIUM.failAfterSave = null;
  FAKE_MEDIUM.calls = [];
  FAKE_MEDIUM.seq = 0;
}

// A 1x1 PNG: a real, decodable file for the gate's screenshot slot.
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export const fakeMediumDriver: MediumDriver = {
  probe: async () => FAKE_MEDIUM.health,
  createDraft: async (input) => {
    FAKE_MEDIUM.calls.push(input);
    if (!FAKE_MEDIUM.health.ok) throw new Error(FAKE_MEDIUM.health.reason);
    if (FAKE_MEDIUM.failWith) throw new Error(FAKE_MEDIUM.failWith);
    // Medium saved a draft, then a later step failed: the error names the draft (types.ts).
    if (FAKE_MEDIUM.failAfterSave) throw Object.assign(new Error(FAKE_MEDIUM.failAfterSave), { draftUrl: input.existingUrl ?? `https://medium.com/p/fake${++FAKE_MEDIUM.seq}/edit` });
    await writeFile(input.shotPath, PNG_1X1);
    const n = input.storyHtml.split("<figure>").length - 1;
    return { url: input.existingUrl ?? `https://medium.com/p/fake${++FAKE_MEDIUM.seq}/edit`, figures: n, expected: n, markers: 0 };
  },
};
