// Every browser-side `fetch` of a GATED route carries the access header.
//
// imaging-auth.probe proves the server side: every route under app/api calls a
// gate door or is deliberately public. This is the client half of the same
// rule. A gated route the client calls WITHOUT accessHeader() answers 401 the
// moment IMAGING_ACCESS_SECRET is set — and Script's recalibrate turned that
// 401 into a silently staged "Simulated instead" candidate (2026-10-05,
// app/_phases/script/useVersions.ts). Nothing failed loudly, so nothing caught it.
//
// Population: every literal `fetch("/api/…")` in tracked client source, derived
// from git, comments stripped. "Gated" is read off the route file itself (the
// three doors imaging-auth names), never off a list kept here.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const ROOT = process.cwd();
const DOORS = [/\bguardRequest\s*\(/, /\bguardAccessOnly\s*\(/, /\bcheckAccess\s*\(/];

interface Site {
  at: string;
  url: string;
  args: string;
}

function sites(): Site[] {
  const files = execFileSync("git", ["ls-files", "app", "components", "lib"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => /\.tsx?$/.test(f) && !f.startsWith("app/api/"));
  const out: Site[] = [];
  for (const f of files) {
    if (!existsSync(path.join(ROOT, f))) continue;
    const src = stripComments(readFileSync(path.join(ROOT, f), "utf8"));
    for (const m of src.matchAll(/\bfetch\(\s*([`"'])(\/api\/[^`"'?]*)/g)) {
      // The argument list, up to the paren that closes this call.
      let depth = 1;
      let j = m.index! + m[0].indexOf("(") + 1;
      const start = j;
      while (depth > 0 && j < src.length) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") depth--;
        j++;
      }
      out.push({ at: `${f}:${src.slice(0, m.index).split("\n").length}`, url: m[2], args: src.slice(start, j - 1) });
    }
  }
  return out;
}

/** app/api/<segments>/route.ts for a URL, `[param]` directories matching any segment. */
function routeFile(url: string): string | null {
  const segs = url.replace(/\$\{.*$/, "").replace(/\/+$/, "").split("/").filter(Boolean).slice(1);
  let dir = path.join(ROOT, "app", "api");
  for (const s of segs) {
    if (existsSync(path.join(dir, s))) {
      dir = path.join(dir, s);
      continue;
    }
    const dyn = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name));
    if (!dyn) return null;
    dir = path.join(dir, dyn.name);
  }
  const f = path.join(dir, "route.ts");
  return existsSync(f) ? f : null;
}

const gated = (file: string) => {
  const src = stripComments(readFileSync(file, "utf8"));
  return DOORS.some((d) => d.test(src));
};

test("the walk finds the client's literal /api fetches (a silent miss is not a pass)", () => {
  expect(sites().length).toBeGreaterThanOrEqual(5);
});

test("every literal client fetch resolves to a route file", () => {
  const unresolved = sites().filter((s) => routeFile(s.url) === null).map((s) => `${s.at} ${s.url}`);
  expect(unresolved).toEqual([]);
});

test("every client fetch of a gated route sends accessHeader()", () => {
  const missing = sites()
    .filter((s) => {
      const f = routeFile(s.url);
      return f !== null && gated(f) && !/\baccessHeader\s*\(/.test(s.args);
    })
    .map((s) => `${s.at} ${s.url}`);
  expect(missing).toEqual([]);
});
