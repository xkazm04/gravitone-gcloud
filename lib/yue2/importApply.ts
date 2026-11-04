import "server-only";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import type { SongScores, Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { errorMessage, ok, type Result } from "@gt/domain/errors";
import { canonical } from "@gt/kernel/canonical";
import type { Store } from "@gt/kernel/store";

import { filePathAbs, readTakes } from "../sound/store.ts";
import { audioMime } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";
import { allYue2Facts, fileYue2Take } from "./facts.ts";
import type { ImportPlan, PlannedTake, SourceDir } from "./importScan.ts";
import type { ImportSkip } from "./importSources.ts";
import { putSongScores, readSongScores } from "./scores.ts";

// THE BACKFILL, APPLIED (spark yue2-song-lab WP2): an ImportPlan (./importScan.ts) against the sound
// store and the kernel. DRY unless `apply`: a dry pass reads the stores and says what it WOULD file.
//
// IDEMPOTENT. A planned take that is already filed is found, never filed twice, and the report says
// how: by `sha` (the sha256 of a YuE2 take's stored bytes equals the file's), or by `fileName+facts`
// (a YuE2 take of the same file name holds exactly these facts - the fallback when the stored bytes
// are gone). Two files of one plan with the same bytes are filed once; the second is a `duplicate`.
// A post variant is filed after its raw take, with `parentId` and `lineage.sourceTakeId` = that take.
//
// Each take is filed through the sound store's create path (lib/sound/takes.ts createTakeTx) with its
// facts under ONE lock (./facts.ts fileYue2Take): provider local, origin import, kind music. A new
// take carries no verdict, so the git-tracked verdict ledger is not read or written (createTakeTx
// syncs it only for a judged take). Scores are upserted by sha; a row already held is `unchanged`.

export type MatchedBy = "sha" | "fileName+facts";

export type TakeOutcome = { readonly rel: string; readonly dir: SourceDir; readonly title: string } & (
  | { readonly action: "file"; readonly takeId?: string; readonly parentRel?: string }
  | { readonly action: "existing"; readonly takeId: string; readonly matchedBy: MatchedBy }
  | { readonly action: "duplicate"; readonly of: string }
  | { readonly action: "failed"; readonly reason: string }
);

export type DirCount = { found: number; file: number; existing: number; duplicate: number; failed: number };

export type ImportReport = {
  readonly apply: boolean;
  readonly takes: readonly TakeOutcome[];
  readonly perDir: Readonly<Record<SourceDir, DirCount>>;
  /** Score rows by sha: written now, already held as-is, would be written (dry), or refused. */
  readonly scores: { written: number; unchanged: number; wouldWrite: number; failed: number };
  readonly skipped: readonly ImportSkip[];
};

export type ApplyOptions = { readonly apply: boolean; readonly store?: Store; readonly now?: Date };

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** The sha of every YuE2 take's stored bytes, and every YuE2 take by file name. A take whose bytes are gone is only in the second. */
async function existingIndex(): Promise<Result<{ bySha: Map<string, string>; byName: Map<string, { id: string; facts: Yue2TakeFacts }[]> }>> {
  const [takes, facts] = await Promise.all([readTakes(), allYue2Facts()]);
  if (!facts.ok) return facts;
  const bySha = new Map<string, string>();
  const byName = new Map<string, { id: string; facts: Yue2TakeFacts }[]>();
  for (const t of takes.takes) {
    const f = facts.value[t.id];
    if (f === undefined) continue;
    if (t.fileName !== null) byName.set(t.fileName, [...(byName.get(t.fileName) ?? []), { id: t.id, facts: f }]);
    if (t.file === null) continue;
    try {
      const sha = sha256(new Uint8Array(await readFile(filePathAbs(t.file.path))));
      if (!bySha.has(sha)) bySha.set(sha, t.id);
    } catch {
      // bytes gone or unreadable: the take can still be matched by fileName+facts
    }
  }
  return ok({ bySha, byName });
}

const emptyCount = (): DirCount => ({ found: 0, file: 0, existing: 0, duplicate: 0, failed: 0 });

function metaOf(t: PlannedTake, parentId: string | undefined, createdAt: string): Partial<SoundTake> {
  return {
    kind: "music",
    provider: "local",
    origin: "import",
    // A render is a composition; a post variant is a manual process over a filed take (SoundOp has no post op).
    op: t.dir === "post" ? "manual" : "compose",
    title: t.title,
    prompt: t.facts.style,
    fileName: t.fileName,
    durationS: t.facts.durationS,
    createdAt,
    ...(parentId === undefined ? {} : { parentId }),
  };
}

/** Run the plan: dry (`apply: false`) reads the stores and reports; `apply` files the takes, their facts and scores. */
export async function applyPlan(plan: ImportPlan, o: ApplyOptions): Promise<Result<ImportReport>> {
  const idx = await existingIndex();
  if (!idx.ok) return idx;
  const { bySha, byName } = idx.value;
  const perDir: Record<SourceDir, DirCount> = { baseline: emptyCount(), grid: emptyCount(), gen2: emptyCount(), lora: emptyCount(), post: emptyCount() };
  const outcomes: TakeOutcome[] = [];
  const idOfRel = new Map<string, string>();
  const relOfSha = new Map<string, string>();
  const scoresBySha = new Map<string, SongScores>();

  for (const t of plan.takes) {
    perDir[t.dir].found++;
    // Two files of the same bytes may each carry a score row: the newest speaks for the sha.
    const prevScores = scoresBySha.get(t.sha);
    if (t.scores !== undefined && (prevScores === undefined || t.scores.scoredAt >= prevScores.scoredAt)) scoresBySha.set(t.sha, t.scores);
    const base = { rel: t.rel, dir: t.dir, title: t.title };
    const firstOfBytes = relOfSha.get(t.sha);
    if (firstOfBytes !== undefined) {
      outcomes.push({ ...base, action: "duplicate", of: firstOfBytes });
      perDir[t.dir].duplicate++;
      continue;
    }
    relOfSha.set(t.sha, t.rel);
    const parentId = t.sourceRel === undefined ? undefined : idOfRel.get(t.sourceRel);
    const facts: Yue2TakeFacts = parentId === undefined ? t.facts : { ...t.facts, lineage: { ...t.facts.lineage, sourceTakeId: parentId } };

    const bySame = bySha.get(t.sha);
    const byFacts = bySame === undefined ? byName.get(t.fileName)?.find((c) => canonical(c.facts) === canonical(facts))?.id : undefined;
    const existing = bySame ?? byFacts;
    if (existing !== undefined) {
      idOfRel.set(t.rel, existing);
      outcomes.push({ ...base, action: "existing", takeId: existing, matchedBy: bySame !== undefined ? "sha" : "fileName+facts" });
      perDir[t.dir].existing++;
      continue;
    }
    if (t.sourceRel !== undefined && parentId === undefined && o.apply) {
      outcomes.push({ ...base, action: "failed", reason: `its raw take ${t.sourceRel} was not filed` });
      perDir[t.dir].failed++;
      continue;
    }
    if (!o.apply) {
      outcomes.push({ ...base, action: "file", ...(t.sourceRel === undefined ? {} : { parentRel: t.sourceRel }) });
      perDir[t.dir].file++;
      continue;
    }
    try {
      const bytes = new Uint8Array(await readFile(t.abs));
      if (sha256(bytes) !== t.sha) throw new Error("the file changed between the plan and the filing");
      const createdAt = (await stat(t.abs)).mtime.toISOString();
      const filed = await fileYue2Take(metaOf(t, parentId, createdAt), { bytes, mime: audioMime(null, t.fileName), name: t.fileName }, facts, o.now);
      if (!filed.ok) throw new Error(filed.error.message);
      idOfRel.set(t.rel, filed.value.take.id);
      bySha.set(t.sha, filed.value.take.id);
      outcomes.push({ ...base, action: "file", takeId: filed.value.take.id, ...(t.sourceRel === undefined ? {} : { parentRel: t.sourceRel }) });
      perDir[t.dir].file++;
    } catch (e) {
      outcomes.push({ ...base, action: "failed", reason: errorMessage(e) });
      perDir[t.dir].failed++;
    }
  }

  const scores = { written: 0, unchanged: 0, wouldWrite: 0, failed: 0 };
  const rows = [...scoresBySha.values()];
  const held = o.store === undefined || rows.length === 0 ? ok({} as Readonly<Record<string, SongScores>>) : readSongScores(o.store, rows.map((r) => r.sha));
  if (!held.ok) return held;
  for (const row of rows) {
    const have = held.value[row.sha];
    if (have !== undefined && canonical(have) === canonical(row)) scores.unchanged++;
    else if (!o.apply || o.store === undefined) scores.wouldWrite++;
    else if (putSongScores(o.store, row).ok) scores.written++;
    else scores.failed++;
  }
  return ok({ apply: o.apply, takes: outcomes, perDir, scores, skipped: plan.skipped });
}
