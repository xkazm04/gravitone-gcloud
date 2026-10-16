import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { partSchema, type Part } from "@gt/domain/part";
import { projectSchema, type Project } from "@gt/domain/project";
import { runSchema, type Run } from "@gt/domain/run";
import { canonical } from "../canonical.ts";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Tx } from "../store.ts";

// THE RECORDS TABLES - projects, their parts, and Floor runs (plan §2.2, §3.1).
//
// The record JSON is the truth and is re-validated through its domain door on every read and
// write; the columns beside it are query copies (`rev` for the compare-and-set, `job_id` for the
// join to the job a part or run became, `listed` for the bounded list read). There is no STATE
// column on purpose: a part's and a project's state is derived from jobs and packets at read
// (domain plan.ts), and a column would be a second copy that could disagree.
//
// v1 kept projects in the browser's IndexedDB (`projects`, `steps`, DB_VERSION 5,
// lib/projects.ts) - one copy per browser, no server could read it, and a cut's ~5 MB of base64
// plates rode inside the step rows. Only the plan lives here; produced artefacts stay in their
// stores (COMMON decision 9).

export const recordsMigrations: ModuleMigrations = {
  module: "records",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL CHECK (rev > 0),
  listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1)),
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX projects_listed ON projects (listed, updated_at);
CREATE TABLE parts (
  project_id TEXT NOT NULL REFERENCES projects (id),
  part_id TEXT NOT NULL UNIQUE,
  ord INTEGER NOT NULL,
  job_id TEXT UNIQUE,
  record TEXT NOT NULL,
  PRIMARY KEY (project_id, part_id)
) WITHOUT ROWID;
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX runs_created ON runs (created_at);`,
    },
  ],
};

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** A part row: the record plus what the store knows beside it. */
export type PartRow = { readonly part: Part; readonly ord: number; readonly jobId: string | null };

const partEnvelope = z.object({ part: z.unknown() });

export function loadProject(r: Reader, id: string): Project {
  const raw = r.get("SELECT record FROM projects WHERE id = ?", id);
  if (raw === undefined) throw new AppError("not-found", `no project ${id}`);
  const p = must(parseJsonAt("project record", projectSchema, String(raw["record"])));
  if (p.discardedAt !== undefined) throw new AppError("not-found", `project ${id} was discarded at ${p.discardedAt}`);
  return p;
}

export function loadParts(r: Reader, projectId: string): PartRow[] {
  return r.all("SELECT ord, job_id, record FROM parts WHERE project_id = ? ORDER BY ord", projectId).map((row) => {
    const env = must(parseJsonAt("part row", partEnvelope, String(row["record"])));
    const part = must(parseAt("part record", partSchema, env.part));
    const job = row["job_id"];
    return { part, ord: Number(row["ord"]), jobId: typeof job === "string" ? job : null };
  });
}

export function insertProject(t: Tx, p: Project): void {
  const v = must(parseAt("project", projectSchema, p));
  t.run("INSERT INTO projects (id, rev, listed, updated_at, record) VALUES (?, ?, 1, ?, ?)", v.id, v.rev, t.at, canonical(v));
}

/** Compare-and-set on `rev`: the write lands only on the revision it was computed from. */
export function putProject(t: Tx, p: Project, fromRev: number): void {
  const v = must(parseAt("project", projectSchema, p));
  const listed = v.discardedAt === undefined ? 1 : 0;
  const n = t.run("UPDATE projects SET rev = ?, listed = ?, updated_at = ?, record = ? WHERE id = ? AND rev = ?", v.rev, listed, t.at, canonical(v), v.id, fromRev).changes;
  if (n !== 1) throw new AppError("conflict", `project ${v.id} moved past revision ${fromRev} during the write`);
}

export function insertPart(t: Tx, projectId: string, ord: number, part: Part): void {
  const v = must(parseAt("part", partSchema, part));
  t.run("INSERT INTO parts (project_id, part_id, ord, job_id, record) VALUES (?, ?, ?, NULL, ?)", projectId, v.id, ord, canonical({ part: v }));
}

export function putPart(t: Tx, projectId: string, row: PartRow): void {
  const v = must(parseAt("part", partSchema, row.part));
  const n = t.run("UPDATE parts SET job_id = ?, record = ? WHERE project_id = ? AND part_id = ?", row.jobId, canonical({ part: v }), projectId, v.id).changes;
  if (n !== 1) throw new AppError("not-found", `no part ${v.id} in project ${projectId}`);
}

export function insertRun(t: Tx, run: Run, jobId: string): void {
  const v = must(parseAt("run", runSchema, run));
  t.run("INSERT INTO runs (id, job_id, created_at, record) VALUES (?, ?, ?, ?)", v.id, jobId, v.createdAt, canonical(v));
}

/** A run launched again: the record as read now, serving its new job. */
export function putRun(t: Tx, run: Run, jobId: string): void {
  const v = must(parseAt("run", runSchema, run));
  const n = t.run("UPDATE runs SET job_id = ?, record = ? WHERE id = ?", jobId, canonical(v), v.id).changes;
  if (n !== 1) throw new AppError("not-found", `no run ${v.id}`);
}

export function loadRun(r: Reader, id: string): { run: Run; jobId: string } {
  const raw = r.get("SELECT job_id, record FROM runs WHERE id = ?", id);
  if (raw === undefined) throw new AppError("not-found", `no run ${id}`);
  return { run: must(parseJsonAt("run record", runSchema, String(raw["record"]))), jobId: String(raw["job_id"]) };
}

/** The seconds the job serving a part or run was quoted at launch; 0 when nothing quoted it. */
export function quotedSecondsOf(r: Reader, jobId: string): number {
  const part = r.get("SELECT record FROM parts WHERE job_id = ?", jobId);
  if (part !== undefined) {
    const env = must(parseJsonAt("part row", partEnvelope, String(part["record"])));
    const p = must(parseAt("part record", partSchema, env.part));
    return "quoted" in p && p.quoted !== undefined ? p.quoted.seconds : 0;
  }
  const run = r.get("SELECT record FROM runs WHERE job_id = ?", jobId);
  return run === undefined ? 0 : must(parseJsonAt("run record", runSchema, String(run["record"]))).estimate.seconds;
}
