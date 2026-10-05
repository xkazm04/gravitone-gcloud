// LANE — THE STORAGE DOOR CAN RETRY WHERE IT FAILED (source ratchet).
//
// StudioView's doctrine keeps `storage` apart from `absent` because the work is
// on disk and merely out of reach: the thing to do about it is different. That
// difference is a retry, which only makes sense on the door the user can clear.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(join(process.cwd(), "app/studio/[projectId]/StudioView.tsx"), "utf8"));

function branch(from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  expect(a, `${from} not found`).toBeGreaterThan(0);
  expect(b, `${to} not found after ${from}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

test("the storage door re-runs the open; the absent door does not", () => {
  const storage = branch('data-testid="door-storage"', "</>");
  const absent = branch('data-testid="door-absent"', 'data-testid="door-storage"');

  expect(storage, "storage door has no Try again control").toMatch(/<Button[\s\S]*?onClick=[\s\S]*?setAttempt[\s\S]*?Try again/);
  expect(storage, "the retry must put the door back to opening").toMatch(/kind: "opening"/);
  expect(absent).not.toMatch(/Try again/);

  // The open effect must depend on the retry nonce or the click re-runs nothing.
  expect(src).toMatch(/\[id, user, router, attempt\]/);
});
