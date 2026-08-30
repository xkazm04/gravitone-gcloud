// LANE — THE SCORE SURFACE NAMES THE VENDOR THAT ACTUALLY ANSWERS (dynamic).
//
// Three things this surface told the user were false, and all three rendered
// verbatim:
//
//   · every cue in app/_studio/score.ts carried `model: "lyria-3"`, printed at
//     ScoreSpotting.tsx beside a button wired to generateCueAudio →
//     /api/music/generate → lib/music/elevenlabs.ts, which POSTs ElevenLabs.
//     A hand-typed vendor name is free to be wrong, and this one was;
//   · cue-2's note said "Lyria refused the request in this region", attributing
//     a refusal to a vendor this path never contacts;
//   · cue-1's note said the cue "ducks −6dB under VO automatically". There is no
//     mixing stage in this repo. That sentence was the only match for /duck/ in
//     app/, lib/ and components/ — a feature that existed as a claim and
//     nowhere else.
//
// The truth was already in hand and unread: `MusicProvenance` comes back from
// every render carrying the vendor, the model id, the milliseconds requested and
// the plan. This probe drives the REAL fixture and the REAL decision function
// that now reads it, and pins:
//
//   · a cue carries no model at all — a model is a property of a TAKE;
//   · with a take in hand, the vendor and model shown are the take's, verbatim;
//   · with no take, NOTHING is claimed — no default, no dash standing in;
//   · the refused cue names the real vendor and a failure kind the adapter can
//     genuinely return;
//   · no cue note asserts behaviour this build does not perform.
import { test, expect } from "@playwright/test";

import { CUES } from "@/app/_studio/score";
import { engineCredit, type Take } from "@/app/_phases/score/ScoreSpotting";
import { statusFor, type MusicErrorKind } from "@/lib/music/errors";
import type { MusicProvenance } from "@/lib/music/types";

/** Exactly what lib/music/elevenlabs.ts builds on a successful compose. */
const PROVENANCE: MusicProvenance = {
  vendor: "elevenlabs",
  modelId: "music_v2",
  requestedMs: 13_000,
  plan: { positiveGlobalStyles: [], negativeGlobalStyles: [], sections: [] },
  generatedAt: "2026-08-29T00:00:00.000Z",
};

const rendered = CUES.find((c) => c.status === "rendered")!;
const failed = CUES.find((c) => c.status === "failed")!;

// ── A cue is a request; a model is a property of a take ─────────────────────

test("no cue carries a model field at all", () => {
  for (const c of CUES) {
    // THE DEFECT: `model: "lyria-3"` on all three, and the surface printed it.
    expect(Object.keys(c), `${c.id} still declares a model`).not.toContain("model");
  }
  console.log(`[music] ${CUES.length} cues, 0 declared models`);
});

test("with a take in hand the credit is the TAKE's vendor and model, verbatim", () => {
  const take: Take = { state: "done", url: "blob:x", provenance: PROVENANCE };
  const credit = engineCredit(rendered, take);
  console.log(`[music] credit with take -> ${credit.text}`);
  expect(credit.text).toContain("elevenlabs");
  expect(credit.text).toContain("music_v2");
  // The vendor that never served this app must not appear anywhere.
  expect(credit.text.toLowerCase()).not.toContain("lyria");
});

test("a cue that has never been rendered claims NO model — absence reads as absence", () => {
  const credit = engineCredit(failed, undefined);
  console.log(`[music] credit for never-rendered -> "${credit.text}"`);
  // Not "unknown", not "—", not a default model id: nothing at all. A dash in
  // this slot is still a slot, and a slot invites a fallback value to fill it.
  expect(credit.text).toBe("");
});

test("a fixture-rendered cue with no take says the RECORD is absent, never a model", () => {
  const credit = engineCredit(rendered, undefined);
  console.log(`[music] credit for fixture-rendered, no take -> ${credit.text}`);
  expect(credit.text).toBe("model not recorded");
  expect(credit.why).toContain("no provenance");
  // "we hold no provenance" and "it was made by X" are different sentences and
  // this one must never drift into the other.
  expect(credit.text.toLowerCase()).not.toContain("lyria");
  expect(credit.text.toLowerCase()).not.toContain("elevenlabs");
});

test("a working take claims nothing yet either", () => {
  expect(engineCredit(failed, { state: "working" }).text).toBe("");
});

// ── The refusal names the real vendor and a reason the code can produce ─────

test("the refused cue's failure kind is one the adapter can actually return", () => {
  expect(failed.failure, "the failed cue declares no kind").toBeDefined();
  const kind = failed.failure as MusicErrorKind;
  console.log(`[music] refused cue kind=${kind} -> HTTP ${statusFor(kind)}`);
  // statusFor is total over MusicErrorKind, so the real assertion is that this
  // is the kind the refusal path produces — 422, the one the Score surface
  // renders as refused-silence and never retries.
  expect(statusFor(kind)).toBe(422);
  expect(kind).toBe("refused");
});

test("the refused cue names ElevenLabs and no vendor this path never contacts", () => {
  const note = failed.note.toLowerCase();
  console.log(`[music] refused note -> ${failed.note}`);
  expect(note).toContain("elevenlabs");
  for (const ghost of ["lyria", "google", "suno", "udio", "musicgen"])
    expect(note, `the refused cue still blames ${ghost}`).not.toContain(ghost);
});

// ── No note asserts a behaviour this build does not have ────────────────────

test("no cue note claims ducking — the claim is either gone or marked NOT PERFORMED", () => {
  for (const c of CUES) {
    // The indicative claim is the defect. If ducking survives on a cue at all it
    // survives in `declaredNotPerformed`, which the surface renders under a
    // literal "not performed" label.
    expect(c.note.toLowerCase(), `${c.id}'s note still asserts ducking`).not.toMatch(/duck/);
    expect(c.note.toLowerCase(), `${c.id}'s note still claims automatic behaviour`).not.toMatch(
      /automatic/,
    );
  }
  const declared = CUES.filter((c) => c.declaredNotPerformed);
  console.log(`[music] declared-but-unperformed intents: ${declared.map((c) => c.declaredNotPerformed).join(", ")}`);
  // The intent is worth keeping on the record — this pins that keeping it did
  // not quietly restore the claim.
  expect(declared.length).toBeGreaterThan(0);
});
