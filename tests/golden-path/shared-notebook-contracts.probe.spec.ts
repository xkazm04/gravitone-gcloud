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

const ROOT = resolve(__dirname, "../..");

// The rail and evidence-log contracts (sections 1 and 4) retired with the v1 notebook body
// (Phase 4 wave D); the research part's Notebook editor draws its own part's notebook.

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
  //
  // The payload is built by lib/turns/assemble/recalibrate.ts since AIO-B (the
  // route calls it), so that is the file whose imports are read.
  const route = stripComments(readFileSync(join(ROOT, "lib/turns/assemble/recalibrate.ts"), "utf8"));
  // C1 closing stage: the conclusions are the BODY's (the dealt source's), never
  // the fixture's, so the assembler reads `body.conclusions` and imports no
  // fixture constant.
  expect(
    /import\s*\{[^}]*\bCONCLUSIONS\b[^}]*\}\s*from/.test(route),
    "the recalibrate assembler imports the fixture's CONCLUSIONS again - every notebook would be annotated with Bitcoin's",
  ).toBe(false);
  expect(
    /\bbody\.conclusions\b/.test(route),
    "the recalibrate assembler no longer reads the body's conclusions - the model would never see the notebook's c-* cards",
  ).toBe(true);
  expect(
    /\bconclusions\b/.test(route),
    "the recalibrate assembler no longer names conclusions in its payload",
  ).toBe(true);
  // Since AIO-A stage 2 the route hands the run to the `recalibrate` turn kind,
  // whose prepare step is where the assembler is called.
  expect(
    /\bRECALIBRATE_SPEC\b/.test(stripComments(readFileSync(join(ROOT, "app/api/recalibrate/route.ts"), "utf8"))),
    "the recalibrate route no longer runs the recalibrate turn kind",
  ).toBe(true);
  expect(
    /\bassembleRecalibrate\(/.test(stripComments(readFileSync(join(ROOT, "lib/turns/kinds/recalibrate.ts"), "utf8"))),
    "the recalibrate turn kind no longer builds its prompt through the assembler",
  ).toBe(true);

  // And neither note may go back to claiming otherwise. The prose is what a
  // reader acts on, so it is held to the same standard as the code.
  for (const file of ["types.ts", "conclusions.ts"]) {
    const src = readFileSync(join(ROOT, "lib/notebook", file), "utf8");
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

  // Counter-positions ARE cards since 2026-10-06 (counter-position-cards.probe
  // pins the contract); none of them may be the required one.
  const positions = (NOTEBOOK.counterPositions as readonly (string | { position: string })[]).map(
    (c) => (typeof c === "string" ? c : c.position),
  );
  expect(positions.length, "the fixture carries counter-positions").toBeGreaterThan(0);
  for (const p of positions) {
    const card = cards.find((c) => c.title === p);
    expect(card?.kind, "a counter-position has a card").toBe("counter");
    expect(card?.required, "a counter card is cuttable").toBeFalsy();
  }
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
// Eight exemptions retired with the v1 studio and shelf (Phase 4 wave D): useTrailerCut,
// useVersions, useFrames, ResearchStep, ScriptStep, ProjectDialog, StudioView, MusicVideoFrames.
const OWN_LOAD_GUARD: Record<string, string> = {
  "components/ui/shell/ShellPalette.tsx":
    "a fan-out on dialog open, not a keyed load: the project list and eight independent board counts each settle into their own slot of local state, and a failed source simply contributes no entry. The guard is the dialog being mounted, as in useBoard.ts.",
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
  // Four or more until the v1 studio retired (Phase 4 wave D); the primitive itself is the
  // one site that must always be seen, and the check below holds it.
  expect(sites.length, "the source walk found nothing - it is reading the wrong tree").toBeGreaterThanOrEqual(2);

  const PRIMITIVE = "lib/useLoadFor.ts";
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
 * Measured 2026-09-06: twenty-one call sites, and a FIFTEENTH file that did
 * not close: lib/identityEviction.ts, fixed 2026-10-06 and removed from this
 * map. EMPTY is the legitimate state; an entry is what makes a debt visible and
 * bounded, and what makes a NEW unclosed caller fail.
 */
const UNCLOSED: Record<string, string> = {};

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
