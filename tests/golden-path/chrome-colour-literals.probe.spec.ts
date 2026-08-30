// LANE — THE COLOUR-LITERAL RULE, RECHECKED BY A MACHINE (dynamic).
//
// Registry: software-engineering / design-tokens / token-enforcement.
//
// `components/ui/tokens.ts` states the rule and, unusually, states how to
// recheck it: "grep app/ and components/ for hex and rgb() literals, subtract
// this file and the four classes above, and the remainder should be empty."
//
// Nothing ran that grep. The file's own history is the argument for this probe:
// the rule "was NOT [empty], from 2026-08-14 until this line was written" —
// roughly a fortnight in which the inventory said "three things" while
// app/global-error.tsx carried seven literals, "which made the rule read as
// broken by a file that was obeying a different one". A recheckable rule nobody
// rechecks drifts silently and then costs a reader their trust in the rule.
//
// Measured 2026-08-29, before this file existed: 186 source files under app/ and
// components/, 4 exempt, 0 chrome colour literals outside tokens.ts. The
// codebase is compliant — this pins that, rather than repairing anything.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname } from "node:path";

import { test, expect } from "@playwright/test";

/** The four exemptions tokens.ts names, each with the reason it gives. An entry
 *  is a claim somebody defends in review — the same shape as
 *  object-url-ownership's KNOWN_LEAKS, and for the same reason: a silent
 *  exclusion list is how a gate stops meaning anything. */
const EXEMPT: Record<string, string> = {
  "components/ui/tokens.ts":
    "The declaring file. This is where chrome colour is allowed to be spelled.",
  "app/library/presets.ts":
    "STYLE-PRESET DATA — what a GENERATED IMAGE should look like. Prompt input shown to the user as a style's palette; content, not chrome.",
  "app/library/LibraryAtelier.tsx":
    "The same preset data, beside the presets it describes.",
  "app/global-error.tsx":
    "The App Router boundary that REPLACES the root layout, so <GravitoneTokens> never renders and a var(--gt-ink) there resolves to nothing. The one file that must not read tokens.ts.",
};

/** A CSS colour literal: 3, 4, 6 or 8 hex digits, or an rgb()/rgba() call.
 *
 *  The digit counts are enumerated rather than written `{3,8}`, which would
 *  also match five- and seven-digit runs that are not colours — an id or a
 *  fragment can produce those, and a gate that cries wolf on a non-colour is a
 *  gate somebody switches off. */
const LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|\brgba?\(/;

/** Comments stripped first: tokens.ts's own rule exempts PROSE explicitly ("a
 *  comment that records a measurement has to name the values it measured"), and
 *  a matcher over raw text would flag exactly the comments that document the
 *  rule. CSS has no `//` comments, so only block comments are stripped there. */
function code(src: string, css: boolean): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return css ? noBlocks : noBlocks.replace(/\/\/[^\n]*/g, "");
}

/** Walked off git rather than listed — a hand-written population describes the
 *  repo on the day it was typed, which is the failure mode this repo's own
 *  context-map gate documents at length. */
function chromeSources(): string[] {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/);
  return tracked.filter(
    (p) =>
      /^(app|components)\//.test(p) && [".ts", ".tsx", ".css"].includes(extname(p)),
  );
}

test("no file draws chrome from a colour literal, except the four that may", () => {
  const files = chromeSources();

  // A walk that reads nothing reports compliance in a voice indistinguishable
  // from success.
  expect(files.length, "the source walk found nothing — it is reading the wrong tree").toBeGreaterThan(100);

  // The exemptions must still exist, or the list is describing a repo that has
  // moved on and quietly excusing nothing.
  for (const p of Object.keys(EXEMPT))
    expect(files.includes(p), `${p} is exempted but is no longer a source file — drop it from EXEMPT`).toBe(true);

  const offenders: string[] = [];
  for (const p of files) {
    if (p in EXEMPT) continue;
    const src = code(readFileSync(p, "utf8"), p.endsWith(".css"));
    const hit = LITERAL.exec(src);
    if (hit) offenders.push(`${p} → ${hit[0]}`);
  }

  expect(
    offenders,
    "chrome colour must be declared in components/ui/tokens.ts and consumed as a --gt-* var or a Tailwind class. " +
      "If one of these is genuinely not chrome — preset data shown to the user, or a file that cannot read the tokens — " +
      "add it to EXEMPT here with the reason, the way tokens.ts's own inventory does.",
  ).toEqual([]);
});

test("the rule's own inventory is still what this probe enforces", () => {
  // tokens.ts is the spec. If its exemption list grows or shrinks and this file
  // does not follow, the gate is enforcing a rule the codebase no longer states
  // — which is the two-copies-of-one-rule failure the tokens file exists to end.
  // Flattened: the sentence this asserts is wrapped across comment lines, and a
  // matcher that cannot survive a re-wrap would fail on a reflow rather than on
  // a change of meaning.
  const spec = readFileSync("components/ui/tokens.ts", "utf8")
    .replace(/^\s*\/\/ ?/gm, "")
    .replace(/\s+/g, " ");
  for (const p of Object.keys(EXEMPT)) {
    if (p === "components/ui/tokens.ts") continue;
    const name = p.split("/").pop()!;
    expect(spec, `tokens.ts no longer names ${name} among its exemptions`).toContain(name);
  }
  expect(spec, "tokens.ts no longer describes the recheck this probe automates").toMatch(
    /grep app\/ and components\/ for hex and rgb\(\) literals/,
  );
});
