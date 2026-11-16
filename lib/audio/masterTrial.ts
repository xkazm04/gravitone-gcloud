import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MasterResult } from "@gt/domain/audio.master";
import type { MasterRecipe } from "@gt/domain/release";

import { createTake, listTakes } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";

// THE MASTER TRIAL'S PARTS (spark audio-distribution, S1) - pipeline/master-trial.mts drives them: the
// trial record (the listening page is ./masterCompare.ts), and the --adopt step that files a master as a child
// take of the take it was made from. The CLI owns the loop; these own the shapes, so a test reaches them
// without spawning tsx.

/** What the trial's own `measure` re-read of the written master said (acceptance is THIS, not the verb's self-report). */
export interface Remeasure {
  readonly integratedLufs: number | null;
  readonly truePeakDb: number | null;
  readonly lra: number | null;
  readonly clippedSamples: number;
}

export interface TrialRow {
  readonly title: string;
  readonly input: string;
  /** The master, or null when the verb failed (then `error` is its sentence). */
  readonly output: string | null;
  readonly master: MasterResult | null;
  readonly remeasure: Remeasure | null;
  /** after.lufs - before.lufs: what the master did to the level, + is up. */
  readonly gainDb: number | null;
  readonly pass: boolean;
  /** Why the row did not pass (the verb's or the meter's sentence), else null. */
  readonly error: string | null;
  readonly adopt: { readonly parentId: string | null; readonly takeId: string | null; readonly error: string | null } | null;
}

export const LUFS_TOL = 0.5;

/** The acceptance judgement of one re-measured master: -14 +/- 0.5 LUFS, <= -1 dBTP, no clipped sample. */
export function judge(m: Remeasure, target: { readonly lufs: number; readonly truePeakDb: number }): string | null {
  if (m.integratedLufs === null) return "the master measured no integrated loudness";
  if (Math.abs(m.integratedLufs - target.lufs) > LUFS_TOL) return `integrated ${m.integratedLufs} LUFS is outside ${target.lufs} +/- ${LUFS_TOL}`;
  if (m.truePeakDb === null || m.truePeakDb > target.truePeakDb) return `true peak ${String(m.truePeakDb)} dBTP is above ${target.truePeakDb}`;
  if (m.clippedSamples > 0) return `${m.clippedSamples} clipped samples`;
  return null;
}

/** `<stem>.<recipe>.wav` - the recipe id is in every master's name. */
export function masterName(input: string, recipe: MasterRecipe): string {
  return `${path.basename(input, path.extname(input))}.${recipe}.wav`;
}

const norm = (s: string): string => s.normalize("NFC").trim().toLowerCase();

/**
 * The take a source file is the audio of: a take whose stored file IS it (the store names files by
 * take id), else one whose upload name or title equals the file's stem. Fixtures and file-less takes
 * never match. Two candidates are refused by name rather than guessed between.
 */
export function matchTake(takes: readonly SoundTake[], input: string): { readonly take: SoundTake } | { readonly error: string } {
  const stem = norm(path.basename(input, path.extname(input)));
  const withFile = takes.filter((t) => t.file !== null && t.origin !== "fixture");
  const byId = withFile.filter((t) => norm(t.id) === stem);
  const hits =
    byId.length > 0
      ? byId
      : withFile.filter((t) => (t.fileName !== null && norm(path.basename(t.fileName, path.extname(t.fileName))) === stem) || norm(t.title) === stem);
  const one = hits[0];
  if (hits.length === 1 && one !== undefined) return { take: one };
  if (hits.length === 0) return { error: `no take with a file named or titled "${path.basename(input, path.extname(input))}"` };
  return { error: `${hits.length} takes match "${path.basename(input, path.extname(input))}": ${hits.map((t) => t.id).join(", ")}` };
}

/**
 * File `master` as a child take of the matched take: same kind, provider, terms and group, `stage:
 * "remaster"` (a stage only a kept take may hold, so it is filed kept). A Suno parent's child is a
 * `suno-return` with a parent and no judgement of its own - lib/sound/ledger.ts isVersionOnly - so it
 * writes no ledger row; any other parent's child is an `import` and does.
 */
export async function adoptMaster(input: string, master: MasterResult): Promise<NonNullable<TrialRow["adopt"]>> {
  const found = matchTake(await listTakes(), input);
  if ("error" in found) return { parentId: null, takeId: null, error: found.error };
  const parent = found.take;
  try {
    const bytes = new Uint8Array(await readFile(master.output));
    const name = path.basename(master.output);
    const { take } = await createTake(
      {
        title: `${parent.title} (${master.recipe})`.slice(0, 200),
        kind: parent.kind,
        provider: parent.provider,
        op: "manual",
        origin: parent.origin === "suno-return" ? "suno-return" : "import",
        terms: parent.terms,
        prompt: parent.prompt,
        tempoBpm: parent.tempoBpm,
        key: parent.key,
        durationS: parent.durationS,
        parentId: parent.id,
        group: parent.group,
        verdict: "kept",
        stage: "remaster",
        note: `master ${master.recipe}: ${master.before.lufs} -> ${master.after.lufs} LUFS, ${master.after.truePeakDb} dBTP`,
        fileName: name,
      },
      { bytes, mime: "audio/wav", name },
    );
    return { parentId: parent.id, takeId: take.id, error: null };
  } catch (e) {
    return { parentId: parent.id, takeId: null, error: e instanceof Error ? e.message : String(e) };
  }
}
