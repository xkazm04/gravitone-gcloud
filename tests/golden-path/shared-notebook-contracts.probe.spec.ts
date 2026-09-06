// LANE — THE CLAIMS THE SHARED NOTEBOOK MAKES IN PROSE, MADE CHECKABLE.
//
// This context's files are unusually well documented, and that is exactly why
// this lane exists: several of the rules they state are asserted only in a
// comment, so the tree is free to drift out from under the sentence. Each test
// here takes one such claim and gives it a population walked off the
// filesystem or a predicate driven directly, so the claim fails when it stops
// being true rather than when somebody re-reads the paragraph.
//
// What is NOT here: anything the notebook graph already checks
// (notebook-graph.probe.spec.ts) or the source-migration ratchets already
// count (notebook-source-ladder / -population).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { railFor, SECTION_IDS } from "@/app/_phases/_shared/notebook/NotebookBody";
import { CONDITIONAL_SECTIONS, sectionRenders } from "@/app/_phases/_shared/notebook/sections/H";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

const ROOT = resolve(__dirname, "../..");

/* ── 1 · a rail pill jumps to a section that rendered ───────────────────────── */

test("rail: every pill the rail draws is a section that actually renders", () => {
  // The shipped fixture: all thirteen render, so all thirteen are offered.
  const drawn = railFor(NOTEBOOK).map(([id]) => id);
  console.log(`[rail] shipped fixture -> ${drawn.length} of ${SECTION_IDS.length} pill(s)`);
  expect(drawn.length).toBe(SECTION_IDS.length);
  expect(SECTION_IDS.length).toBeGreaterThan(10);
});

test("rail: a notebook with no counter-positions and no questions offers neither pill", () => {
  // THE STATE THE PILLS WERE DEAD IN. Both sections render behind a `length > 0`
  // of their own; the rail listed them unconditionally. `jump()` returns before
  // `setAt` when the element is absent, so the pill moved nothing, focused
  // nothing and set no `aria-current` — a control that does nothing and does
  // not say so.
  const empty: Notebook = { ...NOTEBOOK, counterPositions: [], candidateQuestions: [] };
  expect(sectionRenders(empty, "counters"), "the counters section renders for an empty list").toBe(false);
  expect(sectionRenders(empty, "questions"), "the questions section renders for an empty list").toBe(false);

  const drawn = railFor(empty).map(([id]) => id);
  console.log(`[rail] empty counters+questions -> ${drawn.length} pill(s): ${drawn.join(" ")}`);
  expect(drawn).not.toContain("counters");
  expect(drawn).not.toContain("questions");
  // ...and nothing else was lost with them.
  expect(drawn.length).toBe(SECTION_IDS.length - 2);
});

test("rail: the rail builds itself through railFor, never over the raw list", () => {
  // THE VACUITY THIS CLOSES, found by seeding: the two tests above drive
  // `railFor`, so reverting the COMPONENT to `SECTIONS.map(...)` left them
  // green — the predicate was asserted and its adoption was not. Both halves
  // are needed, and this is the half a probe cannot get from a Node lane with
  // no DOM. Same idiom as announcement.probe.spec.ts's structural checks.
  const src = stripComments(readFileSync(join(ROOT, "app/_phases/_shared/notebook/NotebookBody.tsx"), "utf8"));
  expect(/\{\s*railFor\(n\)\.map\(/.test(src), "the rail no longer maps over railFor(n)").toBe(true);
  // Everything except railFor's own body, which is the one place SECTIONS may
  // legitimately be read.
  const outsideRailFor = src.replace(/export function railFor[\s\S]*?\n\}/, "");
  expect(
    /\{\s*SECTIONS\s*\.\s*(filter|map)\(/.test(outsideRailFor),
    "the rail maps over SECTIONS directly again - a pill would be drawn for a section that does not render",
  ).toBe(false);
});

test("rail: every conditional predicate names a section the rail actually offers", () => {
  // A predicate for a section that is not in the rail is dead code that reads
  // as a live rule — the stale-tag failure, one layer up.
  for (const id of Object.keys(CONDITIONAL_SECTIONS))
    expect(SECTION_IDS, `${id} has a render predicate and no rail pill`).toContain(id);
});

test("rail: no section file still carries its own copy of a condition", () => {
  // THE PAIR THIS CLOSES. The condition existed twice — once in the rail, once
  // in the section — and only the section's copy was true. A third copy would
  // do it again, so the sections are read for the shape the predicate replaced.
  for (const file of ["sections/Argument.tsx", "sections/Apparatus.tsx"]) {
    const src = stripComments(readFileSync(join(ROOT, "app/_phases/_shared/notebook", file), "utf8"));
    for (const field of ["counterPositions", "candidateQuestions"])
      expect(
        new RegExp(`n\\.${field}\\.length\\s*>\\s*0\\s*&&`).test(src),
        `${file} guards a whole section on \`${field}.length > 0\` again — use sectionRenders() so the rail agrees`,
      ).toBe(false);
  }
});

/* ── 1b · conclusions travel beside the notebook, and the note says so ──────── */

test("conclusions: the one consumer that serialises the notebook for a model sends them too", () => {
  // WHY THIS IS A TEST AND NOT A SENTENCE. `CONCLUSIONS` is deliberately not a
  // field of `Notebook` — a conclusion has no source and may not be filed beside
  // the sourced facts — so any consumer that serialises "the notebook" for a
  // model has to send the array separately or the model never sees a card class
  // the UI lets the user annotate.
  //
  // Both types.ts and conclusions.ts carried that rule with a worked example
  // attached: "app/api/recalibrate/route.ts does not". The route has sent them
  // since 2026-08, in its own block. Two copies of one claim, both asserting a
  // defect that had already been fixed, and a comment that describes a live
  // finding is acted on as one.
  const route = stripComments(readFileSync(join(ROOT, "app/api/recalibrate/route.ts"), "utf8"));
  expect(
    /import\s*\{[^}]*\bCONCLUSIONS\b[^}]*\}\s*from/.test(route),
    "the recalibrate route no longer imports CONCLUSIONS - the model would be annotated about c-* cards it was never shown",
  ).toBe(true);
  expect(
    /\bconclusions\b/.test(route),
    "the recalibrate route no longer names conclusions in its payload",
  ).toBe(true);

  // And neither note may go back to claiming otherwise. The prose is what a
  // reader acts on, so it is held to the same standard as the code.
  for (const file of ["types.ts", "conclusions.ts"]) {
    const src = readFileSync(join(ROOT, "app/_phases/_shared/notebook", file), "utf8");
    expect(
      /recalibrate\/route\.ts[^\n]*\n?[^\n]*does not/.test(src),
      `${file} claims the recalibrate route does not send conclusions - it does`,
    ).toBe(false);
  }
});

test("cards: the steel-man is the only card the board may not descope", () => {
  // `CounterPosition`'s note claimed the counter-position "carries the one card
  // the board may not descope". No such card exists: buildCards flattens facts,
  // mechanisms, reversals, conclusions and the steel-man, and counter-positions
  // are not among them. Both halves are pinned, because the sentence was wrong
  // in both directions - it named a card class that is absent AND it moved the
  // required mark off the card that actually carries it.
  const cards = buildCards(NOTEBOOK);
  const required = cards.filter((c) => c.required);
  console.log(`[cards] ${cards.length} cards, ${required.length} required: ${required.map((c) => c.id).join(", ")}`);
  expect(required.map((c) => c.id)).toEqual(["steel-man"]);
  expect(required[0].requiredWhy, "the required card must say why it is required").toBeTruthy();

  // No card is derived from a counter-position, however the field is spelled.
  const positions = (NOTEBOOK.counterPositions as readonly (string | { position: string })[]).map(
    (c) => (typeof c === "string" ? c : c.position),
  );
  expect(positions.length, "the fixture carries counter-positions").toBeGreaterThan(0);
  for (const p of positions)
    expect(
      cards.some((c) => c.title === p),
      "a counter-position now has a card - the note in types.ts saying it has none is stale",
    ).toBe(false);
});

/* ── 2 · the load-side race guard: every hand-rolled site is named ──────────── */

/**
 * Call sites that keep their own `let alive = true` guard instead of
 * `useLoadFor`, each with the reason it does.
 *
 * `useLoadFor.ts`'s header names three of them and says why: "A primitive whose
 * adoption has to be argued site by site is doing its job." The argument is
 * right and the LIST was not — measured 2026-09-06, eight files carry the shape
 * and the header named three. The five it did not name are the ones where the
 * reasoning was, in that header's own words, "rediscovered and retyped", which
 * is the failure the file exists to stop.
 *
 * An entry here is a claim somebody defends in review. A NEW file carrying the
 * shape and no entry is the finding.
 */
const OWN_LOAD_GUARD: Record<string, string> = {
  "app/_phases/script/trailer/useTrailerCut.ts":
    "named in useLoadFor.ts's header: a branching two-stage load (the saved cut, else compose from confirmed picks) with two distinct guard points. Flattening it would hide the branch that is the whole logic of the hook.",
  "app/_phases/script/useVersions.ts":
    "named in useLoadFor.ts's header: carries an AbortController too, because it can cancel a model turn in flight rather than merely ignore its answer. Ignoring a result and cancelling the work that produces it cost different money.",
  "app/_phases/frames/useFrames.ts":
    "named in useLoadFor.ts's header: separates a read failure from an operation failure into two fields a surface renders differently, and gates its save on both.",
  "app/_phases/research/ResearchStep.tsx":
    "loads the project record rather than a step record, and applies it across three pieces of local state; useStepFor's single-apply shape does not fit and useLoadFor alone would buy only the flag.",
  "app/_phases/script/ScriptStep.tsx":
    "two loads in one component against different keys, one of them the project record; the same reason as ResearchStep.tsx above.",
  "app/_phases/frames/alternatives/useAlternatives.ts":
    "guards an imaging call, not a store read — the result is a paid generation and the guard is about not applying it, which useLoadFor's read-shaped signature does not describe.",
  "app/_projects/ProjectDialog.tsx":
    "a dialog's own open/close lifecycle rather than a keyed load; the key here is the dialog being open, not a project id.",
  "app/studio/[projectId]/StudioView.tsx":
    "the shell's project load, above every step and outside the step store entirely.",
};

/** Files carrying a hand-rolled `let alive = true` guard, walked off the tree. */
function ownGuardSites(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
        const src = stripComments(readFileSync(full, "utf8"));
        if (/let alive = true/.test(src)) out.push(relative(ROOT, full).split("\\").join("/"));
      }
    }
  };
  for (const top of ["app", "lib", "components"]) walk(join(ROOT, top));
  return out.sort();
}

test("load guard: every hand-rolled `alive` site is the primitive itself or a named exemption", () => {
  const sites = ownGuardSites();
  // A walk that reads nothing reports "all adopted" in a voice
  // indistinguishable from success.
  expect(sites.length, "the source walk found nothing - it is reading the wrong tree").toBeGreaterThan(3);

  const PRIMITIVE = "app/_phases/_shared/useLoadFor.ts";
  const unexplained = sites.filter((f) => f !== PRIMITIVE && !OWN_LOAD_GUARD[f]);
  console.log(`[load] ${sites.length} file(s) carry the shape; ${Object.keys(OWN_LOAD_GUARD).length} named exemptions`);
  expect(
    unexplained,
    "these keep their own load guard and no entry says why — adopt useLoadFor/useStepFor, or add the argument to OWN_LOAD_GUARD",
  ).toEqual([]);
  // The primitive is where the shape belongs, so its absence means the walk
  // stopped seeing the shape at all.
  expect(sites, "useLoadFor.ts no longer implements the guard - this matcher is dead").toContain(PRIMITIVE);
});

test("load guard: every exemption still names a file that carries the shape", () => {
  const sites = new Set(ownGuardSites());
  for (const [file, why] of Object.entries(OWN_LOAD_GUARD)) {
    expect(why.length, `${file} is exempted with no reason`).toBeGreaterThan(40);
    expect(sites.has(file), `${file} no longer keeps its own guard - drop the exemption`).toBe(true);
  }
});

/* ── 3 · the connection this store owns is the connection it closes ─────────── */

/**
 * `openDb()` callers that do not close what they opened, each with its reason.
 *
 * stepStore.ts's `withStore` spends twenty lines on this rule: `openDb()` is
 * not cached, so every caller owns the handle it gets back and has to close it,
 * and each unclosed one keeps a live `onversionchange` handler that turns a
 * version bump into a close race. stepStore was "the fourteenth, and the only
 * one that did not".
 *
 * Measured 2026-09-06: twenty-one call sites, and a FIFTEENTH file that does
 * not close — the one below. It is listed rather than fixed here because it is
 * another context's file; the entry is what makes the debt visible and bounded,
 * and what makes a NEW unclosed caller fail.
 */
const UNCLOSED: Record<string, string> = {
  "lib/identityEviction.ts":
    "opens the database for the five-store eviction transaction (line ~260) and never closes it, so every sign-out and account switch leaks one connection with a live onversionchange handler — exactly the shape stepStore's withStore header describes. Out of this context's paths; the fix is a try/finally around the existing await, and it belongs to whoever owns lib/.",
};

/** Every file that opens a database connection, walked off the tree. */
function dbOpeners(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
        const src = stripComments(readFileSync(full, "utf8"));
        // The factory itself declares the rule; it is not a caller of it.
        if (/export async function openDb/.test(src)) continue;
        if (/await openDb\(\)/.test(src)) out.push(relative(ROOT, full).split("\\").join("/"));
      }
    }
  };
  for (const top of ["app", "lib", "components"]) walk(join(ROOT, top));
  return out.sort();
}

test("connections: every file that opens the database also closes it", () => {
  const openers = dbOpeners();
  expect(openers.length, "the source walk found no opener - it is reading the wrong tree").toBeGreaterThan(2);

  const leaking = openers.filter(
    (f) => !/db\??\.close\(\)/.test(stripComments(readFileSync(join(ROOT, f), "utf8"))),
  );
  console.log(`[db] ${openers.length} opener file(s); ${leaking.length} never close: ${leaking.join(", ") || "none"}`);

  const unexplained = leaking.filter((f) => !UNCLOSED[f]);
  expect(
    unexplained,
    "these open a connection and never close it - each one keeps a live onversionchange handler for the life of the tab",
  ).toEqual([]);
});

test("connections: every unclosed exemption still describes a file that leaks", () => {
  for (const [file, why] of Object.entries(UNCLOSED)) {
    expect(why.length, `${file} is exempted with no reason`).toBeGreaterThan(40);
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    expect(/await openDb\(\)/.test(src), `${file} no longer opens a connection - drop the exemption`).toBe(true);
    expect(
      /db\??\.close\(\)/.test(src),
      `${file} now closes its connection - drop the exemption rather than leaving it claiming a leak`,
    ).toBe(false);
  }
});
