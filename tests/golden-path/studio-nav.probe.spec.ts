// LANE — STUDIO NAVIGATION THROUGH ONE DOOR (pure reducer + source ratchets).
//
// The studio had four writers of "which step is on screen" (rail click, `[`/`]`,
// a `?step=` that changes, the initial open) and two stores of it (component
// state and the address) reconciled by hand with `seenWanted`/`initialWanted`.
// Three defects followed on b08bc7e, each a case below:
//   · after a rail click the address still named the deep-linked step, so a
//     reload reopened the wrong one                                 (case 6)
//   · a hand-off Link to the step the address already named was swallowed
//                                                                   (case 4)
//   · a hand-off back to the first deep-linked step moved the rail but was
//     refused its park                                              (case 5)
// app/studio/[projectId]/studioNav.ts is the one transition function; StudioView
// runs its effects. Cases 1-8 drive the reducer; 9-10 prove the runner is wired
// to it and actually writes the address.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { PHASES, type PhaseKey, type Project } from "@/lib/projects";
import {
  initialNav,
  neighbour,
  step,
  type NavEffect,
  type NavEvent,
  type NavState,
} from "@/app/studio/[projectId]/studioNav";

import { mkProject, stripComments } from "./_helpers";

const proj = (phase: PhaseKey, updatedAt = 1000): Project => ({ ...mkProject("p1", updatedAt), phase });

/** Fold events from a fresh state; return the final state and the LAST event's effects. */
function run(url: string | null, ...events: NavEvent[]): { state: NavState; effects: NavEffect[]; all: NavEffect[][] } {
  let state = initialNav(url);
  let effects: NavEffect[] = [];
  const all: NavEffect[][] = [];
  for (const ev of events) {
    ({ state, effects } = step(state, ev));
    all.push(effects);
  }
  return { state, effects, all };
}

const opened = (url: string | null, phase: PhaseKey = "script"): NavEvent => ({
  type: "opened",
  project: proj(phase),
  url,
  seq: 1,
});

test("case 1 [guard]: a deep link that opened the studio wins over the bookmark and does not park", () => {
  const { state, effects } = run("research", opened("research"));
  expect(state.door.kind).toBe("open");
  expect(state.active).toBe("research");
  expect(effects).toEqual([]);
});

test("case 2: an unknown ?step= falls back to the bookmark, and its echo changes nothing", () => {
  const a = run("bogus", opened("bogus"));
  expect(a.state.active).toBe("script");
  expect(a.effects).toEqual([]);
  const b = step(a.state, { type: "urlChanged", url: "bogus" });
  expect(b.state).toEqual(a.state);
  expect(b.effects).toEqual([]);
});

test("case 3: a rail pick parks, writes the address, re-reads — and the router's echo does not park twice", () => {
  const a = run("research", opened("research"), { type: "railPicked", key: "score" });
  expect(a.state.active).toBe("score");
  expect(a.effects).toEqual([{ kind: "park", key: "score" }, { kind: "replaceUrl", key: "score" }, { kind: "reread" }]);
  const echo = step(a.state, { type: "urlChanged", url: "score" });
  expect(echo.effects).toEqual([]);
  expect(echo.state.active).toBe("score");
});

test("case 4: THE SWALLOWED HANDOFF — a Link to the step the address named before a rail move lands and parks", () => {
  const { state, effects } = run(
    "research",
    opened("research"),
    { type: "railPicked", key: "script" },
    { type: "urlChanged", url: "script" }, // the echo of our own replace
    { type: "urlChanged", url: "research" }, // ScriptStep's "Open Research"
  );
  expect(state.active).toBe("research");
  expect(effects).toContainEqual({ kind: "park", key: "research" });
});

test("case 4b: the handoff still lands when the router's echo of the rail move has not arrived yet", () => {
  const { state, effects } = run(
    "research",
    opened("research"),
    { type: "railPicked", key: "script" },
    { type: "urlChanged", url: "research" },
  );
  expect(state.active).toBe("research");
  expect(effects).toContainEqual({ kind: "park", key: "research" });
});

test("case 5: RETURN TO THE FIRST STEP PARKS — a handoff back to the deep-linked step is a real move", () => {
  const { all } = run(
    "research",
    opened("research"),
    { type: "urlChanged", url: "script" },
    { type: "urlChanged", url: "research" },
  );
  expect(all[1]).toContainEqual({ kind: "park", key: "script" });
  expect(all[2]).toContainEqual({ kind: "park", key: "research" });
});

test("case 6: RELOAD AFTER A RAIL MOVE — the address names the step on screen, so a re-open lands there", () => {
  const { state } = run("research", opened("research"), { type: "railPicked", key: "frames" });
  expect(state.url).toBe("frames");
  const reopened = run(state.url, opened(state.url, "frames"));
  expect(reopened.state.active).toBe("frames");
});

test("case 7: neighbour is the one rail-adjacency rule, and nobody else does index arithmetic", () => {
  expect(neighbour("cut", 1)).toBeNull();
  expect(neighbour("research", -1)).toBeNull();
  expect(neighbour("frames", 1)).toBe("motion");
  expect(neighbour("frames", -1)).toBe("script");
  // `]` at the end goes nowhere and says so: no state change, no effects.
  const end = run("cut", opened("cut"));
  const pressed = step(end.state, { type: "bracket", by: 1 });
  expect(pressed.state).toEqual(end.state);
  expect(pressed.effects).toEqual([]);
  const back = step(end.state, { type: "bracket", by: -1 });
  expect(back.state.active).toBe("score");
  expect(back.effects).toContainEqual({ kind: "park", key: "score" });

  for (const rel of ["app/studio/[projectId]/StudioView.tsx", "app/studio/[projectId]/Stepper.tsx"]) {
    const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
    expect(src, `${rel} still computes adjacency by hand`).not.toMatch(/PHASES\.indexOf\(/);
    expect(src, `${rel} must take adjacency from studioNav`).toMatch(/import\s*\{[^}]*\bneighbour\b[^}]*\}\s*from\s*"\.\/studioNav"/);
  }
  const stepper = stripComments(readFileSync(join(process.cwd(), "app/studio/[projectId]/Stepper.tsx"), "utf8"));
  expect(stepper, "End must map to the last phase").toMatch(/PHASES\.at\(-1\)/);
  expect(PHASES.at(-1)).toBe("cut");
});

test("case 8: a slow re-read never overwrites a newer record", () => {
  const newer = proj("frames", 2000);
  const older = proj("script", 1000);
  const { state } = run(
    "research",
    opened("research"),
    { type: "refreshed", project: newer, seq: 3 },
    { type: "refreshed", project: older, seq: 2 },
  );
  expect(state.project).toBe(newer);
  // A sign-off result is ordered by the same token.
  const locked = step(state, { type: "lockResult", project: older, seq: 2 });
  expect(locked.state.project).toBe(newer);
  const later = step(state, { type: "lockResult", project: older, seq: 4 });
  expect(later.state.project).toBe(older);
});

const studio = stripComments(readFileSync(join(process.cwd(), "app/studio/[projectId]/StudioView.tsx"), "utf8"));

test("case 9 (critic): the runner writes the address with every other query param kept", () => {
  const at = studio.indexOf('"replaceUrl"');
  expect(at, "the effect executor has no replaceUrl branch").toBeGreaterThan(0);
  const branch = studio.slice(at, at + 600);
  expect(branch).toMatch(/new URLSearchParams\([^)]*\)/);
  expect(branch).toMatch(/\.set\("step",\s*\w+\.key\)/);
  expect(branch).toMatch(/router\.replace\(`\/studio\/\$\{id\}\?\$\{params\}`,\s*\{\s*scroll:\s*false\s*\}\)/);
});

test("case 10 (wiring): StudioView runs studioNav's step and holds no reconciliation of its own", () => {
  expect(studio).toMatch(/import\s*\{[^}]*\bstep\b[^}]*\}\s*from\s*"\.\/studioNav"/);
  expect(studio).not.toMatch(/seenWanted|initialWanted|pickRef/);
  expect(studio).not.toMatch(/setPhaseKey/);
  // Every event the studio produces goes through the one door.
  for (const ev of ["opened", "railPicked", "bracket", "urlChanged", "refreshed", "lockResult"])
    expect(studio, `StudioView never dispatches ${ev}`).toMatch(new RegExp(`type:\\s*"${ev}"`));
  // The rail's handler keeps its name (studio-workspace/B ratchets on it).
  expect(studio).toMatch(/<Stepper[^>]*onPick=\{pick\}/);
});
