// LANE — STUDIO WORKSPACE: the project's next move, named inside the studio.
//
// The shelf answers "where does this project need me" with `nextAction`
// (app/_projects/shelf.ts) and draws it as one press on the race sheet. Inside
// the studio that answer was gone: six marks on the rail and the user decides
// alone, and locking a step left you standing on it. `studioNext` is the same
// answer seen from the step you are on — the shelf's verb, or nothing when the
// verb would name where you already are or the project is delivered. Cases 1-5
// drive the pure rule, 6 pins that there is exactly one precedence, 7-8 prove
// the studio is wired to it and that the sign-off control kept its shape.

import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { nextAction } from "@/app/_projects/shelf";
import { seedProjects } from "@/app/_studio/projectSeed";
import { studioNext } from "@/app/studio/[projectId]/nextMove";
import { PHASES, getProject, putProject, signOff, type Project } from "@/lib/projects";
import { openDb, PROJECTS_STORE, runTx } from "@/lib/studioDb";

import { mkProject, stripComments } from "./_helpers";

test.beforeEach(async () => {
  const db = await openDb();
  try {
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
      store.clear();
    });
  } finally {
    db.close();
  }
});

const glass = (): Project => seedProjects("u1").find((p) => p.id === "seed-glass-harbor")!;

test("case 1: Glass Harbor on Research is handed to the first decision — Decide Frames", () => {
  expect(studioNext(glass(), "research")).toEqual({ verb: "Decide Frames", step: "frames", tone: "you" });
});

test("case 2: standing on the first step that needs you draws no chip", () => {
  expect(studioNext(glass(), "frames")).toBeNull();
});

test("case 3: Lock hands you on — Continue on the step you are on is null; after signOff, Start Script", async () => {
  const p0 = await putProject({ ...mkProject("nm-lock", Date.now(), { research: "working" }) });
  expect(studioNext(p0, "research")).toBeNull();
  await signOff(p0.id, "research");
  const reread = (await getProject(p0.id))!;
  expect(studioNext(reread, "research")).toEqual({ verb: "Start Script", step: "script", tone: "you" });
});

test("case 4: worst news first, from the step you are on — Unblock Score", () => {
  const p = mkProject("nm-block", 1000, { script: "working", score: "blocked" });
  expect(studioNext(p, "script")).toEqual({ verb: "Unblock Score", step: "score", tone: "blocked" });
});

test("case 5: a delivered project is not a move — null from every step", () => {
  const p: Project = {
    ...mkProject("nm-done", 1000),
    signedOff: Object.fromEntries(PHASES.map((k) => [k, 1])),
  };
  expect(nextAction(p).verb).toBe("Delivered");
  for (const a of PHASES) expect(studioNext(p, a), a).toBeNull();
});

test("case 6 [guard]: the studio never grows a second precedence — null or exactly the shelf's nextAction", () => {
  for (const p of seedProjects("u1")) {
    for (const a of PHASES) {
      const n = studioNext(p, a);
      if (n !== null) expect(n, `${p.id} @ ${a}`).toEqual(nextAction(p));
    }
  }
});

const view = stripComments(readFileSync(join(process.cwd(), "app/studio/[projectId]/StudioView.tsx"), "utf8"));
const chip = stripComments(readFileSync(join(process.cwd(), "app/studio/[projectId]/NextMoveChip.tsx"), "utf8"));

test("case 7 (wiring): the chip and its key go through the rail's own door, and the keymap lists the key", () => {
  // The live surface derives the move from studioNext, not a copy of the rule.
  expect(view).toMatch(/import\s*\{[^}]*\bstudioNext\b[^}]*\}\s*from\s*"\.\/nextMove"/);
  expect(view).toMatch(/studioNext\(\s*project\s*,\s*phaseKey\s*\)/);
  expect(view).not.toMatch(/\bnextAction\(/);
  // The rail's handler is `pick` (studio-nav case 10); the chip's press IS that
  // handler, so it parks and closes Outputs exactly as a rail click does.
  expect(view).toMatch(/<Stepper[^>]*onPick=\{pick\}/);
  expect(view).toMatch(/<NextMoveChip[^>]*onGo=\{pick\}/);
  // The key handler presses the same door.
  const key = view.indexOf('e.key === "}"');
  expect(key, "no next-move key handler").toBeGreaterThan(0);
  expect(view.slice(key, key + 400)).toMatch(/\bpick\(/);
  // STEP_KEYS names the key, so Keycaps draws it.
  const keys = view.slice(view.indexOf("const STEP_KEYS"), view.indexOf("];", view.indexOf("const STEP_KEYS")));
  expect(keys).toMatch(/keys:\s*\["\}"\]/);
  // The chip: a button whose accessible name is the verb, and never hue alone.
  expect(chip).toMatch(/data-testid="studio-next-move"/);
  expect(chip).toMatch(/<ArrowRight[^>]*aria-hidden/);
  expect(chip).toMatch(/\{move\.verb\}/);
  expect(chip).not.toMatch(/aria-label=/);
  expect(chip).not.toMatch(/<Hint\b|title=/);
  expect(chip).toMatch(/if\s*\(!move\)\s*return null/);
});

test("case 8 [guard]: the sign-off control keeps aria-disabled + aria-describedby and the blocker it describes", () => {
  const at = view.indexOf('data-testid="studio-step-signoff"');
  expect(at).toBeGreaterThan(0);
  const open = view.slice(view.lastIndexOf("<button", at), view.indexOf(">", view.indexOf("onClick", at)));
  expect(open).not.toMatch(/[^-\w]disabled=/);
  expect(open).toMatch(/aria-disabled=/);
  expect(open).toMatch(/aria-describedby=\{[^}]*\}/);
  expect(view).toMatch(/id="studio-signoff-blocker"[^>]*>\s*\{blocker\}/);
});
