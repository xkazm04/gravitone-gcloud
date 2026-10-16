import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// On the server a "use client" export is a client REFERENCE: calling it throws, and a route that
// reaches it answers 500. Vitest runs it as plain code, so the reference is stood in here - the
// only way this lane sees the defect L40 hit (WAVE-D item 5).
vi.mock("../../lib/sound/client.ts", () => ({
  takeFileUrl: () => {
    throw new Error("Attempted to call takeFileUrl() from the server but takeFileUrl is on the client.");
  },
}));

import { encodeRecord } from "@gt/domain/steps/registry";

import { partVerdict, type VerdictInput } from "../../lib/parts/verdict.ts";

const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
const READY = { state: "ready", blob: { sha256: SHA, bytes: 7, mime: "image/png" } };
const unit = (id: string, startS: number) => ({
  id, sourceId: "cut-1", beatRef: { at: `0:${String(startS).padStart(2, "0")}` }, ordinal: 1, ofBeat: 1, startS, holdS: 15, kind: "beat", beatKind: "hook", title: id, line: "", plate: READY, clip: { status: "not-started", motion: "" }, elements: [], texts: [],
});

function input(records: Record<string, unknown>, takeIds: ReadonlySet<string> | null): VerdictInput {
  const m = new Map<string, Readonly<Record<string, unknown>>>();
  for (const [k, raw] of Object.entries(records)) {
    const e = encodeRecord(k, raw);
    if (!e.ok) throw new Error(e.error.message);
    m.set(k, e.value as Readonly<Record<string, unknown>>);
  }
  return { projectId: "p1", title: "Glass Harbor", discipline: "educational", targetS: 30, plansVoice: false, records: m, takeIds };
}

describe("the cut verdict on the server", () => {
  const records = {
    frames: { renderId: "cut-1", units: [unit("u1", 0), unit("u2", 15)] },
    score: { spots: [{ id: "c1", title: "bed", sceneIds: ["u1", "u2"], note: "", activeTakeId: "t1", takeIds: ["t1"] }] },
  };

  it("reads a held take without building its client-only URL, and a take not held stays missing", () => {
    expect(partVerdict("cut", input(records, new Set(["t1"]))).state).toBe("ready");
    const gone = partVerdict("cut", input(records, new Set(["t9"])));
    expect(gone.state).toBe("working");
    expect(gone.codes).toContainEqual({ code: "finish-takes", text: "1 cue without a take" });
  });
});
