// THE AUDIO DESK'S HUNT, RUBRIC AND STRENGTHS ISLANDS, THEIR REQUEST POSTURE. A Server Action
// whose round trip fails REJECTS rather than answering `ok: false`; an island that only reads
// `.then(r => ...)` then never clears the busy flag it raised, and the gesture is dead until a
// reload. Held here: the one wait every write goes through (app/(studio)/audio/_hunt/settled.ts)
// turns a rejection into a refusal, and each island's writes go through it (a source ratchet
// over the islands, walked off the filesystem - these are client components, and the Node lane
// has no DOM to press them in).

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { settled } from "../../app/(studio)/audio/_hunt/settled.ts";
import { chainOn } from "../../app/(studio)/audio/_insight/Rubric.tsx";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const AUDIO = path.join(ROOT, "app", "(studio)", "audio");
// Full-line comments only: the islands' prose is all `//` lines and block headers, and nothing
// this ratchet matches can sit at the end of a code line in them.
const code = (rel: string): string =>
  readFileSync(path.join(AUDIO, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

describe("settled - an island write's wait", () => {
  it("an answer is its answer", async () => {
    expect(await settled(Promise.resolve({ ok: true as const, value: 7 }))).toEqual({ ok: true, value: 7 });
    const refused = { ok: false as const, error: { error: "no hunt hn-x", code: "not-found" as const } };
    expect(await settled(Promise.resolve(refused))).toEqual(refused);
  });

  it("a rejected round trip is a refusal with its words, never a rejection", async () => {
    const r = await settled(Promise.reject(new Error("Failed to fetch"))).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ ok: false, error: { error: "the studio did not answer: Failed to fetch", code: "unavailable" } });
  });
});

describe("chainOn - one take's scores, in order", () => {
  it("a write that rejects does not stop the next one on the same take", async () => {
    const chains = new Map<string, Promise<void>>();
    const sent: string[] = [];
    const first = chainOn(chains, "t1", async () => {
      sent.push("first");
      throw new Error("Failed to fetch");
    });
    const second = chainOn(chains, "t1", async () => {
      sent.push("second");
    });
    await first.catch(() => undefined);
    await second;
    expect(sent).toEqual(["first", "second"]);
  });

  it("the second write waits for the first to settle", async () => {
    const chains = new Map<string, Promise<void>>();
    const seen: string[] = [];
    let open: () => void = () => {};
    void chainOn(chains, "t1", () => new Promise<void>((r) => (open = () => (seen.push("first done"), r()))));
    const second = chainOn(chains, "t1", async () => {
      seen.push("second");
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
    open();
    await second;
    expect(seen).toEqual(["first done", "second"]);
  });
});

describe("each island's writes wait through settled", () => {
  it("the hunt: map draft, crown, lesson draft and sign", () => {
    const src = code("_hunt/Hunt.tsx");
    expect(src.length).toBeGreaterThan(1000);
    expect(src.match(/void acts\.\w+\(/g) ?? []).toEqual([]);
    expect((src.match(/settled\(acts\.(draftHuntMap|crownTake|draftHuntLesson|confirmLessonAct)\(/g) ?? []).sort()).toEqual(
      ["settled(acts.confirmLessonAct(", "settled(acts.crownTake(", "settled(acts.draftHuntLesson(", "settled(acts.draftHuntMap("],
    );
  });

  it("the rubric: each score", () => {
    const src = code("_insight/Rubric.tsx");
    expect(src.length).toBeGreaterThan(1000);
    expect(src.match(/settled\(acts\.scoreTake\(/g) ?? []).toHaveLength(1);
    expect(src.match(/await acts\.scoreTake\(/g) ?? []).toEqual([]);
  });
});
