// gt_read steer: the agent door's compile of a sentence is the composer's (@gt/ui steer.ts) -
// heard terms with their words, unheard words, Suno fields with section tags when the sentence
// gives a shape, an ElevenLabs plan quoted in credits, dry - and it reads, never writes or spends.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { opOf } from "../../app/_server/mcp/registry.ts";
import type { ToolCtx } from "../../app/_server/mcp/op.ts";

const ctx = {} as ToolCtx;
let roots: string | undefined;

beforeEach(() => {
  roots = process.env["GRAVITONE_SAMPLE_ROOTS"];
  delete process.env["GRAVITONE_SAMPLE_ROOTS"];
});
afterEach(() => {
  if (roots === undefined) delete process.env["GRAVITONE_SAMPLE_ROOTS"];
  else process.env["GRAVITONE_SAMPLE_ROOTS"] = roots;
});

describe("gt_read steer", () => {
  const op = opOf("read", "steer");

  test("is a read: no writes, read-only annotations", () => {
    expect(op?.writes).toBe(false);
    expect(op?.annotations.readOnlyHint).toBe(true);
  });

  test("compiles a sentence the way the composer does, structure and quote included", async () => {
    const r = await op?.run({ sentence: "something like a heist movie but chill, 90 seconds" }, ctx);
    if (r === undefined || !r.ok) throw new Error(`no answer: ${JSON.stringify(r)}`);
    const v = r.value as { heard: { term: string; from: string[] }[]; unheard: string[]; suno: { style: string; lyrics: string }; elevenlabs: { credits: number; dry: boolean }; auditions: { path: string | null }[]; sketch: string | null };
    expect(v.heard.find((h) => h.term === "upright bass")?.from).toEqual(["heist", "movie"]);
    expect(v.unheard).toEqual([]);
    expect(v.suno.style).toContain("jazz funk");
    expect(v.suno.lyrics).toContain("[Intro: quiet");
    expect(v.elevenlabs.dry).toBe(true);
    expect(v.elevenlabs.credits).toBeGreaterThan(0);
    // No sample library configured here: nothing claims to be playable.
    expect(v.auditions.every((a) => a.path === null)).toBe(true);
    expect(v.sketch).toBeNull();
  });

  test("a sentence with no shape words leaves the form to Suno", async () => {
    const r = await op?.run({ sentence: "sad piano" }, ctx);
    if (r === undefined || !r.ok) throw new Error("no answer");
    const v = r.value as { suno: { lyrics: string }; elevenlabs: unknown };
    expect(v.suno.lyrics).toBe("[Instrumental]");
    expect(v.elevenlabs).toBeNull();
  });
});
