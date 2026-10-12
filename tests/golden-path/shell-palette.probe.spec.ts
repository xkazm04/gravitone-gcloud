// LANE — SHELL PALETTE (pure index, ranker, command registry, chord).
//
// The index is a pure projection (components/ui/shell/palette.ts), so these
// drive the real functions with no renderer. The 390px trigger case is a live
// lane concern (tests/live) and is held here only as a source check on the
// frame: the trigger is mounted in BOTH worlds and carries an accessible name.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { createCommandRegistry } from "@/components/ui/shell/commands";
import { isPaletteChord, paletteIndex, pushRecent, rankEntries } from "@/components/ui/shell/palette";
import { studioHref } from "@/lib/jobLinks";
import { PHASES, PHASE_TITLE } from "@/lib/projects";

import { mkProject, stripComments } from "./_helpers";

const harbor = { ...mkProject("p-harbor", 2), title: "Glass Harbor" };
const ember = { ...mkProject("p-ember", 1), title: "Ember Line" };
const base = { projects: [harbor, ember], boardCounts: {}, jobs: [], commands: [] };

test("each project yields one project-step entry per PHASE, linked by studioHref", () => {
  const steps = paletteIndex(base).filter((e) => e.kind === "project-step");
  expect(steps).toHaveLength(2 * PHASES.length);
  for (const p of [harbor, ember]) {
    for (const step of PHASES) {
      const e = steps.find((x) => x.id === `step:${p.id}:${step}`);
      expect(e && "href" in e && e.href).toBe(studioHref(p.id, step));
    }
  }
});

test("board counts: one decision entry per non-zero source, count as a Tally fact", () => {
  const dec = paletteIndex({ ...base, boardCounts: { cull: 4, proof: 0, dojo: null } }).filter(
    (e) => e.kind === "decision",
  );
  expect(dec).toHaveLength(1);
  expect(dec[0].label).toBe("Cull");
  expect(dec[0].facts).toEqual([{ value: 4, label: "waiting" }]);
});

test('ranking "harb sco" puts Glass Harbor · Score first', () => {
  const ranked = rankEntries(paletteIndex(base), "harb sco");
  expect(ranked[0].label).toBe(`Glass Harbor · ${PHASE_TITLE.score}`);
  expect(ranked.every((e) => /harbor/i.test(e.label))).toBe(true);
});

test("a command registered by a mounted route appears, and is gone after unmount", () => {
  const reg = createCommandRegistry();
  const run = () => undefined;
  const unmount = reg.register([{ id: "new-project", label: "New project", run }]);
  const idx = () => paletteIndex({ ...base, commands: reg.list() }).filter((e) => e.kind === "command");
  expect(idx().map((e) => e.label)).toEqual(["New project"]);
  unmount();
  expect(idx()).toEqual([]);
});

test("unregistering leaves a same-id replacement from another owner alone", () => {
  const reg = createCommandRegistry();
  const off1 = reg.register([{ id: "x", label: "First", run: () => undefined }]);
  reg.register([{ id: "x", label: "Second", run: () => undefined }]);
  off1();
  expect(reg.list().map((c) => c.label)).toEqual(["Second"]);
});

test("Ctrl/Cmd+K is the chord, a bare k is not", () => {
  const k = { key: "k", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  expect(isPaletteChord(k)).toBe(false);
  expect(isPaletteChord({ ...k, ctrlKey: true })).toBe(true);
  expect(isPaletteChord({ ...k, metaKey: true })).toBe(true);
  expect(isPaletteChord({ ...k, key: "K", ctrlKey: true })).toBe(true);
  expect(isPaletteChord({ ...k, ctrlKey: true, shiftKey: true })).toBe(false);
});

test("the global chord listener does not filter on the event target", () => {
  const s = stripComments(readFileSync(join(process.cwd(), "components/ui/shell/ShellPalette.tsx"), "utf8"));
  const at = s.indexOf("isPaletteChord(e)");
  expect(at).toBeGreaterThan(-1);
  const body = s.slice(Math.max(0, at - 120), at + 200);
  expect(body).not.toMatch(/tagName|isContentEditable|e\.target/);
});

test("recents lead an empty query, newest first, and do not reorder a search", () => {
  const idx = paletteIndex(base);
  const href = studioHref("p-ember", "cut");
  const recents = pushRecent(pushRecent([], studioHref("p-harbor", "script")), href);
  expect(recents[0]).toBe(href);
  const empty = rankEntries(idx, "", recents);
  expect("href" in empty[0] && empty[0].href).toBe(href);
  expect(rankEntries(idx, "harb sco", recents)[0].label).toBe("Glass Harbor · Score");
});

test("StudioFrame mounts the palette trigger in both worlds", () => {
  const s = stripComments(readFileSync(join(process.cwd(), "components/ui/StudioFrame.tsx"), "utf8"));
  expect(s.match(/<ShellPalette /g)).toHaveLength(2);
  const p = stripComments(readFileSync(join(process.cwd(), "components/ui/shell/ShellPalette.tsx"), "utf8"));
  expect(p).toMatch(/aria-label="Search places, steps and decisions"/);
});
