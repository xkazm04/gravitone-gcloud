import "server-only";

import type { AdScenario } from "@/lib/ads/types";
import type { ScriptRender } from "@/lib/script/types";
import { BASELINE, type Note, type Version } from "@/lib/script/versions";
import { derive, newLog, type CutLog } from "@/lib/script/trailer/ops";
import type { TrailerCut, WithholdingBudget } from "@/lib/script/trailer/types";

import type { ScriptRec } from "./fixtureScript.ts";
import { obj, str, written, type Obj, type Recs } from "./realRecs.ts";

// THE SCRIPT PART ON THE REAL SIDE (L36; split out of ./real.ts by L43): the step records the
// kernel holds (script-adopted, script-versions, script-trailer, ads-scenarios) to and from the
// working record L38's ./fixtureScript.ts reasons in.

export function scriptOf(recs: Recs): ScriptRec {
  const sv = recs.get("script-versions");
  const st = recs.get("script-trailer");
  const as = recs.get("ads-scenarios");
  const engine = obj(sv?.["engine"]);
  const adsEngine = obj(as?.["engine"]);
  const staged = obj(sv?.["staged"]);
  const cut: CutLog | null =
    st === undefined ? null : obj(st["origin"]) !== undefined ? written<CutLog>({ origin: st["origin"], originBudget: st["originBudget"], ops: st["ops"] ?? [], head: st["head"] ?? 0 }) : newLog(written<TrailerCut>(st["cut"]), written<WithholdingBudget>(st["budget"]));
  return {
    candidates: written<readonly ScriptRender[]>(sv?.["candidates"] ?? []),
    adopted: str(recs.get("script-adopted")?.["renderId"]) || null,
    ...(engine === undefined ? {} : { engine: written<NonNullable<ScriptRec["engine"]>>(engine) }),
    notes: written<readonly Note[]>(sv?.["notes"] ?? []),
    // v1 never stored the baseline (ScriptVersionsData.accepted); it is dealt first on read.
    accepted: [BASELINE, ...written<readonly Version[]>(sv?.["accepted"] ?? []).filter((v) => v.id !== BASELINE.id)],
    staged: staged === undefined ? null : written<Version>(staged),
    cut,
    spineKey: str(st?.["spineKey"]) ?? null,
    scenarios: written<readonly AdScenario[]>(as?.["options"] ?? []),
    scenariosIdea: str(as?.["ideaId"]) ?? null,
    picked: str(as?.["pickedId"]) ?? null,
    ...(adsEngine === undefined ? {} : { adsEngine: written<NonNullable<ScriptRec["adsEngine"]>>(adsEngine) }),
  };
}

export function scriptRecords(s: ScriptRec): Record<string, Obj> {
  const out: Record<string, Obj> = {
    "script-adopted": { renderId: s.adopted ?? "" },
    "script-versions": { notes: s.notes, accepted: s.accepted.filter((v) => v.id !== BASELINE.id), ...(s.staged === null ? {} : { staged: s.staged }), candidates: s.candidates, engine: s.engine ?? null },
    "ads-scenarios": { ideaId: s.scenariosIdea, options: s.scenarios, pickedId: s.picked, engine: s.adsEngine ?? null },
  };
  if (s.cut !== null) {
    const d = derive(s.cut);
    out["script-trailer"] = { cut: d.cut, budget: d.budget, origin: s.cut.origin, originBudget: s.cut.originBudget, ops: s.cut.ops, head: s.cut.head, ...(s.spineKey === null ? {} : { spineKey: s.spineKey }) };
  }
  return out;
}
