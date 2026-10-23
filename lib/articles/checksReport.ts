// THE CHECK, REPORT AND RUN — the summary, and the one entry point that runs every check.
//
// Split out of checks.ts (the door) for the 200-line limit. summarize folds the
// items into one verdict per dimension and sorts failures first. runCheck reads
// one run directory, runs the static items, adds the critique item, and runs the
// rendered items unless rendering is switched off.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { critiqueCheckItem, readCritiqueDetail } from "./critique";
import { absent } from "./checksItems";
import { renderedItems } from "./checksRendered";
import { staticItems, trialItems } from "./checksStatic";
import type { ArticleRun, CheckDimension, CheckItem, CheckReport, Claim, Source } from "./types";
import { CHECK_DIMENSIONS } from "./types";

/* ── the report ────────────────────────────────────────────────────────────── */

export function summarize(items: CheckItem[], at: string, screenshots: string[]): CheckReport {
  const dimensions: CheckReport["dimensions"] = {};
  const notMeasured: CheckDimension[] = [];
  for (const d of CHECK_DIMENSIONS) {
    const measured = items.filter((i) => i.dimension === d && i.status !== "not-measured");
    if (!measured.length) notMeasured.push(d);
    else dimensions[d] = measured.some((i) => i.status === "fail") ? "fail" : "pass";
  }
  // failures first — the order the human gate reads them in
  const rank = { fail: 0, "not-measured": 1, pass: 2 } as const;
  const sorted = [...items].sort((a, b) => rank[a.status] - rank[b.status]);
  return { schema: "article-check/1", at, dimensions, notMeasured, items: sorted, screenshots };
}

async function readMaybe(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function walk(dir: string, rel = ""): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, child)));
    else out.push(child);
  }
  return out;
}

/** Check one run directory. `render: false` skips the browser (the static
 *  items still run); the rendered items are then `not-measured`. */
export async function runCheck(
  runDir: string,
  opts: { render?: boolean; now?: () => Date } = {},
): Promise<CheckReport> {
  const postDir = path.join(runDir, "post");
  const [html, md] = await Promise.all([readMaybe(path.join(postDir, "index.html")), readMaybe(path.join(postDir, "post.md"))]);
  const sources = JSON.parse((await readMaybe(path.join(runDir, "sources.json"))) ?? "[]") as Source[];
  const claims = JSON.parse((await readMaybe(path.join(runDir, "claims.json"))) ?? "[]") as Claim[];
  const postFiles = new Set(await walk(postDir));
  const figures: { name: string; svg: string }[] = [];
  for (const f of [...postFiles].filter((p) => /^figures\/[^/]+\.svg$/i.test(p)).sort()) {
    figures.push({ name: f.slice("figures/".length), svg: (await readMaybe(path.join(postDir, f))) ?? "" });
  }
  const items = staticItems({ html, md, sources, claims, figures, postFiles });
  // A run written around a trial opens on its own measurement (run.trial); a classic run
  // has no trial items at all, so its report is what it was before trials.
  const trial = (JSON.parse((await readMaybe(path.join(runDir, "run.json"))) ?? "{}") as Partial<ArticleRun>).trial;
  if (trial) items.push(...trialItems({ html, md, n: trial.n }));
  // The multi-model critique (scope amendment 1): quorum held in every round,
  // every blocker factual finding answered with a reason.
  items.push(critiqueCheckItem(await readCritiqueDetail(runDir)));
  let screenshots: string[] = [];
  if (html && opts.render !== false) {
    const r = await renderedItems(postDir, path.join(runDir, "check"));
    items.push(...r.items);
    screenshots = r.screenshots.map((s) => path.relative(runDir, s).split(path.sep).join("/"));
  } else {
    items.push(absent("medium-fidelity", "rendered", "Rendered measurements", html ? "rendering was switched off for this check" : "post/index.html is missing"));
  }
  return summarize(items, (opts.now ?? (() => new Date()))().toISOString(), screenshots);
}
