// Rule 11 · the withholding budget — `checkWithholding`. Without the campaign's
// budget page the honest verdict is "undecided", not "clean". Split out of
// `../structure.ts` (the door re-exports it).

import type { TrailerCut, WithholdingBudget } from "@/lib/script/trailer/types";
import { CITE, type StructureFinding } from "@/lib/script/trailer/structureTypes";
import { where } from "@/lib/script/trailer/readers";

/* ────────────────────── 11 · the withholding budget ───────────────────────
   "decided once, in advance, by whoever owns the work rather than by whoever is
   measured on the cut." Without that page there is nothing to audit against — and
   the honest verdict is not "clean", it is "undecided". */

export function checkWithholding(cut: TrailerCut, budget?: WithholdingBudget): StructureFinding[] {
  const out: StructureFinding[] = [];
  const spends = cut.beats.flatMap((b) => (b.spends ?? []).map((id) => [b, id] as const));

  if (!budget) {
    out.push({
      rule: "withholding", subject: "budget", verdict: "unmeasured",
      detail: `No withholding budget supplied. ${spends.length} beat(s) declare a spend. The budget is a campaign artifact written before any cutting starts and signed by whoever owns the work; without it, whether this cut spends something held is not merely unchecked, it is UNDECIDED — which is the drift the technique exists to prevent.`,
      cites: CITE.budget,
    });
    return out;
  }

  const byId = new Map(budget.assets.map((a) => [a.id, a] as const));
  for (const [b, id] of spends) {
    const asset = byId.get(id);
    if (!asset) {
      out.push({
        rule: "withholding", subject: id, verdict: "violation",
        detail: `Beat "${b.label}" spends asset "${id}", which campaign budget "${budget.campaignId}" does not list. An asset nobody budgeted is an asset nobody decided about.`,
        ...where(b), cites: CITE.graph,
      });
      continue;
    }
    if (asset.allowance === "hold") {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" puts "${asset.name}" (${asset.kind}) on screen; the budget holds it — "may not be referenced at all". Treat a change as a decision requiring the same signature the budget got.`,
        ...where(b), cites: CITE.budget,
      });
    } else if (asset.allowance === "imply") {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" shows "${asset.name}" (${asset.kind}); the budget allows it to be IMPLIED only — "may be signalled that it exists, never shown". Once the viewer has seen it in the promotion, the work has lost the first encounter it was built around.`,
        ...where(b), cites: CITE.budget,
      });
    } else if (!asset.trade) {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "violation",
        detail: `Beat "${b.label}" spends "${asset.name}" and the budget records no trade for it. "A spend with no recorded reason is a drift that has already happened."`,
        ...where(b), cites: CITE.budget,
      });
    } else {
      out.push({
        rule: "withholding", subject: asset.id, verdict: "pass",
        detail: `"${asset.name}" is allowed to be spent and the trade is recorded: ${asset.trade}`,
        ...where(b), cites: CITE.budget,
      });
    }
  }

  out.push({
    rule: "withholding", subject: "campaign drift", verdict: "unmeasured",
    detail: `The characteristic breach is campaign drift — "a later cut reveals what the first one implied" — and it "happens across rungs rather than within one". This function sees ONE cut, so it cannot see the breach the budget mainly exists to prevent. Audit the family against the same page.`,
    cites: CITE.budget,
  });

  return out;
}
