import { z } from "zod";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { ProducerRunInput } from "@gt/domain/produce";
import { dojoRunOf } from "@gt/producers/dojo/plan";
import { forgeRunOf } from "@gt/producers/forge/plan";

import { readdir } from "node:fs/promises";
import path from "node:path";

import { readJsonFile, RUN_ID_RE } from "@/lib/articles/store";
import { articlesRoot } from "@/lib/ledger/v1/sources/articles";
import { getExtractRun, listExtractRuns } from "@/lib/foundry/extract/store";
import { getRun, listRuns as listForgeRuns } from "@/lib/foundry/store";
import { listManifests } from "@/lib/foundry/runStore";
import { stripsRoot } from "@/lib/foundry/strips/store";
import { getCycle, listCycles } from "@/lib/foundry/training/store";
import { readMv } from "@/lib/sound/mv/store";
import { readSuno } from "@/lib/sound/suno/store";

import type { V1Run, V1RunState } from "./runs.ts";

// THE v1 STORES THE RUNS IMPORTER READS (Phase 4 wave D, L42) - each through v1's OWN reader
// (the same ones the Phase 2 ledger adapters read, lib/ledger/v1/sources/*), with only the fields
// a Run row needs parsed at a door: a record that drifted from them is reported, never guessed.
// The status vocabularies are v1's, mapped once each:
//   forge     done | incomplete | committed -> done; failed -> failed; the rest is working
//   extract   done | committed -> done; failed -> failed; the rest is working
//   dojo      awaiting-gate | committed -> done (its gate is a Board packet); failed -> failed
//   strips    awaiting-triage | committed -> done; running -> working (v1 never marks a crash)
//   article   awaiting-approval | approved... | landed | rejected -> done; failed -> failed
//   mv, suno  done -> done; failed | cancelled -> failed; queued | active -> working
// The run input is each producer's own (@gt/domain/produce `ProducerRunInput`), built as its
// producer builds it: extract's after lib/producers/extract.ts `extractInput` (a v1 `transfers`
// of 0 is absent), mv's and suno's after lib/producers/sound.ts `runInputOf`.

export type SourceName = "forge" | "extract" | "dojo" | "strips" | "article" | "mv" | "suno";
export const SOURCE_NAMES: readonly SourceName[] = ["forge", "extract", "dojo", "strips", "article", "mv", "suno"];

export type Listed = { readonly runs: readonly V1Run[]; readonly unread: readonly string[] };

const job = (x: { job?: string | undefined }) => (x.job === undefined ? {} : { job: x.job });
const errorOf = (x: { error?: string | undefined }) => (x.error === undefined ? {} : { error: x.error });
const msIso = (ms: number): string => new Date(ms).toISOString();

const forgeSchema = z.object({ id: z.string().min(1), created: z.string(), status: z.string(), plan: z.object({ id: z.string().min(1) }), candidates: z.array(z.unknown()), error: z.string().optional(), job: z.string().optional() });
const extractSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  created: z.string(),
  status: z.string(),
  sources: z.array(z.unknown()),
  options: z.object({ rounds: z.number().int().positive(), replicas: z.number().int().positive(), transfers: z.number().int().nonnegative(), grouping: z.enum(["engine", "none"]).default("engine") }),
  error: z.string().optional(),
  job: z.string().optional(),
});
const cycleSchema = z.object({ id: z.string().min(1), at: z.string(), status: z.string(), improvements: z.array(z.unknown()) });
const stripsSchema = z.object({ id: z.string().min(1), at: z.string(), status: z.enum(["running", "awaiting-triage", "committed"]), cards: z.array(z.object({ lane: z.enum(["edu", "stat"]) })), error: z.string().optional(), job: z.string().optional(), dry: z.boolean().optional() });
const articleSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  createdAt: z.string(),
  topic: z.object({ kind: z.enum(["subject", "free"]), bundle: z.string().optional(), subject: z.string().optional(), text: z.string(), angle: z.string().optional() }),
  error: z.string().optional(),
});
const soundJobSchema = z.object({ id: z.string().min(1), state: z.enum(["queued", "active", "done", "failed", "cancelled"]), enqueuedAt: z.number(), error: z.string().optional(), job: z.string().optional() });

const stateOf = (status: string, done: readonly string[], failed: readonly string[]): V1RunState => (done.includes(status) ? "done" : failed.includes(status) ? "failed" : "live");

type Collect = { runs: V1Run[]; unread: string[] };

function take<S extends z.ZodType>(c: Collect, source: string, id: string, schema: S, raw: unknown, map: (x: z.output<S>) => V1Run): void {
  const p = schema.safeParse(raw);
  if (!p.success) c.unread.push(`${source} ${id}: ${p.error.issues[0]?.path.join(".") ?? ""} ${p.error.issues[0]?.message ?? "unreadable"}`.trim());
  else c.runs.push(map(p.data));
}

async function forge(c: Collect): Promise<void> {
  for (const s of await listForgeRuns()) {
    let raw: unknown;
    try {
      raw = (await getRun(s.id)).run;
    } catch (e) {
      c.unread.push(`forge ${s.id}: ${errorMessage(e)}`);
      continue;
    }
    take(c, "forge", s.id, forgeSchema, raw, (m) => ({ source: "forge", runId: forgeRunOf(m.id), input: { producer: "forge", plan: m.plan.id }, units: Math.max(1, m.candidates.length), at: m.created, state: stateOf(m.status, ["done", "incomplete", "committed"], ["failed"]), ...errorOf(m), ...job(m) }));
  }
}

async function extract(c: Collect): Promise<void> {
  for (const s of await listExtractRuns()) {
    let raw: unknown;
    try {
      raw = (await getExtractRun(s.id)).run;
    } catch (e) {
      c.unread.push(`extract ${s.id}: ${errorMessage(e)}`);
      continue;
    }
    take(c, "extract", s.id, extractSchema, raw, (m) => {
      const input: ProducerRunInput = { producer: "extract", slug: m.slug, sources: Math.max(1, m.sources.length), rounds: m.options.rounds, replicas: m.options.replicas, ...(m.options.transfers > 0 ? { transfers: m.options.transfers } : {}), grouping: m.options.grouping };
      return { source: "extract", runId: m.id, input, at: m.created, state: stateOf(m.status, ["done", "committed"], ["failed"]), ...errorOf(m), ...job(m) };
    });
  }
}

async function dojo(c: Collect): Promise<void> {
  for (const s of await listCycles()) {
    let raw: unknown;
    try {
      raw = (await getCycle(s.id)).cycle;
    } catch (e) {
      c.unread.push(`dojo ${s.id}: ${errorMessage(e)}`);
      continue;
    }
    take(c, "dojo", s.id, cycleSchema, raw, (m) => ({ source: "dojo", runId: dojoRunOf(m.id), input: { producer: "dojo", cycle: m.id }, units: Math.max(1, m.improvements.length), at: m.at, state: stateOf(m.status, ["awaiting-gate", "committed"], ["failed"]) }));
  }
}

async function strips(c: Collect): Promise<void> {
  const { items, warnings } = await listManifests<unknown, { id: string; raw: unknown }>(stripsRoot(), "run.json", (id, raw) => ({ id, raw }));
  for (const w of warnings) c.unread.push(`strips ${String(w.id)}: ${String(w.reason)}`);
  for (const { id, raw } of items)
    take(c, "strips", id, stripsSchema, raw, (m) => {
      const lanes = new Set(m.cards.map((x) => x.lane));
      const lane = lanes.size === 1 ? [...lanes][0] ?? "edu" : "all";
      // A dry run is a stand-in's: no history of work to import.
      return { source: "strips", runId: m.id, input: { producer: "strips", lane }, units: Math.max(1, m.cards.length), at: m.at, state: m.dry === true ? "live" : stateOf(m.status, ["awaiting-triage", "committed"], []), ...errorOf(m), ...job(m) };
    });
}

const SUBJECT = /^[a-z0-9-]+\/[a-z0-9-]+$/;

/** v1's `listRuns` walk (lib/articles/store.ts) over the root the ledger reads it at
 *  (`articlesRoot`: the article store honours ARTICLES_STORE_DIR only, not the fixture universe). */
async function article(c: Collect): Promise<void> {
  const root = articlesRoot();
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return;
    throw e;
  }
  for (const name of names.filter((n) => RUN_ID_RE.test(n))) {
    let raw: unknown;
    try {
      raw = await readJsonFile<unknown>(path.join(root, name, "run.json"), null);
    } catch (e) {
      c.unread.push(`article ${name}: ${errorMessage(e)}`);
      continue;
    }
    if (raw === null) continue;
    take(c, "article", name, articleSchema, raw, (m) => {
      const subject = m.topic.kind === "subject" ? `${m.topic.bundle ?? ""}/${m.topic.subject ?? ""}` : "";
      const angle = m.topic.angle === undefined || m.topic.angle.trim() === "" ? {} : { angle: m.topic.angle };
      const input: ProducerRunInput = SUBJECT.test(subject) ? { producer: "article", subject, ...angle } : { producer: "article", topic: m.topic.text.trim() || m.id, ...angle };
      return { source: "article", runId: m.id, input, at: m.createdAt, state: stateOf(m.status, ["awaiting-approval", "landed", "rejected"], ["failed"]), ...errorOf(m) };
    });
  }
}

async function mv(c: Collect): Promise<void> {
  for (const raw of (await readMv()).jobs)
    take(c, "mv", String(raw.id), soundJobSchema, raw, (j) => ({ source: "mv", runId: `mv.${j.id}.${j.enqueuedAt}`, input: { producer: "mv", track: j.id }, at: msIso(j.enqueuedAt), state: stateOf(j.state, ["done"], ["failed", "cancelled"]), ...errorOf(j), ...job(j) }));
}

async function suno(c: Collect): Promise<void> {
  for (const raw of (await readSuno()).jobs)
    take(c, "suno", String(raw.id), soundJobSchema, raw, (j) => ({ source: "suno", runId: `suno.${j.id}`, input: { producer: "suno", proposal: j.id }, at: msIso(j.enqueuedAt), state: stateOf(j.state, ["done"], ["failed", "cancelled"]), ...errorOf(j), ...job(j) }));
}

const READERS: Readonly<Record<SourceName, (c: Collect) => Promise<void>>> = { forge, extract, dojo, strips, article, mv, suno };

/** Every v1 run of `sources`, read through v1's readers. A store that cannot be listed is an error. */
export async function listV1Runs(sources: readonly SourceName[] = SOURCE_NAMES): Promise<Result<Listed>> {
  const c: Collect = { runs: [], unread: [] };
  for (const s of sources) {
    try {
      await READERS[s](c);
    } catch (e) {
      return err("unavailable", `${s}: the v1 store could not be listed: ${errorMessage(e)}`, { cause: e });
    }
  }
  return ok(c);
}
