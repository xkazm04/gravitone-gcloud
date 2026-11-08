import "server-only";

import { LAB_DROP_EVENT, LAB_KEEP_EVENT, LAB_SESSION_KIND, labDropKey, labKeepKey, type LabDecision, type LabProposal } from "@gt/domain/audio.yue2.lab";
import { parseLabDecision } from "@gt/domain/audio.yue2.lab.schema";
import { parseYue2PostInput } from "@gt/domain/audio.yue2.jobs.schema";
import type { Actor } from "@gt/domain/event";
import { err, ok, type Result } from "@gt/domain/errors";
import { appendOnce, hasKey } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { launchPost, launchRender, yue2JobId } from "../producers/yue2Jobs.ts";
import { reseed } from "./draw.ts";
import { findLabTurn, LAB_LANE, scanLab } from "./labRelay.ts";

// KEEP / DROP OF THE AGENT'S PROPOSALS (spark yue2-song-lab S2, WP-B). The taste chips'
// precedent: the agent only proposes; the owner's keep runs the act on the server and is recorded as
// `audio.lab.keep` (a drop as `audio.lab.drop`), both owner-only - no MCP op keeps or drops.
// launch -> lib/producers/yue2Jobs launchRender; post -> launchPost (one job per take); rule ->
// lib/yue2/draw reseed. A second keep of one proposal is a conflict; a kept proposal cannot be dropped.
//
// THE ACT RUNS FIRST. A refused act records nothing and its refusal is returned verbatim. A keep's jobs
// have ids derived from the proposal (`lab-<proposalId>`, `lab-<proposalId>-<n>` per post take), so a
// keep retried after a failure part-way finds the jobs it already enqueued instead of enqueuing twice.
// `started` is the one job id, the post jobs as a range (`job:yue2-post:lab-<id>-1..<n>`; the decision
// door holds `started` to 120 characters), or the draw version (`draw:<drawId>:v<version>`).

export type DecisionState = "kept" | "dropped";

const jobExists = (store: Store, jobId: string): Result<boolean> => store.read((r) => r.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined);

/** Launch one job under a key derived from the proposal, unless a retried keep already enqueued it. */
function launchOnce(store: Store, producer: "yue2-render" | "yue2-post", key: string, run: () => Result<{ readonly jobId: string }>): Result<string> {
  const jobId = yue2JobId(producer, key);
  const there = jobExists(store, jobId);
  if (!there.ok) return there;
  if (there.value) return ok(jobId);
  const r = run();
  return r.ok ? ok(r.value.jobId) : r;
}

async function act(store: Store, p: LabProposal, actor: Actor): Promise<Result<string>> {
  if (p.kind === "launch") {
    const key = `lab-${p.id}`;
    return launchOnce(store, "yue2-render", key, () => launchRender(store, { ...p.launch, origin: "lab" }, { actor, key }));
  }
  if (p.kind === "post") {
    const inputs = p.post.takeIds.map((takeId) => ({ takeId, stages: p.post.stages, ...(p.post.referenceTakeId === undefined ? {} : { referenceTakeId: p.post.referenceTakeId }), op: "chain", origin: "lab" }));
    // Every take's chain is read before the first is enqueued: a bad one refuses the keep whole.
    for (const i of inputs) {
      const v = parseYue2PostInput(i);
      if (!v.ok) return v;
    }
    const ids: string[] = [];
    for (const [n, i] of inputs.entries()) {
      const key = `lab-${p.id}-${n + 1}`;
      const r = launchOnce(store, "yue2-post", key, () => launchPost(store, i, { actor, key }));
      if (!r.ok) return r;
      ids.push(r.value);
    }
    return ok(ids.length === 1 ? (ids[0] ?? "") : `${yue2JobId("yue2-post", `lab-${p.id}`)}-1..${ids.length}`);
  }
  const d = await reseed(store, p.rule.drawId, p.rule.rules, actor);
  return d.ok ? ok(`draw:${d.value.drawId}:v${d.value.version}`) : d;
}

type Held = { readonly session: string; readonly proposal: LabProposal };

function proposalOf(store: Store, input: { readonly turnId: string; readonly proposalId: string }): Result<Held> {
  const turn = findLabTurn(store, input.turnId);
  if (!turn.ok) return turn;
  const proposal = turn.value.proposals.find((p) => p.id === input.proposalId);
  return proposal === undefined ? err("not-found", `song lab: turn ${input.turnId} holds no proposal ${input.proposalId}`) : ok({ session: turn.value.session, proposal });
}

function stateOf(store: Store, proposalId: string): Result<DecisionState | undefined> {
  const kept = hasKey(store, labKeepKey(proposalId));
  if (!kept.ok) return kept;
  if (kept.value) return ok("kept");
  const dropped = hasKey(store, labDropKey(proposalId));
  if (!dropped.ok) return dropped;
  return ok(dropped.value ? "dropped" : undefined);
}

function record(store: Store, type: typeof LAB_KEEP_EVENT | typeof LAB_DROP_EVENT, session: string, raw: LabDecision, actor: Actor): Result<LabDecision> {
  const d = parseLabDecision(raw);
  if (!d.ok) return d;
  const key = type === LAB_KEEP_EVENT ? labKeepKey(d.value.proposalId) : labDropKey(d.value.proposalId);
  const appended = store.tx((t) => appendOnce(t, { actor, type, lane: LAB_LANE, key, subject: { kind: LAB_SESSION_KIND, id: session }, data: { ...d.value } }));
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `song lab: proposal ${d.value.proposalId} was already ${type === LAB_KEEP_EVENT ? "kept" : "removed"}`);
  return ok(d.value);
}

export async function keepProposal(store: Store, input: { readonly turnId: string; readonly proposalId: string }, actor: Actor): Promise<Result<LabDecision>> {
  const held = proposalOf(store, input);
  if (!held.ok) return held;
  const state = stateOf(store, input.proposalId);
  if (!state.ok) return state;
  if (state.value === "kept") return err("conflict", `song lab: proposal ${input.proposalId} is already kept`);
  if (state.value === "dropped") return err("refused", `song lab: proposal ${input.proposalId} was removed; ask for it again`);
  const started = await act(store, held.value.proposal, actor);
  if (!started.ok) return started;
  return record(store, LAB_KEEP_EVENT, held.value.session, { turnId: input.turnId, proposalId: input.proposalId, started: started.value }, actor);
}

export function dropProposal(store: Store, input: { readonly turnId: string; readonly proposalId: string }, actor: Actor): Result<LabDecision> {
  const held = proposalOf(store, input);
  if (!held.ok) return held;
  const state = stateOf(store, input.proposalId);
  if (!state.ok) return state;
  if (state.value === "kept") return err("refused", `song lab: proposal ${input.proposalId} is kept and its act has started; a kept proposal cannot be removed`);
  return record(store, LAB_DROP_EVENT, held.value.session, { turnId: input.turnId, proposalId: input.proposalId }, actor);
}

/** Every proposal's decision so far, by proposal id. */
export function decisions(store: Store): Result<Readonly<Record<string, DecisionState>>> {
  const all = scanLab(store, [LAB_KEEP_EVENT, LAB_DROP_EVENT]);
  if (!all.ok) return all;
  const out: Record<string, DecisionState> = {};
  for (const e of all.value) {
    const d = parseLabDecision(e.data);
    if (!d.ok) continue;
    // A keep outranks a drop (a drop after a keep is refused, so both only meet in a hand-edited ledger).
    if (e.type === LAB_KEEP_EVENT) out[d.value.proposalId] = "kept";
    else if (out[d.value.proposalId] === undefined) out[d.value.proposalId] = "dropped";
  }
  return ok(out);
}
