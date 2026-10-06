// The /foundry page's only way to the disk: the /api/foundry/* seams.
//
// Same access header as every other gated route (lib/imagingClient.ts), and
// for <img> tags — which cannot carry a header — the same credential as a
// query parameter, through `withAccess` (see app/api/foundry/file/route.ts).

import { accessHeader, withAccess } from "@/lib/imagingClient";
import type { Catalogue, CommitResult, ForgeCommitPlan, RunDetail, RunSummary, Verdicts } from "@/lib/foundry/types";
import type { StripCommitPlan, StripCommitResult, StripRunDetail, StripRunSummary } from "@/lib/foundry/strips/triage";
import type { StripVerdicts } from "@/lib/foundry/strips/types";
import type { TrainingCommitResult, TrainingCycleDetail, TrainingCycleSummary, TrainingVerdicts } from "@/lib/foundry/training/types";

export class FoundryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The one request rule for every /api/foundry/* seam — the access header, a
 *  network failure turned into a FoundryRequestError with status 0, and the
 *  route's own `detail` preferred over an HTTP number.
 *
 *  Exported because extractClient.ts held a byte-identical private copy of it.
 *  Two implementations of one rule is the shape where only one ever gets
 *  fixed: a timeout, a 401 re-auth, a retry added here would have reached the
 *  Cull tab and silently missed the Extract tab. It already imports
 *  FoundryRequestError and fileUrl from this module, so there is no new seam. */
export async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...accessHeader(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new FoundryRequestError("The studio could not be reached.", 0);
  }
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) throw new FoundryRequestError((json as { detail?: string }).detail ?? `HTTP ${res.status}`, res.status);
  return json as T;
}

export const fetchRuns = () => call<{ runs: RunSummary[] }>("/api/foundry/runs").then((r) => r.runs);
export const fetchRun = (id: string) => call<RunDetail>(`/api/foundry/runs/${encodeURIComponent(id)}`);
export const fetchCatalogue = () => call<Catalogue>("/api/foundry/styles");
export const saveVerdicts = (id: string, verdicts: Verdicts) =>
  call<{ ok: true }>(`/api/foundry/runs/${encodeURIComponent(id)}/verdicts`, {
    method: "PUT",
    body: JSON.stringify({ verdicts }),
  });
export const previewCommit = (id: string, undecidedAs: "reject" | "leave" = "reject") =>
  call<ForgeCommitPlan>(`/api/foundry/runs/${encodeURIComponent(id)}/commit?undecidedAs=${undecidedAs}`);
export const commitRun = (id: string, undecidedAs: "reject" | "leave" = "reject", token?: string) =>
  call<CommitResult>(`/api/foundry/runs/${encodeURIComponent(id)}/commit`, {
    method: "POST",
    body: JSON.stringify({ undecidedAs, token }),
  });

/* ── The Dojo's seams — the training loop's cycles, gated by hand ────────── */

export const fetchTrainingCycles = () => call<{ cycles: TrainingCycleSummary[] }>("/api/foundry/training").then((r) => r.cycles);
export const fetchTrainingCycle = (id: string) => call<TrainingCycleDetail>(`/api/foundry/training/${encodeURIComponent(id)}`);
export const saveTrainingVerdicts = (id: string, verdicts: TrainingVerdicts) =>
  call<{ verdicts: TrainingVerdicts }>(`/api/foundry/training/${encodeURIComponent(id)}/verdicts`, {
    method: "PUT",
    body: JSON.stringify({ verdicts }),
  }).then((r) => r.verdicts);
export const commitTrainingCycle = (id: string) =>
  call<TrainingCommitResult>(`/api/foundry/training/${encodeURIComponent(id)}/commit`, { method: "POST" });

/* ── The Strips seams — code-rendered strips, triaged by hand ──────────── */

export const fetchStripRuns = () => call<{ runs: StripRunSummary[] }>("/api/foundry/strips").then((r) => r.runs);
export const fetchStripRun = (id: string) => call<StripRunDetail>(`/api/foundry/strips/${encodeURIComponent(id)}`);
export const saveStripVerdicts = (id: string, verdicts: StripVerdicts) =>
  call<{ verdicts: StripVerdicts }>(`/api/foundry/strips/${encodeURIComponent(id)}/verdicts`, {
    method: "PUT",
    body: JSON.stringify({ verdicts }),
  }).then((r) => r.verdicts);
export const previewStripCommit = (id: string) => call<StripCommitPlan>(`/api/foundry/strips/${encodeURIComponent(id)}/commit`);
export const commitStripRun = (id: string, token?: string) =>
  call<StripCommitResult>(`/api/foundry/strips/${encodeURIComponent(id)}/commit`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });

/** URL of one card's authored page — for a sandboxed iframe only. */
export function stripPageUrl(run: string, card: string): string {
  return withAccess(`/api/foundry/strips/${encodeURIComponent(run)}/page?${new URLSearchParams({ card }).toString()}`);
}

/** URL of a run file, for an <img> or a <video>. `kind` picks the output
 *  root — the forge's runs by default, the Extract module's with "extract",
 *  the Dojo's cycles with "training", the code-rendered strips with "strips". */
export function fileUrl(run: string, rel: string, kind?: "extract" | "training" | "strips"): string {
  const q = new URLSearchParams({ run, path: rel, ...(kind ? { kind } : {}) });
  return withAccess(`/api/foundry/file?${q.toString()}`);
}
