// Sending the draft back (the rework act), and the prompt section a rework adds to the draft.
// Its own file because a rework archives the files it makes stale, which no other act does.

import { copyFile, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

import { copyDir, fileExists } from "./files";
import { trimmedNote } from "./humanNote";
import { ArticleError, runDir, updateRun, writeJsonAtomic } from "./store";
import { type ArticleRework, type ArticleRun, NOTE_MAX_CHARS } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";

/**
 * SEND THE DRAFT BACK. The operator read the post at the gate; the thinking was
 * fine and the writing is not. The run goes `awaiting-approval -> drafting` with
 * `rework {at, note, count}`, keeps its research, sources, claims and outline,
 * and re-does draft, critique and check. The caller then enqueues the rework's
 * own job (lib/producers/article.ts), exactly as after `approveRun`: the engine
 * does not start the drive itself.
 *
 * A REJECT IS NOT A REWORK. `rejected` stays terminal; rejecting throws the
 * piece away. A rework is one piece of work with one card.
 *
 * What it undoes, because every later step resumes at file level and would
 * otherwise find its own old answers and skip itself: the draft, critique and
 * check step records, the critique's `round-*` directories, the between-turn
 * `checks/`, `check.json` and its screenshots. They are MOVED to
 * `rework/<count>/before/` (with copies of the post and its patches, and the old step records, costs
 * included), never deleted. The reviewer panel snapshot (`critique/reviewers.json`)
 * stays: a run keeps the panel it started with. The old post stays in `post/`
 * until the new draft replaces it, so a rework that fails halfway still has one.
 *
 * What it costs: no research turn, so no live web; the draft turn plus a whole
 * critique and check again. See docs/articles.md.
 *
 * `note` is 1 to NOTE_MAX_CHARS characters after trimming. A reject cuts a
 * longer note; a rework REFUSES it, because a cut instruction silently changes
 * what the operator asked for.
 */
export async function reworkRun(id: string, note: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const text = trimmedNote(note, "a rework");
  if (text.length > NOTE_MAX_CHARS) throw new ArticleError(`a rework note is at most ${NOTE_MAX_CHARS} characters; this one is ${text.length}`, 400, "bad-note");
  // v1 refused here while a `.driver` lease was alive: the drive that stopped at the gate
  // released it a moment after the status changed. That question is the job's now -
  // lib/producers/article.ts `reworkArticle` refuses while the run's job is not finished.
  return updateRun(
    id,
    async (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be reworked; ${id} is ${r.status}`, 409, "bad-transition");
      const count = (r.rework?.count ?? 0) + 1;
      const at = deps.now().toISOString();
      await archiveForRework(id, r, count);
      const out: ArticleRun = {
        ...r,
        status: "drafting",
        steps: r.steps.filter((s) => s.name === "research" || s.name === "outline"),
        rework: { at, note: text, count } satisfies ArticleRework,
      };
      delete out.critique;
      return out;
    },
    deps.now,
  );
}

/** Move what a rework makes stale into `rework/<count>/before/`. */
async function archiveForRework(id: string, run: ArticleRun, count: number): Promise<void> {
  const dir = runDir(id);
  const before = path.join(dir, "rework", String(count), "before");
  await mkdir(before, { recursive: true });
  await writeJsonAtomic(path.join(before, "steps.json"), run.steps);
  if (run.critique) await writeJsonAtomic(path.join(before, "critique-summary.json"), run.critique);
  const move = async (from: string, to: string) => {
    if (await fileExists(from)) {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
    }
  };
  for (const name of ["check.json", "check", "checks"]) await move(path.join(dir, name), path.join(before, name));
  let rounds: string[] = [];
  try {
    rounds = (await readdir(path.join(dir, "critique"))).filter((n) => /^round-\d+$/.test(n));
  } catch {
    // no critique directory: nothing to move
  }
  for (const n of rounds) await move(path.join(dir, "critique", n), path.join(before, "critique", n));
  let receipts: string[] = [];
  try {
    receipts = await readdir(path.join(dir, "agent"));
  } catch {
    // no agent directory
  }
  for (const n of receipts) {
    if (/^(critique|fix)-/.test(n)) await move(path.join(dir, "agent", n), path.join(before, "agent", n));
    // the draft's own receipt and prompt are overwritten by the redraft: keep a copy
    else if (/^draft(-prompt)?\.(json|md)$/.test(n)) await copyFile(path.join(dir, "agent", n), path.join(before, "agent", n)).catch(() => undefined);
  }
  await copyDir(path.join(dir, "post"), path.join(before, "post"));
  // The draft's patches are the other half of what was sent back, and the redraft's ingest
  // replaces them wholesale (ingestDraft.ts `ingestPatches` removes patches/ first): copied, so
  // a rework that fails before the redraft still has them where the gate read them.
  for (const name of ["patches.json", "patches.rejected.json"]) {
    if (await fileExists(path.join(dir, name))) await copyFile(path.join(dir, name), path.join(before, name));
  }
  if (await fileExists(path.join(dir, "patches"))) await copyDir(path.join(dir, "patches"), path.join(before, "patches"));
}

/**
 * The draft prompt's rework section: the operator's instruction, named and
 * set apart from the standing brief, appended after the whole of it. It says
 * what stays fixed (research, sources, outline) and what still binds (the
 * output contract and the check), so the instruction decides what changes and
 * nothing else. Pure over the record.
 *
 * It lives here and not in `pipeline/ARTICLE-POST-PROMPT.md` because the
 * rework work package could not touch the prompt file or prompt.ts; the
 * cleaner home is a `rework` slot in the draft section.
 */
export function reworkSection(rework: ArticleRework): string {
  return [
    "",
    "---",
    "",
    `REWORK ${rework.count} OF THIS DRAFT: THE OPERATOR'S INSTRUCTION`,
    "",
    "The operator read the previous draft at the gate and sent it back. This section is not part of the standing brief above; it is the instruction for this one rewrite, and it decides what changes.",
    "",
    "- The previous draft is in `inputs/previous-post/` (`index.html`, `post.md`, `meta.json`, `figures/`). It is reference: read it, keep what the instruction does not touch, and write the whole post again under `out/post/` to the contract above.",
    "- The research is kept. `inputs/sources.json` and `inputs/claims.json` are unchanged and every source keeps its number; do not research again and do not invent a source. The outline is kept unless the instruction says to change it.",
    "- The output contract and the deterministic check's bars above still bind. An instruction never excuses a missing figure, a missing citation or a font size under its bar.",
    "",
    "THE INSTRUCTION, in the operator's words:",
    '"""',
    rework.note,
    '"""',
    "",
  ].join("\n");
}

/**
 * The same instruction for the critique: each reviewer, and every writer turn after the
 * draft (the answer, a re-research, the rewrite, a fix). Measured 2026-10-18 on rework 2 of
 * the eval-harness run: the note reached the draft alone, the reviewers asked for exact
 * figures and more mechanism, the writer accepted 69 of 74 findings, and the post came back
 * longer (6,340 to 6,833 words) with "logits" and three-decimal figures the note had cut.
 * A reviewer judges the post against the instruction; the writer rejects a finding that
 * would undo it, with the instruction as the reason.
 */
export function reworkCritiqueSection(rework: ArticleRework, who: "reviewer" | "writer"): string {
  const rule =
    who === "reviewer"
      ? "Judge the post against it as well as against the lenses above: a place where the post fails the instruction is a finding (`engagement` or `format`). Never ask for what it rules out; a finding that would add precision, a qualifier or a mechanism the instruction moved out of the prose names the record or the cut that pays for it instead."
      : "It outranks a reviewer's finding. Reject a finding that would undo it (more precision, qualifiers, terms or tables the instruction moved out of the prose) and give the instruction as the reason; a factual error is still corrected, in the instruction's register.";
  return [
    "",
    "---",
    "",
    `THIS POST IS REWORK ${rework.count}: THE OPERATOR'S INSTRUCTION FOR IT`,
    "",
    `The operator read the previous version at the gate and sent it back with the instruction below. ${rule}`,
    "",
    '"""',
    rework.note,
    '"""',
    "",
  ].join("\n");
}
