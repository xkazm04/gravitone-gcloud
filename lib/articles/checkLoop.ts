// The check between writer turns: run the check, hand its mandatory failures to the writer as
// fixes, at most MAX_FIX_PASSES times, and record each pass. Also the readers of those pass
// records. Its own file because the critique and the drive both call it, and it owns the
// pass files.

import { copyFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCheck } from "./checks";
import { copyDir } from "./files";
import { critiqueTurn } from "./critiqueTurn";
import { ingestPost } from "./ingestDraft";
import { readJsonFile, runDir, updateRun, writeJsonAtomic } from "./store";
import { StepError, sumCost } from "./stepFailure";
import type { CheckItem, CheckPassRecord, CheckReport, StepName } from "./types";
import { MAX_FIX_PASSES, type EngineDeps } from "./engine";

/* ── the check between writer turns ───────────────────────────────────────── */

/** The check's failures the writer must meet between turns. The critique item is excluded:
 *  it cannot pass until the critique is over. Items not measured are not failures. */
export function mandatoryFailures(report: CheckReport): CheckItem[] {
  return report.items.filter((i) => i.status === "fail" && i.id !== "critique");
}

/** The failures as the fix prompt carries them. */
export function failuresText(failed: CheckPassRecord["failed"]): string {
  return failed
    .map((f) => `- \`${f.id}\` (${f.dimension}): ${f.label}. Measured: ${f.value ?? "n/a"}. Required: ${f.expected ?? "see the label"}.${f.detail?.length ? `\n${f.detail.slice(0, 12).map((d) => `    - ${d}`).join("\n")}` : ""}`)
    .join("\n");
}

const passFile = (dir: string, r: Pick<CheckPassRecord, "label" | "pass">) => path.join(dir, "checks", `${r.label}-${r.pass}.json`);

export async function readCheckPasses(dir: string, label?: string): Promise<CheckPassRecord[]> {
  let files: string[];
  try {
    files = (await readdir(path.join(dir, "checks"))).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: CheckPassRecord[] = [];
  for (const f of files) {
    const r = await readJsonFile<CheckPassRecord | null>(path.join(dir, "checks", f), null);
    if (r && (label === undefined || r.label === label)) out.push(r);
  }
  return out.sort((a, b) => (label === undefined ? a.at.localeCompare(b.at) || a.pass - b.pass : a.pass - b.pass));
}

/** A check that could not run is not a reason to stop a run that has spent an hour; the final
 *  check step runs it again and fails by name if the problem is real. */
export function noteCheckError(e: unknown): undefined {
  console.error(`[articles] the between-turn check could not run: ${(e as Error).message}`);
  return undefined;
}

/**
 * Check the post as the writer left it; when items fail, hand them to the writer as mandatory
 * fixes and check again, at most MAX_FIX_PASSES times. Failures that remain are recorded in
 * `checks/<label>-<pass>.json` and the run goes on; the final check step reports them to the
 * human. A failed fix turn is recorded (`fixError`) and ends the loop; the post is untouched.
 * State is the pass files alone, so a resume carries on where the last drive stopped.
 */
export async function checkLoop(id: string, label: string, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  let cost: number | undefined;
  for (;;) {
    const held = await readCheckPasses(dir, label);
    let rec = held[held.length - 1];
    if (!rec || rec.fixed) {
      const report = await runCheck(dir, { render: deps.render, screenshots: false, now: deps.now });
      rec = {
        label,
        pass: held.length + 1,
        at: report.at,
        failed: mandatoryFailures(report).map((i) => ({ id: i.id, dimension: i.dimension, label: i.label, ...(i.value !== undefined ? { value: i.value } : {}), ...(i.expected ? { expected: i.expected } : {}), ...(i.detail?.length ? { detail: i.detail.slice(0, 12) } : {}) })),
        fixed: false,
      };
      await writeJsonAtomic(passFile(dir, rec), rec);
    }
    if (!rec.failed.length || rec.pass > MAX_FIX_PASSES) return cost;
    try {
      cost = sumCost(cost, await fixTurn(id, rec, deps));
    } catch (e) {
      cost = sumCost(cost, e instanceof StepError ? e.costUsd : undefined);
      await writeJsonAtomic(passFile(dir, rec), { ...rec, fixed: true, fixError: (e as Error).message });
      return cost;
    }
    await writeJsonAtomic(passFile(dir, rec), { ...rec, fixed: true });
  }
}

/** One fix turn: the post and its failures in, the post out, edited in place. */
async function fixTurn(id: string, rec: CheckPassRecord, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  const stage = async (ws: string) => {
    const inputs = path.join(ws, "inputs");
    await copyDir(path.join(dir, "post"), path.join(inputs, "post"));
    await copyFile(path.join(dir, "sources.json"), path.join(inputs, "sources.json"));
    await copyFile(path.join(dir, "claims.json"), path.join(inputs, "claims.json"));
    await writeFile(path.join(inputs, "check-failures.json"), `${JSON.stringify(rec.failed, null, 2)}\n`, "utf8");
    // The post is also seeded into out/post: the fix edits it in place and every paragraph
    // the check did not flag is carried over byte for byte (a fix that rewrote the whole post
    // cost $4 a pass and changed text nobody had flagged).
    await copyDir(path.join(dir, "post"), path.join(ws, "out", "post"));
  };
  return critiqueTurn(id, 0, "fix", { maxCritiqueRounds: 2 }, deps, stage, (ws) => ingestPost(ws, dir), { name: `fix-${rec.label}-${rec.pass}`, checkFailures: failuresText(rec.failed) });
}

/** Run the loop outside a step and put what it cost on `stepName`'s record. */
export async function checkedBetween(id: string, label: string, stepName: StepName, deps: EngineDeps): Promise<void> {
  const cost = await checkLoop(id, label, deps).catch(noteCheckError);
  if (!cost) return;
  await updateRun(id, (r) => ({ ...r, steps: r.steps.map((s) => (s.name === stepName ? { ...s, costUsd: Math.round(((s.costUsd ?? 0) + cost) * 1_000_000) / 1_000_000 } : s)) }), deps.now);
}
