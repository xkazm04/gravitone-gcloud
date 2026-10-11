// Ingesting the agent's research and outline, and the validators for sources and claims.
// Its own file because these are the first reads of the agent's out/ and the validators
// the critique's research reuses.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readTextFile, writeFileAtomic, writeJsonAtomic } from "./store";
import type { Claim, Source } from "./types";

/* ── ingestion: the agent's out/ is untrusted input ────────────────────────── */

export async function readOutJson<T>(file: string, what: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`the agent did not write ${what}`);
  }
  try {
    return JSON.parse(raw.replace(/^﻿/, "")) as T;
  } catch (e) {
    throw new Error(`${what} is not valid JSON (${(e as Error).message})`);
  }
}

export function validateSources(raw: unknown): Source[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("sources.json must be a non-empty array");
  const seen = new Set<number>();
  const problems: string[] = [];
  const out: Source[] = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const n = Number(o.n);
    if (!Number.isInteger(n) || n < 1) problems.push(`entry ${i + 1}: n is not a positive integer`);
    else if (seen.has(n)) problems.push(`entry ${i + 1}: n ${n} repeats`);
    seen.add(n);
    for (const k of ["url", "title", "publisher", "date", "took"]) if (typeof o[k] !== "string" || !(o[k] as string).trim()) problems.push(`[${n}] has no ${k}`);
    return {
      n,
      url: String(o.url ?? "").trim(),
      title: String(o.title ?? "").trim(),
      publisher: String(o.publisher ?? "").trim(),
      date: String(o.date ?? "").trim(),
      primary: o.primary === true,
      counter: o.counter === true,
      took: String(o.took ?? "").trim(),
    };
  });
  if (problems.length) throw new Error(`sources.json: ${problems.slice(0, 8).join("; ")}`);
  return out.sort((a, b) => a.n - b.n);
}

export function validateClaims(raw: unknown, sources: Source[]): Claim[] {
  if (!Array.isArray(raw)) throw new Error("claims.json must be an array");
  const nums = new Set(sources.map((s) => s.n));
  const problems: string[] = [];
  const out = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const source = Number(o.source);
    if (typeof o.text !== "string" || !o.text.trim()) problems.push(`claim ${i + 1} has no text`);
    if (!nums.has(source)) problems.push(`claim ${i + 1} cites [${String(o.source)}], which is not a source`);
    return { text: String(o.text ?? "").trim(), source };
  });
  if (problems.length) throw new Error(`claims.json: ${problems.slice(0, 8).join("; ")}`);
  return out;
}

export async function ingestResearch(ws: string, dir: string): Promise<void> {
  const sources = validateSources(await readOutJson(path.join(ws, "out", "sources.json"), "out/sources.json"));
  const claims = validateClaims(await readOutJson(path.join(ws, "out", "claims.json"), "out/claims.json"), sources);
  await writeJsonAtomic(path.join(dir, "sources.json"), sources);
  await writeJsonAtomic(path.join(dir, "claims.json"), claims);
}

export async function ingestOutline(ws: string, dir: string): Promise<void> {
  const md = (await readTextFile(path.join(ws, "out", "outline.md")))?.trim();
  if (!md) throw new Error("the agent did not write out/outline.md");
  if (!/^##\s+\S/m.test(md)) throw new Error("out/outline.md has no sections");
  await writeFileAtomic(path.join(dir, "outline.md"), `${md.replace(/\r\n/g, "\n")}\n`);
}
