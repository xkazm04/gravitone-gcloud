// The /foundry page's only way to the disk: the /api/foundry/* seams.
//
// Same access header as every other gated route (lib/imagingClient.ts), and
// for <img> tags — which cannot carry a header — the same credential as a
// query parameter, through `withAccess` (see app/api/foundry/file/route.ts).

import { accessHeader, withAccess } from "@/lib/imagingClient";
import type { AdoptionDraft } from "@/lib/foundry/adopt";
import type { Catalogue, CommitResult, ForgeCommitPlan, RunDetail, RunSummary, Verdicts } from "@/lib/foundry/types";
import type { StripCommitPlan, StripCommitResult, StripRunDetail, StripRunSummary } from "@/lib/foundry/strips/triage";
import type { StripVerdicts } from "@/lib/foundry/strips/types";
import type { TrainingCommitResult, TrainingCycleDetail, TrainingCycleSummary, TrainingVerdicts } from "@/lib/foundry/training/types";

export class FoundryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A stale-base 409 from a verdicts PATCH carries the revision to retry on. */
    readonly rev?: number,
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
  if (!res.ok) {
    const rev = (json as { rev?: unknown }).rev;
    throw new FoundryRequestError((json as { detail?: string }).detail ?? `HTTP ${res.status}`, res.status, typeof rev === "number" ? rev : undefined);
  }
  return json as T;
}

/* ── Verdicts: keyed PATCHes on a revision ──────────────────────────────────
 *
 * Every gate's verdict map used to be written whole (PUT), so two tabs, or a
 * tab and the Board, were last-writer-wins. The client now remembers the
 * (revision, map) each detail fetch returned and sends only the keys that
 * differ from it, against that revision (lib/foundry/verdictLog.ts). A stale
 * base comes back 409 with the current revision; the change is keyed, so it is
 * retried once on that revision: it can only overwrite the keys it names. */

type VerdictKind = "runs" | "extract" | "training" | "strips";
interface VerdictSnapshot {
  rev: number;
  verdicts: Record<string, unknown>;
}
const synced = new Map<string, VerdictSnapshot>();
const syncKey = (kind: VerdictKind, id: string) => `${kind}/${id}`;

/** Remember a fetched detail's verdicts and revision (a missing rev is 0). */
export function noteVerdicts<T extends { rev?: number; verdicts: object }>(kind: VerdictKind, id: string, detail: T): T {
  // Invariant: every detail route returns `verdicts` as a plain keyed map.
  synced.set(syncKey(kind, id), { rev: detail.rev ?? 0, verdicts: detail.verdicts as Record<string, unknown> });
  return detail;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One save at a time per gate. The diff is computed against `synced`, which
 *  only advances when a response lands; with two saves in flight both diffed
 *  against the same base, so a clear (U) right after a set (K) diffed to
 *  nothing and was dropped while the set went through: the candidate came back
 *  as kept. Chaining makes each diff start from what the previous save stored,
 *  and arrival order equal issue order. */
const saveChain = new Map<string, Promise<unknown>>();

/** Save `next` as the keyed diff against the last map this client saw. */
export function patchVerdictsTo<V>(kind: VerdictKind, id: string, next: Record<string, V>, surface: string): Promise<Record<string, V>> {
  const key = syncKey(kind, id);
  const prev = saveChain.get(key) ?? Promise.resolve();
  // A failed earlier save must not poison the later one; it reports to its own caller.
  const run = prev.catch(() => undefined).then(() => patchVerdictsNow(kind, id, next, surface));
  saveChain.set(key, run);
  void run.catch(() => undefined).then(() => {
    if (saveChain.get(key) === run) saveChain.delete(key);
  });
  return run;
}

async function patchVerdictsNow<V>(kind: VerdictKind, id: string, next: Record<string, V>, surface: string): Promise<Record<string, V>> {
  const key = syncKey(kind, id);
  let base = synced.get(key);
  if (!base) {
    // Never fetched here: take the server's map as the base, so only this
    // edit's keys are named.
    noteVerdicts(kind, id, await call<{ rev?: number; verdicts: object }>(`/api/foundry/${kind}/${encodeURIComponent(id)}`));
    base = synced.get(key)!;
  }
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) if (!(k in base.verdicts) || !sameJson(base.verdicts[k], v)) set[k] = v;
  const clear = Object.keys(base.verdicts).filter((k) => !(k in next));
  if (!Object.keys(set).length && !clear.length) return base.verdicts as Record<string, V>;

  const send = (baseRev: number) =>
    call<{ rev: number; verdicts: Record<string, V> }>(`/api/foundry/${kind}/${encodeURIComponent(id)}/verdicts`, {
      method: "PATCH",
      body: JSON.stringify({ set, clear, baseRev, by: "human", surface }),
    });
  let state: { rev: number; verdicts: Record<string, V> };
  try {
    state = await send(base.rev);
  } catch (e) {
    if (!(e instanceof FoundryRequestError) || e.status !== 409 || e.rev === undefined) throw e;
    state = await send(e.rev);
  }
  synced.set(key, { rev: state.rev, verdicts: state.verdicts });
  return state.verdicts;
}

export const fetchRuns = () => call<{ runs: RunSummary[] }>("/api/foundry/runs").then((r) => r.runs);
export const fetchRun = (id: string) => call<RunDetail>(`/api/foundry/runs/${encodeURIComponent(id)}`).then((d) => noteVerdicts("runs", id, d));
export const fetchCatalogue = () => call<Catalogue>("/api/foundry/styles");
export const adoptStyle = (id: string) =>
  call<AdoptionDraft>(`/api/foundry/styles/${encodeURIComponent(id)}/adopt`, { method: "POST" });
export const saveVerdicts = (id: string, verdicts: Verdicts, surface = "foundry") =>
  patchVerdictsTo("runs", id, verdicts, surface).then(() => ({ ok: true as const }));
export const previewCommit = (id: string, undecidedAs: "reject" | "leave" = "reject") =>
  call<ForgeCommitPlan>(`/api/foundry/runs/${encodeURIComponent(id)}/commit?undecidedAs=${undecidedAs}`);
export const commitRun = (id: string, undecidedAs: "reject" | "leave" = "reject", token?: string) =>
  call<CommitResult>(`/api/foundry/runs/${encodeURIComponent(id)}/commit`, {
    method: "POST",
    body: JSON.stringify({ undecidedAs, token }),
  });

/* ── The Dojo's seams — the training loop's cycles, gated by hand ────────── */

export const fetchTrainingCycles = () => call<{ cycles: TrainingCycleSummary[] }>("/api/foundry/training").then((r) => r.cycles);
export const fetchTrainingCycle = (id: string) =>
  call<TrainingCycleDetail>(`/api/foundry/training/${encodeURIComponent(id)}`).then((d) => noteVerdicts("training", id, d));
export const saveTrainingVerdicts = (id: string, verdicts: TrainingVerdicts, surface = "foundry") =>
  patchVerdictsTo("training", id, verdicts, surface);
export const commitTrainingCycle = (id: string) =>
  call<TrainingCommitResult>(`/api/foundry/training/${encodeURIComponent(id)}/commit`, { method: "POST" });

/* ── The Strips seams — code-rendered strips, triaged by hand ──────────── */

export const fetchStripRuns = () => call<{ runs: StripRunSummary[] }>("/api/foundry/strips").then((r) => r.runs);
export const fetchStripRun = (id: string) =>
  call<StripRunDetail>(`/api/foundry/strips/${encodeURIComponent(id)}`).then((d) => noteVerdicts("strips", id, d));
export const saveStripVerdicts = (id: string, verdicts: StripVerdicts, surface = "foundry") =>
  patchVerdictsTo("strips", id, verdicts, surface);
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
