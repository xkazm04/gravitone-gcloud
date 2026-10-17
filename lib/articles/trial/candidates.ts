// WHICH SUBJECTS TO TRY: the registry's subjects ranked for a trial by currency, contest and
// relevance to this repo, instead of by coverage and alphabet (lib/articles/loop.ts
// `rankUncovered`, which classic runs keep). Server only.
//
// THE POOL. The bundles a reader of this blog cares about (loop.ts AUDIENCE_BUNDLES) and the
// bundles this repo consumes (`.ai/manifest.yaml` knowledge.domains), minus the standard's own
// bundle (EXCLUDED_BUNDLES: a trial of how to write posts, written as a post, is circular). A
// subject an unclosed trial holds, or a trial run that is working or at/after the gate, is
// CLAIMED: left out of the list and named in `claimed`.
//
// THE SCORE, validity first. A trial is worth its spend when its verdict can move something:
// the subject's claim may no longer hold, and a verdict on it changes code here.
//
//   score = 100 x min(contested, 3)          an application already measured the technique
//                                            losing (ab_verdict: not-better): the claim is in
//                                            open question, the strongest signal there is
//         +  30 x min(governsHere, 4)        contexts of THIS repo the subject governs
//                                            (.ai/registry-map.json): a verdict changes code
//                                            we run, and the trial's stack is ours
//         +  20 x min(atRisk, 3)             applications whose currency clock has run out or
//                                            runs out inside the horizon (check-currency.mjs
//                                            `expired` + `atRisk`): the registry itself says
//                                            the evidence is ageing
//         +  10 x log2(1 + volatile / 10)    dated outside facts, age-weighted (the subject's
//                                            documents' `--volatile` scores, summed): logged,
//                                            because one heavily numbered document should
//                                            lean on the rank, not own it. Measured 2026-10-18
//                                            over 506 subjects: median 18, p90 62, max 191,
//                                            so the term runs 0 to ~43
//         +  15 x min(ageDays / 365, 1)      time since the subject last changed (index
//                                            `changedAt`); an unknown age earns nothing,
//                                            because an unknown is not a value
//
// The caps keep any one count from running away with the list: past three contested
// applications the question is already open, past four governed contexts the trial is already
// relevant. Relevance and moved facts together (max 120 + 60 + ~43 + 15) outweigh one contested
// verdict (100), and two contested verdicts outweigh everything else: the registry's own rule
// is that two not-better results from different projects demote a technique. `revision` is
// reported and not scored: an often-revised subject may be churning or well kept, and the count
// says neither. Rounded to one decimal, ties by bundle then slug, so two calls over the same
// registry, map and day give the same list.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { AUDIENCE_BUNDLES, EXCLUDED_BUNDLES } from "../loop";
import { resolveRegistryDir, type RegistryLocation } from "../registryRead";
import { listRuns } from "../store";
import type { TrialCandidate } from "../types";

import { currencyReport, governsIndex, readApplications, scanTrials } from "./store";

export interface TrialCandidates {
  candidates: TrialCandidate[];
  /** Subject keys (`bundle/slug`) a trial or a trial run already holds. */
  claimed: string[];
}

export const SCORE_WEIGHTS = { contested: 100, governsHere: 30, atRisk: 20, volatile: 10, age: 15 } as const;

export function trialScore(s: { contested: number; governsHere: number; atRisk: number; volatile: number; ageDays?: number }): number {
  const v =
    SCORE_WEIGHTS.contested * Math.min(s.contested, 3) +
    SCORE_WEIGHTS.governsHere * Math.min(s.governsHere, 4) +
    SCORE_WEIGHTS.atRisk * Math.min(s.atRisk, 3) +
    SCORE_WEIGHTS.volatile * Math.log2(1 + Math.max(0, s.volatile) / 10) +
    SCORE_WEIGHTS.age * Math.min(Math.max(0, s.ageDays ?? 0) / 365, 1);
  return Math.round(v * 10) / 10;
}

/** `knowledge.domains` out of .ai/manifest.yaml, inline (`[a, b]`) or as a block list, without a
 *  YAML dependency (registryRead.ts reads `registry:` the same way; unknown fields are ignored). */
export function manifestKnowledgeDomains(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^knowledge:\s*(#.*)?$/.test(l));
  if (start < 0) return [];
  const unq = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    const inline = /^\s+domains:\s*\[(.*)\]\s*(#.*)?$/.exec(l);
    if (inline) return inline[1].split(",").map(unq).filter(Boolean);
    if (/^\s+domains:\s*(#.*)?$/.test(l)) {
      const out: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const m = /^\s+-\s*(.+?)\s*(#.*)?$/.exec(lines[j]);
        if (!m) break;
        out.push(unq(m[1]));
      }
      return out.filter(Boolean);
    }
  }
  return [];
}

async function trialBundles(root: string): Promise<string[]> {
  const yaml = await readFile(path.join(root, ".ai", "manifest.yaml"), "utf8").catch(() => "");
  const all = new Set([...AUDIENCE_BUNDLES, ...manifestKnowledgeDomains(yaml)]);
  for (const b of EXCLUDED_BUNDLES) all.delete(b);
  return [...all].sort();
}

/** `bundle/slug` -> {atRisk, volatile} from ONE run of the registry's currency check over the whole
 *  corpus. `--top` is raised past any corpus size: by default `volatile.top` keeps 25 documents,
 *  and a per-subject sum over a truncated list would score only the corpus's 25 loudest
 *  documents. Empty when the check cannot run: every subject then scores 0 on both. */
async function currencySignals(registryDir: string): Promise<Map<string, { atRisk: number; volatile: number }>> {
  const out = new Map<string, { atRisk: number; volatile: number }>();
  const raw = await currencyReport(registryDir, ["--volatile", "--top", "1000000"]);
  if (!raw) return out;
  const report = JSON.parse(raw) as {
    atRisk?: { id?: string }[];
    expired?: { id?: string }[];
    volatile?: { top?: { domain?: string; subject?: string; score?: number }[] };
  };
  const bump = (key: string, f: "atRisk" | "volatile", by: number) => {
    const row = out.get(key) ?? { atRisk: 0, volatile: 0 };
    row[f] += by;
    out.set(key, row);
  };
  // Application ids are `<bundle>/<subject>/<file>` (check-currency.mjs), by slug, never by path.
  for (const a of [...(report.expired ?? []), ...(report.atRisk ?? [])]) {
    const [bundle, subject] = (a.id ?? "").split("/");
    if (bundle && subject) bump(`${bundle}/${subject}`, "atRisk", 1);
  }
  for (const r of report.volatile?.top ?? []) {
    if (r.domain && r.subject && typeof r.score === "number" && Number.isFinite(r.score)) bump(`${r.domain}/${r.subject}`, "volatile", r.score);
  }
  return out;
}

/** Subjects already held: an unclosed trial, or a trial run working or at/after the gate. */
async function claimedSubjects(): Promise<Map<string, string>> {
  const held = new Map<string, string>();
  for (const t of (await scanTrials()).trials) if (t.status !== "closed") held.set(`${t.subject.bundle}/${t.subject.slug}`, t.id);
  for (const r of (await listRuns()).runs) {
    // Every status but these two is working (queued .. checking) or covering (COVERING_STATUSES).
    if (!r.trial || r.status === "failed" || r.status === "rejected") continue;
    if (r.topic.kind === "subject" && r.topic.bundle && r.topic.subject) held.set(`${r.topic.bundle}/${r.topic.subject}`, r.id);
  }
  return held;
}

const DAY_MS = 86_400_000;
function ageDays(changedAt: string | undefined, now: Date): number | undefined {
  if (!changedAt || !/^\d{4}-\d{2}-\d{2}$/.test(changedAt)) return undefined;
  const then = Date.parse(`${changedAt}T00:00:00Z`);
  if (!Number.isFinite(then)) return undefined;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((today - then) / DAY_MS));
}

/** The golden path's first `# ` heading, after its frontmatter; the slug when there is none. */
async function titleOf(registryDir: string, file: string, slug: string): Promise<string> {
  try {
    const text = (await readFile(path.join(registryDir, file), "utf8")).replace(/\r\n/g, "\n");
    const h1 = /^#\s+(.+)$/m.exec(text.replace(/^\uFEFF?---[\s\S]*?\n---\n/, ""));
    return h1?.[1].trim() || slug.replace(/-/g, " ");
  } catch {
    return slug.replace(/-/g, " ");
  }
}

interface IndexRow {
  file?: string;
  revision?: number;
  changedAt?: string;
}

export async function rankTrialCandidates(
  opts: { limit?: number; registry?: RegistryLocation; root?: string; now?: Date } = {},
): Promise<TrialCandidates> {
  const root = opts.root ?? process.cwd();
  const registry = opts.registry ?? resolveRegistryDir(process.env, root);
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? 10), 50));
  const [bundles, signals, governs, held] = await Promise.all([trialBundles(root), currencySignals(registry.dir), governsIndex(root), claimedSubjects()]);

  const score = async (bundle: string, slug: string, row: IndexRow): Promise<Omit<TrialCandidate, "title">> => {
    const file = row.file!.replace(/\\/g, "/");
    const apps = await readApplications(registry.dir, file.slice(0, file.lastIndexOf("/")));
    const sig = signals.get(`${bundle}/${slug}`) ?? { atRisk: 0, volatile: 0 };
    const c = {
      bundle,
      slug,
      file,
      ...(typeof row.revision === "number" ? { revision: row.revision } : {}),
      ...(typeof row.changedAt === "string" ? { changedAt: row.changedAt } : {}),
      governsHere: governs(slug).length,
      contested: apps.filter((a) => a.ab_verdict === "not-better").length,
      atRisk: sig.atRisk,
      volatile: Math.round(sig.volatile * 10) / 10,
    };
    return { ...c, score: trialScore({ ...c, ageDays: ageDays(row.changedAt, now) }) };
  };

  const scored: Omit<TrialCandidate, "title">[] = [];
  for (const bundle of bundles) {
    let subjects: Record<string, IndexRow>;
    try {
      subjects = (JSON.parse(await readFile(path.join(registry.dir, "knowledge", bundle, "index.json"), "utf8")) as { subjects?: Record<string, IndexRow> }).subjects ?? {};
    } catch {
      continue; // a bundle this registry does not carry is not a candidate pool
    }
    const rows = Object.entries(subjects).filter(([slug, row]) => typeof row?.file === "string" && !held.has(`${bundle}/${slug}`));
    // Sixteen subjects at a time: each reads every one of its application files, and a bundle
    // of 235 subjects read at once is ~1,300 open files.
    for (let i = 0; i < rows.length; i += 16) {
      scored.push(...(await Promise.all(rows.slice(i, i + 16).map(([slug, row]) => score(bundle, slug, row)))));
    }
  }
  scored.sort((a, b) => b.score - a.score || a.bundle.localeCompare(b.bundle) || a.slug.localeCompare(b.slug));
  const candidates: TrialCandidate[] = [];
  for (const c of scored.slice(0, limit)) candidates.push({ ...c, title: await titleOf(registry.dir, c.file, c.slug) });
  return { candidates, claimed: [...held.keys()].sort() };
}
