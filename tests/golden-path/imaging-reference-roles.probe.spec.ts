// LANE — AN ATTACHED IMAGE SAYS WHAT IT IS FOR (dynamic).
//
// Registry: media-generation / image-prompt-composition / reference-role-map.
//
// google.ts's `generate` has carried a role note since it was written, with the
// reason in its own comment: "An unlabelled reference is read as content to
// reproduce, which on a style-lock request means getting the previous frame's
// subject back in the new frame's style: exactly backwards."
//
// `edit` had none. Measured 2026-08-29: it built `[{text: instruction},
// plate, ...refs]` and shipped up to fourteen images with no role declared for
// any of them. The asymmetry is backwards — generate attaches ONE kind of image
// and edit attaches TWO, so edit is the heterogeneous call the technique exists
// for, where attachments are ambiguous "about each other": nothing said which
// image was the thing to change and which were the look to change it into.
//
// WHY THESE FUNCTIONS ARE EXPORTED. They are pure string builders behind a
// network call this lane cannot make, and the repo already has this precedent
// written down — `stepStore.claimSaveSlot` is "exported and separated from
// saveStep on purpose: the IndexedDB write itself cannot be driven in this
// repo's Node-context probe suite, and a latest-wins rule that cannot be
// asserted is a rule nobody can trust." Same argument, same shape: the rule is
// a pure function of its inputs, so it is testable exactly once it is reachable.

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { buildEditPrompt, buildPrompt } from "@/lib/imaging/providers/google";

test("an edit carrying style references declares both roles, and scopes both", () => {
  const out = buildEditPrompt("Make the sky overcast.", 3);

  // THE MAP LEADS. The technique is explicit about the ordering and the reason:
  // "the half that resolves ambiguity has to arrive before the ambiguous
  // material does". A map appended under the instruction is a map the model
  // reads after it has already decided what the images are.
  expect(
    out.indexOf("IMAGE ROLES"),
    "the role map must precede the instruction, not follow it",
  ).toBeLessThan(out.indexOf("Make the sky overcast."));

  // Both roles named, and the count is the real count rather than a fixed word.
  expect(out).toContain("SUBJECT PLATE");
  expect(out).toContain("next 3 attached images are STYLE REFERENCES");

  // Rule 4 — negative scope on both, because both bleeds are real here: the
  // references must not contribute content, and the plate must not contribute
  // style once references are present.
  expect(out, "the references must be scoped OUT of content").toMatch(/Do NOT copy their subject matter/);
  expect(out, "the plate must be scoped out of style").toMatch(/do not take its style from anywhere but the references/);

  // The instruction survives intact — a map that paraphrases the ask has
  // replaced the ask.
  expect(out).toContain("Make the sky overcast.");
});

test("singular and plural are the attachment count, not a guess", () => {
  expect(buildEditPrompt("x", 1)).toContain("next attached image is a STYLE REFERENCE");
  expect(buildEditPrompt("x", 1)).not.toContain("images are");
  expect(buildEditPrompt("x", 5)).toContain("next 5 attached images");
});

test("with no references there is no ambiguity, and the instruction goes through untouched", () => {
  // A map over a single image invents a distinction the call does not have, and
  // every token spent on it is a token not spent on the edit. Byte-identical is
  // the assertion, not "roughly unchanged".
  expect(buildEditPrompt("Remove the lamppost.", 0)).toBe("Remove the lamppost.");
  expect(buildEditPrompt("Remove the lamppost.")).toBe("Remove the lamppost.");
});

test("both paths actually CALL their builder — a rule the caller ignores is not a rule", () => {
  // The four cases above test pure functions. All of them pass against an
  // adapter that builds its own text and never calls either builder, which is
  // precisely the state `edit` was in before this round: the rule existed one
  // function away and the call site did not reach it. So the wiring is asserted
  // too, on stripped source — these files explain the rule in prose directly
  // above the code, and a matcher over raw text is satisfied by the comment.
  const src = readFileSync("lib/imaging/providers/google.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const body = (name: string) => {
    const i = src.indexOf(`async ${name}(`);
    expect(i, `${name}() not found — this probe is matching the wrong shape`).toBeGreaterThan(-1);
    return src.slice(i, i + 900);
  };

  expect(body("edit"), "edit() builds its text without buildEditPrompt").toContain("buildEditPrompt(");
  expect(body("generate"), "generate() builds its text without buildPrompt").toContain("buildPrompt(");
});

test("generate's own role note still holds — the rule this path already had", () => {
  // Pinned here beside the edit case so the two cannot drift apart again, which
  // is how the gap arose: one path was fixed and its sibling was not.
  const one = buildPrompt("a harbour at dusk", undefined, 1);
  expect(one).toContain("attached image is a STYLE REFERENCE");
  expect(one).toContain("Do NOT copy their subject matter");

  const none = buildPrompt("a harbour at dusk");
  expect(none, "no references, no note").toBe("a harbour at dusk");

  const negated = buildPrompt("a harbour at dusk", "boats", 0);
  expect(negated).toContain("Do not include any of the following: boats.");
});
