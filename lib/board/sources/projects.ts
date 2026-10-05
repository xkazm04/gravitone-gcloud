// The project scan the three step-store sources share (adoption, alternative,
// triage). Each decision lives in IndexedDB under `${projectId}:${phase}`
// (app/_phases/_shared/stepStore.ts), so finding them is one read per project
// per phase — done lazily, only when one of these sources is asked for, and
// one project at a time so a shelf of hundreds never opens hundreds of
// connections at once.

import { readStep, type BeatPicksStepData, type ResearchNotebookStepData, type ResearchStepData } from "@/app/_phases/_shared/stepStore";
import { listProjects, type Project } from "@/lib/projects";

import { SourceUnavailable } from "../source";

export async function projectsFor(uid: string | null): Promise<Project[]> {
  if (!uid) throw new SourceUnavailable("not signed in");
  if (typeof indexedDB === "undefined") throw new SourceUnavailable("IndexedDB unavailable");
  return listProjects(uid);
}

/** A read that failed is not a project with nothing in it. */
export async function readOrThrow<T>(projectId: string, phase: string): Promise<T | undefined> {
  const r = await readStep<T>(projectId, phase);
  if (!r.ok) throw new Error(`${phase} for ${projectId}: ${r.trouble.message}`);
  return r.data;
}

/**
 * Is this project on the EXPLAINER path with research in hand — the only
 * projects whose Script step offers candidate renders and whose Research step
 * has a triage board. The rule is ScriptStep.tsx:140's: a trailer, a music
 * video, or a free project that chose beats takes another path entirely.
 */
export async function onExplainerPath(p: Project): Promise<boolean> {
  const d = p.discipline ?? "educational";
  if (d === "trailer" || d === "music-video") return false;
  if (d === "free") {
    const picks = await readOrThrow<BeatPicksStepData>(p.id, "research-beats");
    if (picks?.mode === "beats") return false;
  }
  const research = await readOrThrow<ResearchStepData>(p.id, "research");
  if (research?.researched) return true;
  const notebook = await readOrThrow<ResearchNotebookStepData>(p.id, "research-notebook");
  return Boolean(notebook?.notebook);
}

/** Map over projects one at a time — the lazy half of "scanned per project". */
export async function serially<T, R>(xs: readonly T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const x of xs) out.push(await fn(x));
  return out;
}

export const studioHref = (projectId: string, step: "research" | "script" | "frames") =>
  `/studio/${encodeURIComponent(projectId)}?step=${step}`;
