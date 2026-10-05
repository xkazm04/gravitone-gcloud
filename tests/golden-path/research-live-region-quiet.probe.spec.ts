// LANE: a live region announces state changes, not a clock.
//
// LiveResult's running card was role=status around <Elapsed> (re-renders every
// second) and RunStatus was aria-live around `running · Ns`. A reader heard the
// seconds for the whole run; the ending is the only thing worth announcing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function code(rel: string): string {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read as empty`).toBeGreaterThan(200);
  return src;
}

/** Index just past the matching close of the JSX element opened at `open`
 *  (a `<tag` position), counting same-tag nesting. */
function elementEnd(src: string, open: number): number {
  const tag = /^<(\w+)/.exec(src.slice(open))![1];
  const re = new RegExp("<" + tag + "(?![A-Za-z0-9])|</" + tag + ">", "g");
  re.lastIndex = open;
  let depth = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[0].startsWith("</")) depth--;
    else if (!/\/>$/.test(src.slice(m.index, src.indexOf(">", m.index) + 1))) depth++;
    if (depth === 0) return m.index + m[0].length;
  }
  return src.length;
}

test("LiveResult: <Elapsed> is aria-hidden and not inside a role=status element", () => {
  const src = code("app/_phases/research/run/LiveResult.tsx");
  const use = src.indexOf("<Elapsed since");
  expect(use, "no <Elapsed> use found").toBeGreaterThan(-1);
  // the element directly wrapping it carries aria-hidden
  const wrapOpen = src.lastIndexOf("<span", use);
  expect(wrapOpen).toBeGreaterThan(-1);
  expect(src.slice(wrapOpen, use)).toContain("aria-hidden");
  // no role="status" element encloses it
  for (const m of src.matchAll(/<(\w+)[^>]*role="status"/g)) {
    const end = elementEnd(src, m.index!);
    expect(use >= m.index! && use < end, "<Elapsed> sits inside a role=status element").toBe(false);
  }
});

test("RunStatus: the aria-live element never holds secs(); an aria-hidden sibling does", () => {
  const src = code("app/_phases/research/run/controls.tsx");
  const fn = src.slice(src.indexOf("export function RunStatus"));
  const live = fn.indexOf("aria-live");
  expect(live).toBeGreaterThan(-1);
  const open = fn.lastIndexOf("<span", live);
  const end = elementEnd(fn, open);
  const liveEl = fn.slice(open, end);
  // the outer testid span may wrap both, so measure the INNERMOST live element
  expect(liveEl).not.toMatch(/secs\(|elapsedMs|clock/);
  expect(fn).toMatch(/aria-hidden[^>]*>[^<]*\{[^}]*(clock|secs\()/);
  expect(fn).toContain('data-testid="run-status"');
});
