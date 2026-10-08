// LANE — NOTICE-ANNOUNCEMENT (static source probe).
//
// WHAT WAS WRONG. `Notice` put role="status" on the same element that holds its
// text, so a warning/info mounted with its text already inside a live region and
// announced nowhere (lib/announcer.tsx rule 1: a region must exist EMPTY and then
// be mutated). The notices that appear IN RESPONSE TO AN ACTION were silent to a
// screen reader, while role="status" sat uselessly on notices that are merely
// present on load.
//
// WHAT THIS ASSERTS. (1) Notice no longer carries role="status"; only error is a
// role (alert is announced on insertion). (2) Every `<Notice>` under app/ whose
// severity is not the literal error is EITHER opted into `announce` (routed
// through useAnnounce) OR counted in ON_LOAD with its reason.
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "../..");

/** Warning/info sites that are content present on load, not a response to an
 *  action: announcing them would be noise. file -> [count, reason]. */
const ON_LOAD: Record<string, [number, string]> = {
  "app/_phases/research/_parts/FollowUpQueue.tsx": [1, "results-are-not-here is a standing record mismatch, true on every visit"],
  "app/_phases/score/ads/AdsScore.tsx": [1, "capability absence, known when the step opens"],
  "app/_phases/score/ScoreSpotting.tsx": [1, "a music video has no spotting session: a fact of the project"],
  "app/_phases/script/ScriptStep.tsx": [1, "nothing to write here: a fact of the project"],
  "app/_phases/script/trailer/TrailerScript.tsx": [1, "stale spine is read from storage on open"],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** The attribute text of each `<Notice ...>` opening tag, brace/string aware. */
function noticeTags(src: string): string[] {
  const tags: string[] = [];
  const re = /<Notice(?=[\s>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let q = "";
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === "\\") i++;
        else if (c === q) q = "";
      } else if (c === '"' || c === "'" || (c === "`" && depth >= 0)) q = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(src.slice(start, i));
  }
  return tags;
}

test("Notice does not put role=status on pre-filled content, and announces through useAnnounce", () => {
  const src = stripComments(readFileSync(join(ROOT, "app/_phases/_shared/ui/Notice.tsx"), "utf8"));
  expect(src).not.toMatch(/["']status["']/);
  expect(src).toMatch(/role=\{severity === "error" \? "alert" : undefined\}/);
  expect(src).toMatch(/useAnnounce/);
});

test("every warning/info Notice is announced or declared on-load", () => {
  const files = walk(join(ROOT, "app"));
  expect(files.length).toBeGreaterThan(50);
  let seen = 0;
  let announced = 0;
  const onLoadSeen: Record<string, number> = {};
  const bad: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const src = stripComments(readFileSync(f, "utf8"));
    if (!/_shared\/ui\/Notice"/.test(src)) continue;
    for (const attrs of noticeTags(src)) {
      seen++;
      const isError = !/\bseverity=/.test(attrs) || /\bseverity="error"/.test(attrs);
      if (isError) continue;
      if (/\bannounce\b/.test(attrs)) {
        announced++;
        continue;
      }
      onLoadSeen[rel] = (onLoadSeen[rel] ?? 0) + 1;
    }
  }
  expect(seen, "walk found no <Notice>").toBeGreaterThan(15);
  for (const [rel, n] of Object.entries(onLoadSeen)) {
    const declared = ON_LOAD[rel]?.[0] ?? 0;
    if (n !== declared) bad.push(`${rel}: ${n} unannounced non-error Notice, ${declared} declared on-load`);
  }
  for (const rel of Object.keys(ON_LOAD)) if (!onLoadSeen[rel]) bad.push(`${rel}: declared on-load but none found`);
  expect(bad).toEqual([]);
  // cases announced of cases that should be (action-triggered sites)
  expect(announced).toBe(7);
});

test("kit Loading is not a pre-filled live region, and speaks through useAnnounce", () => {
  const src = stripComments(readFileSync(join(ROOT, "components/kit/Notice.tsx"), "utf8"));
  const loading = src.slice(src.indexOf("export function Loading"), src.indexOf("export function Command"));
  expect(loading.length).toBeGreaterThan(20);
  expect(loading).not.toMatch(/role=/);
  expect(loading).toMatch(/useAnnounce/);
  expect(loading).toMatch(/say\(/);
});
