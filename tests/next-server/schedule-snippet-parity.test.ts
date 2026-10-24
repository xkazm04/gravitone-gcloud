// THE SCHEDULE FORM REFUSES WHAT THE YOUTUBE UPLOAD WILL REFUSE (form one-validation-door: one
// constraint, two doors, and the pair is what drifts). The form's check
// (packages/ui/src/components/floor/schedule.ts checkSchedule) runs when the slot is made; the
// adapter's (lib/publish/youtube.ts snippetProblem) runs at the slot's hour, inside the upload.
// A snippet the form lets through and the adapter refuses is a slot that is accepted, waits, and
// fails at its hour with nobody watching. So the cases below are fed to BOTH, and the form must
// block exactly the ones the adapter refuses.
import { describe, expect, test } from "vitest";

import { snippetProblem } from "@/lib/publish/youtube";

import { checkSchedule, splitTags, type ChannelReady, type ScheduleForm } from "../../packages/ui/src/components/floor/schedule.ts";

const CHANNELS: ChannelReady[] = [{ channel: "youtube", state: "dry", env: [], command: "x" }];
const form = (title: string, description: string, tags: string): ScheduleForm => ({ item: "video:export:a", channel: "youtube", when: "2026-10-16T12:00", title, description, tags });

const tagList = (n: number, word: string): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(", ");

const CASES: readonly { readonly name: string; readonly title: string; readonly description?: string; readonly tags?: string }[] = [
  { name: "a plain snippet", title: "Why the strait matters", description: "Every lane has one strait.", tags: "trade, maps" },
  { name: "an empty title", title: "   " },
  { name: "a title over 100", title: "t".repeat(101) },
  { name: "a title of exactly 100", title: "t".repeat(100) },
  { name: "a '<' in the title", title: "Cats <3" },
  { name: "a '>' in the description", title: "A cut", description: "before -> after" },
  { name: "5000 one-byte characters", title: "A cut", description: "a".repeat(5000) },
  { name: "3000 two-byte characters (6000 bytes)", title: "A cut", description: "ž".repeat(3000) },
  { name: "tags under 500 (489 characters)", title: "A cut", tags: tagList(50, "tagname") },
  { name: "tags over 500 characters", title: "A cut", tags: tagList(60, "tagname") },
  { name: "spaced tags whose quotes cross 500", title: "A cut", tags: tagList(42, "two word") },
];

describe("the schedule form and the YouTube upload agree on a snippet", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const f = form(c.title, c.description ?? "", c.tags ?? "");
      const adapter = snippetProblem({ title: f.title.trim(), description: f.description, tags: splitTags(f.tags) });
      const blocked = checkSchedule(f, CHANNELS).blocked.filter((b) => b.field !== "item" && b.field !== "channel" && b.field !== "when");
      expect(blocked.length > 0, `adapter: ${adapter ?? "takes it"}; form: ${blocked.map((b) => b.words).join(" · ") || "sends it"}`).toBe(adapter !== null);
    });
  }

  test("the cases reach every rule the adapter has (a refusal per rule, and a clean one)", () => {
    const said = new Set(CASES.map((c) => snippetProblem({ title: c.title.trim(), description: c.description ?? "", tags: splitTags(c.tags ?? "") })));
    expect([...said].sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
      "description exceeds 5000 bytes",
      null,
      "tags exceed 500 characters",
      "title exceeds 100 characters",
      "title is empty",
      "title/description may not contain '<' or '>'",
    ]);
  });
});
