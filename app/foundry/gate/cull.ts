// The Cull's side of the gate kernel (./useGate.ts): which fetcher loads a run,
// how a verdict is written, and what the commit plan asks.
//
// `write` is read-fresh -> merge -> write, the same discipline as the Board's
// cull source (lib/board/sources/cull.ts): the Board or another tab may have
// decided other candidates since this tab loaded, so only the keys THIS tab
// changed are applied to the server's current map. `fetchRun` also refreshes
// the client's revision base (foundryClient.ts noteVerdicts), which is what
// lets `saveVerdicts` send a keyed PATCH rather than a whole map.

import { fromKeep } from "@/lib/board/verdicts";
import type { CommitResult, ForgeCommitPlan, RunDetail, VerdictRecord, Verdicts } from "@/lib/foundry/types";

import { commitRun, fetchRun, patchVerdictsKeepalive, previewCommit, saveVerdicts } from "../foundryClient";
import type { GateAdapter } from "./useGate";

export const cullGate: GateAdapter<RunDetail, VerdictRecord, ForgeCommitPlan, CommitResult> = {
  loadDetail: fetchRun,
  verdictsOf: (d) => d.verdicts,
  readOnlyOf: (d) => d.run.status === "committed",
  async write(id, changes) {
    const fresh = await fetchRun(id);
    const next: Verdicts = { ...fresh.verdicts };
    for (const [k, v] of changes) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    await saveVerdicts(id, next);
  },
  keepalive: (id, changes) => void patchVerdictsKeepalive("runs", id, changes, "foundry"),
  stateOf: (v) => ({ verdict: fromKeep(v), reasons: [], note: v?.note ?? null }),
  previewCommit: (id) => previewCommit(id, "reject"),
  commit: (id, token) => commitRun(id, "reject", token),
};
