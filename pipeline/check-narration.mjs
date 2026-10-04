// THE NARRATION RATCHET — the app does not explain itself, and this proves it.
//
// THE LAW (components/ui/signal/README.md carries it in full):
//
//   Delete every sentence whose subject is the app.
//   Keep every sentence whose subject is the work.
//
// On 2026-09-08 a seven-lane refactor removed ~170 places where a component was
// accompanied by a sentence explaining what the component already showed. That
// pass is finished. This file exists because the pass is not the point — the
// point is that it does not come back, and this repo has already written down
// why that needs a gate rather than a note: "a floor that is not enforced is a
// suggestion" (pipeline/check-type-scale.mjs).
//
// TWO CHECKS, and they guard the two ways narration returns.
//
// ── 1. THE TOOLTIP RATCHET ─────────────────────────────────────────────────
//
// The failure mode of a deletion pass is RELOCATION. Every one of the five
// route audits, independently, proposed "move that sentence to `title=`" — and
// a paragraph moved into a tooltip is a paragraph that survived, one click
// further from the reader, in the one channel that is slow, untouchable, and
// unstyleable.
//
// So the count of long native `title=` attributes is a ratchet. It was 10
// before the refactor and 6 after, and 6 is the number this file holds. Native
// `title` is not banned — a filename, a timestamp, a verb is exactly what it is
// for. What is banned is it growing back into a prose channel.
//
// If you need a real disclosure, use <Hint> (components/ui/signal): it opens on
// hover, focus AND tap, is keyboard reachable, and is wired by
// aria-describedby. That is the door. This gate is the wall beside it.
//
// ── 2. THE TWELVE-WORD RULE ────────────────────────────────────────────────
//
// <Hint> is the most useful and the most dangerous primitive in the vocabulary,
// for the same reason: it will hold anything you put in it. The README states
// the limit, and a limit in a README is a suggestion, so here it is as a check.
//
//   If a disclosure runs past ~12 words it is almost certainly still the app
//   narrating itself. Delete it instead.
//
// Only LITERAL children are checked. A <Hint>{someVariable}</Hint> is invisible
// here and always will be — this gate cannot read a runtime value, and it does
// not pretend to. It catches the case that actually happens: a developer with a
// paragraph in hand, looking for somewhere to put it.
//
// WHAT THIS GATE CANNOT DO, stated plainly so nobody mistakes green for good:
// it cannot tell whether a sentence's subject is the app or the work. That
// judgement is human, it is the whole law, and no regex will ever hold it. This
// file guards the two mechanical channels narration escapes through. The law
// itself is enforced by reading the diff.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Native `title=` at or over this many characters counts as prose, not a label. */
const TITLE_PROSE_CHARS = 45;

/**
 * The ratchet. Measured 2026-09-08 at commit eb51740, after the narration
 * refactor. LOWER IT when you remove one; never raise it without saying, in the
 * commit message, which sentence earned the exemption and why <Hint> was wrong
 * for it.
 */
const TITLE_BUDGET = 6;

/**
 * Words allowed inside a <Hint>. The README's number.
 *
 * IT IS A RATCHET, NOT A WALL, and the difference was measured rather than
 * assumed. Run against the tree the day this file was written, a hard 12 failed
 * seven disclosures — and reading them, only one was narration:
 *
 *   "from each render's own beat marks · a shared beat splits its seconds ·
 *    unattributed is hook, promise and close"            (20 words, methodology)
 *
 * The other six were the WORK at its natural length: which cards are queued,
 * which fields are the fixture's stand-in, why a limit was lifted, that the
 * gate reads a narrow lexical band. Twelve is the right aspiration and the
 * wrong wall — a disclosure naming three real things costs fourteen words, and
 * a gate that forces those into a lie is worse than no gate.
 *
 * So: the number below is the law, the BUDGET is today's debt against it, and
 * the budget may only ever fall. Raising the number to make a build green is
 * the one move this file exists to prevent — that is how the type-scale floor
 * would have died too.
 */
const HINT_MAX_WORDS = 12;

/**
 * How many <Hint> bodies currently exceed HINT_MAX_WORDS. Measured 2026-09-08.
 * LOWER IT when you tighten one. Raising it needs a sentence in the commit
 * message saying which disclosure earned the room and why deleting it was worse.
 */
const HINT_OVER_BUDGET = 7;

/**
 * The wall, as opposed to the ratchet. Past this a disclosure is not a long
 * label, it is a paragraph wearing a glyph, and no budget covers it.
 */
const HINT_HARD_CAP = 25;

/**
 * `<Hint>` bodies that are deliberately over the limit, each with the reason.
 * A named exemption is a decision somebody made; an unnamed one is drift.
 */
const HINT_EXEMPT = [
  // <Keycaps> renders its rows inside a Hint. A keymap is a table, not prose:
  // every row is a key and a verb, there is nothing in it to delete, and its
  // length is a function of how many keys the surface binds. The README names
  // this as the one deliberate exemption.
  "components/ui/signal/Keycaps.tsx",
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".tsx")) yield p;
  }
}

const BLOCK = /\/\*[\s\S]*?\*\//g;
const LINE = /^[ \t]*\/\/.*$/gm;

/** Comments quote the copy they removed on purpose; an un-stripped scan reads
 *  that as the defect still shipping. */
const strip = (s) => s.replace(BLOCK, " ").replace(LINE, " ");

const files = [];
for (const dir of ["app", "components"]) {
  const d = path.join(ROOT, dir);
  if (fs.existsSync(d)) files.push(...walk(d));
}

const titles = [];
const hints = [];

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (rel.includes("/api/")) continue;
  const src = strip(fs.readFileSync(abs, "utf8"));

  for (const m of src.matchAll(/title="([^"]+)"/g)) {
    if (m[1].length >= TITLE_PROSE_CHARS) titles.push({ rel, text: m[1] });
  }

  if (HINT_EXEMPT.includes(rel)) continue;
  // Literal-only children, single line or wrapped. A `{expr}` child stops the
  // match, which is intended — see the header.
  for (const m of src.matchAll(/<Hint\b[^>]*>([^<>{}]+)<\/Hint>/g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    const words = text ? text.split(" ").length : 0;
    if (words > HINT_MAX_WORDS) hints.push({ rel, text, words });
  }
}

let failed = false;

if (titles.length > TITLE_BUDGET) {
  failed = true;
  console.error(
    `\nnarration: ${titles.length} native title= of ${TITLE_PROSE_CHARS}+ chars, budget is ${TITLE_BUDGET}.`,
  );
  console.error(
    "A paragraph moved into a tooltip is a paragraph that survived. Use <Hint>",
  );
  console.error("(components/ui/signal) for a real disclosure, or delete it.\n");
  for (const t of titles) console.error(`  ${t.rel}\n      ${t.text.slice(0, 110)}`);
} else if (titles.length < TITLE_BUDGET) {
  console.log(
    `narration: ${titles.length} long title= — under the budget of ${TITLE_BUDGET}. ` +
      `Lower TITLE_BUDGET in ${path.basename(import.meta.filename)} to hold the ground.`,
  );
}

const overCap = hints.filter((h) => h.words > HINT_HARD_CAP);
if (overCap.length) {
  failed = true;
  console.error(
    `\nnarration: ${overCap.length} <Hint> over the hard cap of ${HINT_HARD_CAP} words.`,
  );
  console.error(
    "That is not a long label, it is a paragraph wearing a glyph. No budget",
  );
  console.error("covers it — delete it, or say it with a shape.\n");
  for (const h of overCap) {
    console.error(`  ${h.rel}  (${h.words} words)\n      ${h.text.slice(0, 110)}`);
  }
}

if (hints.length > HINT_OVER_BUDGET) {
  failed = true;
  console.error(
    `\nnarration: ${hints.length} <Hint> over ${HINT_MAX_WORDS} words, budget is ${HINT_OVER_BUDGET}.`,
  );
  console.error(
    "Past twelve words a disclosure is usually still the app narrating itself.",
  );
  console.error(
    `Delete it, tighten it, or lower another one to pay for it. Raising`,
  );
  console.error(
    `HINT_OVER_BUDGET needs a reason in the commit message.\n`,
  );
  for (const h of hints) {
    console.error(`  ${h.rel}  (${h.words} words)\n      ${h.text.slice(0, 110)}`);
  }
} else if (hints.length < HINT_OVER_BUDGET) {
  console.log(
    `narration: ${hints.length} <Hint> over ${HINT_MAX_WORDS} words — under the ` +
      `budget of ${HINT_OVER_BUDGET}. Lower HINT_OVER_BUDGET to hold the ground.`,
  );
}

if (failed) {
  console.error("");
  process.exit(1);
}

console.log(
  `narration OK — ${titles.length}/${TITLE_BUDGET} long title=, ` +
    `${hints.length}/${HINT_OVER_BUDGET} <Hint> over ${HINT_MAX_WORDS} words, ` +
    `none over the ${HINT_HARD_CAP}-word cap.`,
);
