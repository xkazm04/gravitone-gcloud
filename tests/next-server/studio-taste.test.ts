// THE TASTE WRITES (spark suno-advisor WP2): a keep or a drop of one taste line is ONE `audio.taste`
// ledger event through its door, on the one taste subject, keyed without a dot, and the answer is the
// profile folded anew by the same reader the page and the agent's inbox use (lib/sound/suno/facts.ts
// tasteProfile). Over an in-memory kernel; no store file is opened.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseTasteEvent, TASTE_EVENT, TASTE_SUBJECT } from "@gt/domain/audio.suno.schema";
import type { Actor } from "@gt/domain/event";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { dropTaste, keepTaste } from "../../app/(studio)/audio/studio/_live/taste.ts";
import { tasteProfile } from "../../lib/sound/suno/facts.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const at = (min: number) => `2026-10-29T10:${String(min).padStart(2, "0")}:00.000Z`;

function store(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
}

const tasteEvents = (s: Store) => {
  const r = queryEvents(s, { type: [TASTE_EVENT], order: "asc", limit: 100 });
  if (!r.ok) throw r.error;
  return r.value.events;
};

describe("taste: keep and drop", () => {
  it("keep -> drop -> keep folds to kept, and each press answers the profile anew", () => {
    const s = store();
    const k1 = keepTaste(s, { line: "Dry male vocals", lean: "like", session: "song-ab12-20261029", turn: "a-3" }, OPERATOR, at(0));
    expect(k1.ok && k1.value.map((l) => l.line)).toEqual(["Dry male vocals"]);
    const d = dropTaste(s, "dry  male VOCALS", OPERATOR, at(1));
    expect(d.ok && d.value).toEqual([]);
    const k2 = keepTaste(s, { line: "dry male vocals", lean: "like" }, OPERATOR, at(2));
    expect(k2.ok && k2.value).toEqual([{ line: "dry male vocals", lean: "like", since: expect.any(String) }]);
    const folded = tasteProfile(s);
    expect(folded.ok && folded.value.map((l) => [l.line, l.lean])).toEqual([["dry male vocals", "like"]]);
  });

  it("holds two lines apart, each with its lean", () => {
    const s = store();
    keepTaste(s, { line: "trap hats", lean: "dislike" }, OPERATOR, at(0));
    const two = keepTaste(s, { line: "warm tape saturation", lean: "like" }, OPERATOR, at(1));
    expect(two.ok && two.value.map((l) => [l.line, l.lean])).toEqual([["trap hats", "dislike"], ["warm tape saturation", "like"]]);
    const one = dropTaste(s, "Trap Hats", OPERATOR, at(2));
    expect(one.ok && one.value.map((l) => l.line)).toEqual(["warm tape saturation"]);
  });

  it("files door-valid events on the taste subject, lane audio, keyed without a dot", () => {
    const s = store();
    keepTaste(s, { line: "trap hats", lean: "dislike", session: "song-ab12-20261029" }, OPERATOR, at(0));
    dropTaste(s, "trap hats", OPERATOR, at(1));
    const evs = tasteEvents(s);
    expect(evs).toHaveLength(2);
    for (const e of evs) {
      expect(parseTasteEvent(e.data).ok).toBe(true);
      expect(e.subject).toEqual(TASTE_SUBJECT);
      expect(e.lane).toBe("audio");
      expect(e.key?.split(":")[0]).not.toContain(".");
    }
    expect(evs.map((e) => (e.data as { op: string }).op)).toEqual(["keep", "drop"]);
    expect((evs[1]?.data as { lean: string }).lean).toBe("dislike");
  });

  it("refuses a drop of a line the profile does not hold, and a line the door refuses", () => {
    const s = store();
    const none = dropTaste(s, "trap hats", OPERATOR, at(0));
    expect(none.ok ? "" : none.error.code).toBe("not-found");
    const long = keepTaste(s, { line: "x".repeat(121), lean: "like" }, OPERATOR, at(1));
    expect(long.ok ? "" : long.error.message).toMatch(/^audio\.taste: line/);
    expect(tasteEvents(s)).toEqual([]);
  });

  it("the same press twice files once", () => {
    const s = store();
    keepTaste(s, { line: "trap hats", lean: "dislike" }, OPERATOR, at(0));
    keepTaste(s, { line: "trap hats", lean: "dislike" }, OPERATOR, at(0));
    expect(tasteEvents(s)).toHaveLength(1);
  });
});
