// A GAME'S ASSET NEEDS, AS THE GAME MEASURED THEM (spark scout-vision S4) - the reader of POF's
// `asset-needs/<project>.json` (wire contract `asset-needs/1`, written by `npx tsx scripts/asset-needs.ts
// <project>` in POF from the game's own manifests and scorecard), and the one rule the asset door keeps
// with it: a game-asset brief for an existing project names one OPEN, BRIEFABLE need of a FRESH file, and
// takes that need's budget. What the night thought the game lacked was wrong twice in S4's digest (a
// redundant arena gate kept, budgets the game's own check fails), so the game's file is the only source.
//
//   ROOT       EXPORT_ROOT_POF, else `../pof` beside the working directory - lib/foundry/mesh/export.ts's
//              exportRoot rule, restated because that module is server-only and this one runs in the CLI.
//   STALE      a file older than NEEDS_STALE_DAYS reads as unreadable, with its age and the command that
//              refreshes it: a game moves under a week-old roster, and a brief against it repeats S4's gate.
//   BRIEFABLE  a need with a `gravitoneClass` (a mesh gravitone makes); absent = a material, a backdrop, hands
//              - listed by the game, counted here, never briefed.
//
// Pure apart from the one file read. Optional fields are omitted, never null.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { ASSET_CLASSES, BUDGETS, type AssetClass } from "../mesh/types";
import type { BriefInput } from "./concept";

export const NEEDS_SCHEMA = "asset-needs/1";
export const NEEDS_STALE_DAYS = 7;
const DAY_MS = 86_400_000;

/* ── The wire contract, asset-needs/1 ─────────────────────────────────────── */

const text = z.string().trim().min(1);
const tris = z.number().int().positive();
const gravitoneClass = z.enum(ASSET_CLASSES);

const inventorySchema = z.object({
  id: text,
  name: text,
  class: text,
  gravitoneClass: gravitoneClass.optional(),
  tris: z.number().int().nonnegative().optional(),
  budgetTris: tris.optional(),
  gates: z.record(z.string(), z.boolean()),
  score: z.object({ value: z.number(), of: z.number().positive(), source: text }).optional(),
});

export const NEED_ID_RE = /^need-[a-z0-9][a-z0-9-]*$/;

const needSchema = z.object({
  id: z.string().regex(NEED_ID_RE, { message: "a need id is need-<slug>" }),
  kind: z.enum(["missing", "scored-low"]),
  subject: text,
  class: text,
  gravitoneClass: gravitoneClass.optional(),
  why: text,
  evidence: text,
  budgetTris: tris.optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  assetId: text.optional(),
});

const needsFileSchema = z.object({
  schema: z.literal(NEEDS_SCHEMA),
  project: text,
  generatedAt: z.iso.datetime({ offset: true }),
  source: z.object({ repo: text, commit: text, pofCommit: text }),
  rules: z.object({ budgets: z.record(z.string(), tris).optional(), notes: z.array(z.string()) }),
  inventory: z.array(inventorySchema),
  needs: z.array(needSchema),
});

export type AssetNeeds = Parsed<z.output<typeof needsFileSchema>>;
export type AssetNeed = AssetNeeds["needs"][number];
/** A need gravitone can brief: one with the class of mesh it would be. */
export type BriefableNeed = AssetNeed & { readonly gravitoneClass: AssetClass };

export type NeedsRead =
  | { readonly ok: true; readonly project: string; readonly file: AssetNeeds; readonly path: string; readonly ageDays: number }
  | { readonly ok: false; readonly project: string; readonly why: string; readonly path: string };

/* ── The reader ───────────────────────────────────────────────────────────── */

/** POF's checkout on this machine: EXPORT_ROOT_POF, else the sibling `../pof` (mesh/export.ts exportRoot's rule). */
export function needsRoot(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env["EXPORT_ROOT_POF"]?.trim() || path.resolve(process.cwd(), "..", "pof");
}

export const needsPath = (project: string, root: string = needsRoot()): string => path.join(root, "asset-needs", `${project}.json`);

const refresh = (project: string): string => `npx tsx scripts/asset-needs.ts ${project}`;

/** Read, validate and date one project's needs file. Never throws: what it could not read is `why`. */
export async function readNeeds(project: string, o: { readonly root?: string; readonly now?: Date } = {}): Promise<NeedsRead> {
  const file = needsPath(project, o.root ?? needsRoot());
  const no = (why: string): NeedsRead => ({ ok: false, project, why, path: file });
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return no(code === "ENOENT" ? `${project} has no asset-needs file at ${file}; run \`${refresh(project)}\` in pof` : `${file} could not be read: ${(e as Error).message}`);
  }
  const r = parseJsonAt(`asset-needs ${project}`, needsFileSchema, raw);
  if (!r.ok) return no(r.error.message);
  const needs = r.value;
  if (needs.project !== project) return no(`${file} is the asset needs of ${needs.project}, not ${project}`);
  const ageDays = Math.max(0, ((o.now ?? new Date()).getTime() - Date.parse(needs.generatedAt)) / DAY_MS);
  if (ageDays > NEEDS_STALE_DAYS) return no(`${project}'s asset needs are ${Math.floor(ageDays)} days old (generated ${needs.generatedAt.slice(0, 10)}, stale past ${NEEDS_STALE_DAYS}); run \`${refresh(project)}\` in pof`);
  return { ok: true, project, file: needs, path: file, ageDays };
}

/** The needs gravitone can brief: those with a gravitoneClass, in the file's order. */
export const openNeeds = (file: Pick<AssetNeeds, "needs">): BriefableNeed[] => file.needs.filter((n): n is BriefableNeed => n.gravitoneClass !== undefined);

/* ── The door's rule ──────────────────────────────────────────────────────── */

/** A pof brief is refused while pof has no game to measure (its UE content was lost in the 2026-10-19 reset). */
const POF_EMPTY = "pof has no game content to measure";

/**
 * A brief for an existing project, checked against that project's needs: the file fresh and readable, `need`
 * naming one of its open briefable needs, the brief's class that need's, and its budget the need's (else the
 * class budget). A newProject brief passes untouched; so does nothing else.
 */
export function withNeed(input: BriefInput, read: NeedsRead): Result<BriefInput> {
  if (!("project" in input.serves)) return ok(input);
  const project = input.serves.project;
  if (!read.ok) return err("invalid", `asset brief: serves ${project}: ${project === "pof" ? `${POF_EMPTY} - ` : ""}${read.why}`);
  const open = openNeeds(read.file);
  if (input.need === undefined) return err("invalid", `asset brief: serves ${project} names a need: need: "<id>", one of ${open.map((n) => n.id).join(", ") || "none open"}`);
  const n = read.file.needs.find((x) => x.id === input.need);
  if (n === undefined) return err("invalid", `asset brief: need ${input.need} is not in ${read.path}`);
  if (n.gravitoneClass === undefined) return err("invalid", `asset brief: need ${n.id} (${n.class}) is not a mesh gravitone briefs`);
  if (n.gravitoneClass !== input.brief.class) return err("invalid", `asset brief: need ${n.id} is a ${n.gravitoneClass}, not a ${input.brief.class}`);
  return ok({ ...input, brief: { ...input.brief, budgetTris: n.budgetTris ?? BUDGETS[n.gravitoneClass].tris } });
}

/* ── The taste brief's section ────────────────────────────────────────────── */

const day = (iso: string): string => iso.slice(0, 10);

/** `## Asset needs`: per project its open briefable needs (id · kind · subject · budget · why) and the rest's count, or why it could not be read. */
export function needsSection(reads: readonly NeedsRead[]): string[] {
  if (reads.length === 0) return [];
  const out = ["## Asset needs", ""];
  for (const r of reads) {
    if (!r.ok) {
      out.push(`- ${r.project}: unreadable - ${r.why}`, "");
      continue;
    }
    const open = openNeeds(r.file);
    const rest = r.file.needs.length - open.length;
    out.push(`- ${r.project} · generated ${day(r.file.generatedAt)} · ${open.length} open to brief · ${rest} not briefable`);
    for (const n of open) out.push(`  - ${n.id} · ${n.kind} · ${n.subject} · ${n.gravitoneClass} ${n.budgetTris ?? BUDGETS[n.gravitoneClass].tris} tris · ${n.why}`);
    out.push("");
  }
  return out;
}
