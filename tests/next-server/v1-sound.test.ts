import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AUDIO_WEIR_ID, projectSound, soundSource, type SoundShelf } from "../../lib/ledger/v1/sources/sound.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The sound shelf over a literal takes.json (lib/sound/store.ts readTakes): the
// facts it projects and their tally counted apart, the one audio triage pile -
// demo fixture takes in neither half of it - and the reader at SOUND_STORE_DIR.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
type Take = SoundShelf["takes"][number];
const take = (id: string, over: Partial<Take> = {}): Take => ({
  id,
  kind: "music",
  title: `take ${id}`,
  provider: "elevenlabs",
  origin: "agent",
  verdict: "unjudged",
  createdAt: "2026-10-15T09:00:00.000Z",
  judgedAt: null,
  ...over,
});
const shelf = (takes: Take[]): SoundShelf => ({ takes });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("sound projection", () => {
  it("counts the facts it projects; a verdict is recorded at judgedAt, and observed when v1 wrote none", () => {
    const p = projectSound(
      shelf([take("t1"), take("t2", { verdict: "kept", judgedAt: "2026-10-15T10:00:00+00:00" }), take("t3", { verdict: "rejected", origin: "operator" })]),
      ctx(),
    );
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally).toEqual({ records: { "take.unjudged": 1, "take.kept": 1, "take.rejected": 1 }, facts: { "take.create": 3, "verdict.kept": 1, "verdict.rejected": 1 } });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
    expect(p.events.find((e) => e.key === "sound:t2:verdict.kept")).toMatchObject({ atSrc: "recorded", occurredAt: "2026-10-15T10:00:00.000Z", lane: "audio" });
    expect(p.events.find((e) => e.key === "sound:t3:verdict.rejected")).toMatchObject({ atSrc: "derived", occurredAt: "2026-10-15T12:00:00.000Z" });
    expect(p.events.find((e) => e.key === "sound:t1:create")?.actor).toEqual({ kind: "agent", id: "sound-elevenlabs" });
  });

  it("unjudged takes are one triage pile since the oldest; a demo fixture take is neither pending nor decided", () => {
    const p = projectSound(
      shelf([
        take("t1", { createdAt: "2026-10-15T08:00:00.000Z" }),
        take("t2", { createdAt: "2026-10-15T07:30:00+00:00" }),
        take("t3", { verdict: "kept", judgedAt: "2026-10-15T10:00:00.000Z" }),
        take("f1", { origin: "fixture", createdAt: "2026-10-01T00:00:00.000Z" }),
        take("f2", { origin: "fixture", verdict: "kept", judgedAt: "2026-10-01T00:00:00.000Z" }),
      ]),
      ctx(),
    );
    expect(p.weir).toEqual([{ source: "sound", id: AUDIO_WEIR_ID, title: "takes to triage", media: "audio", kind: "cull", since: "2026-10-15T07:30:00.000Z", decided: 1, pending: 2, href: "/floor?lane=audio" }]);
    expect(p.live).toEqual([]);
  });

  it("a shelf with only fixture takes waiting has no pile", () => {
    expect(projectSound(shelf([take("f1", { origin: "fixture" })]), ctx()).weir).toEqual([]);
  });
});

describe("sound reader", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gt-sound-"));
  const saved = process.env["SOUND_STORE_DIR"];
  afterAll(() => {
    if (saved === undefined) delete process.env["SOUND_STORE_DIR"];
    else process.env["SOUND_STORE_DIR"] = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads takes.json through the door; a take that drifted fails the read with the door's words", async () => {
    process.env["SOUND_STORE_DIR"] = dir;
    writeFileSync(path.join(dir, "takes.json"), JSON.stringify({ takes: [take("t1")] }));
    const good = await soundSource.read();
    expect(good.ok && good.value.takes.map((t) => t.id)).toEqual(["t1"]);
    writeFileSync(path.join(dir, "takes.json"), JSON.stringify({ takes: [{ ...take("t2"), verdict: "maybe" }] }));
    const bad = await soundSource.read();
    expect(bad.ok ? "ok" : bad.error.message).toMatch(/^takes\.json: /);
  });
});
