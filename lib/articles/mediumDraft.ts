// THE MEDIUM DRAFT AT THE GATE. Server only.
//
// When a run reaches `awaiting-approval` this builds the Medium package and has
// the operator's signed-in Medium (lib/medium) paste it into a PRIVATE draft, so
// the human reviews the post as Medium will render it rather than as our own
// preview does. post.md stays the one source: nothing is read back from the
// draft, and an edit asked for at the gate goes through Rework. A rework that
// returns to the gate replaces the body of the SAME draft (`mediumDraft.url`).
//
// The draft is a convenience, never a precondition: any failure here becomes
// `mediumDraft: { state: "unavailable", reason }` and the gate still opens.
// Nothing in this file or lib/medium can publish.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { buildMediumPackage, storyBody } from "./mediumPackage";
import { ArticleError, readJsonFile, readRun, runDir, updateRun } from "./store";
import type { ArticleRun, MediumDraft, PostMeta } from "./types";
import type { EngineDeps } from "./engine";
import { fakeMediumDriver } from "@/lib/medium/fake";
import type { MediumDriver } from "@/lib/medium/types";

/** MEDIUM_DRIVER: `live` drives the signed-in profile, `fake` drives nothing, unset is off
 *  (so a probe or a CI run never reaches a real account). */
async function resolveDriver(deps: EngineDeps): Promise<MediumDriver | null> {
  if (deps.medium) return deps.medium;
  const mode = process.env.MEDIUM_DRIVER?.trim();
  if (mode === "fake") return fakeMediumDriver;
  if (mode === "live") return (await import("@/lib/medium/driver")).mediumDriver;
  return null;
}

const SHOT = "medium/draft.png";
const inFlight = new Set<string>();

/** Build the package and make or refresh the run's draft. Throws ArticleError 409 off the gate. */
export async function ensureMediumDraft(id: string, deps: EngineDeps): Promise<ArticleRun> {
  const run = await readRun(id);
  if (run.status !== "awaiting-approval") throw new ArticleError(`a Medium draft is made at the gate; ${id} is ${run.status}`, 409, "bad-transition");
  const driver = await resolveDriver(deps);
  if (!driver) return run;
  const previous = run.mediumDraft?.url;
  if (inFlight.has(id)) throw new ArticleError(`a Medium draft is already being made for ${id}`, 409, "draft-in-flight");
  inFlight.add(id);
  const record = (d: Omit<MediumDraft, "at">) => updateRun(id, (r) => ({ ...r, mediumDraft: { ...d, at: deps.now().toISOString() } }), deps.now);
  try {
    await record({ state: "creating", ...(previous ? { url: previous } : {}) });
    const health = await driver.probe();
    if (!health.ok) throw new Error(health.reason);
    const dir = runDir(id);
    const meta = await readJsonFile<PostMeta | null>(path.join(dir, "post", "meta.json"), null);
    if (!meta) throw new Error("the post has no meta.json");
    await rm(path.join(dir, "medium"), { recursive: true, force: true });
    const pkg = await buildMediumPackage(dir, meta);
    const md = await readFile(path.join(dir, "post", "post.md"), "utf8");
    const figures = pkg.files.filter((f) => f.startsWith("medium/figures/")).map((f) => ({ name: path.basename(f), path: path.join(dir, f) }));
    const made = await driver.createDraft({
      title: meta.title,
      subtitle: meta.subtitle,
      storyHtml: storyBody(md),
      figures,
      ...(previous ? { existingUrl: previous } : {}),
      shotPath: path.join(dir, SHOT),
    });
    return await record({ state: "ready", url: made.url, shot: SHOT, figures: made.figures });
  } catch (e) {
    return await record({ state: "unavailable", reason: (e as Error).message.split("\n")[0].slice(0, 300), ...(previous ? { url: previous } : {}) });
  } finally {
    inFlight.delete(id);
  }
}

/** The drive's call at the gate: never throws, never holds the gate shut. */
export async function draftAtGate(id: string, deps: EngineDeps): Promise<void> {
  try {
    await ensureMediumDraft(id, deps);
  } catch (e) {
    console.error(`[articles] medium draft ${id}: ${(e as Error).message}`);
  }
}
