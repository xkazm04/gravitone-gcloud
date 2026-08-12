// REGRESSION CONTROL for the render-boundary gate (app/_phases/script/gate.ts).
//
// Run:  npx tsx pipeline/gate-regression.mts
//
// Case 1 is the whole reason the gate exists. On 2026-08-11 a render shipped
// the sentence "So when Treasury yields climbed... Bitcoin was sold" against a
// notebook constraint reading "phrase as 'moves with', not 'because of'". It
// was caught by an agent working on a DIFFERENT step; none of the render's own
// twelve self-checks could catch it, because every one was a sentence a human
// wrote about the render rather than a function that read it.
//
// Case 2 is the correction that replaced it, and it must PASS. A gate that
// flags the fix as the defect trains its user to ignore it.
import { checkConstraints, PROBES } from "../app/_phases/script/gate";
import { UNKNOWN_BY_ID } from "../app/_phases/_shared/notebook/notebook";
import type { ScriptRender } from "../app/_phases/script/types";
const unknowns = Object.values(UNKNOWN_BY_ID);
const mk = (text: string) => ({ id:"t", beats:[{ at:"3:10", kind:"movement", connector:null, label:"m3", text }] } as unknown as ScriptRender);

const cases: [string,string,boolean][] = [
  ["THE SHIPPED VIOLATION (2026-08-11)", "So when Treasury yields climbed toward four and a half percent, Bitcoin was sold.", true],
  ["the correction that replaced it",    "So as Treasury yields climbed toward four and a half percent, Bitcoin moved with them — downward. Not because a bond yield reaches into a blockchain, but because portfolio construction did.", false],
  ["forbidden vendor figure",            "Liquidity is down 93% and spreads are 7.6x wider than last year.", true],
  ["forbidden spot price",               "Bitcoin now trades at $63,400, down from its high.", true],
];
let bad = 0;
for (const [name, text, shouldTrip] of cases) {
  const v = checkConstraints(mk(text), unknowns, PROBES).filter(f => f.verdict === "violation");
  const ok = shouldTrip ? v.length > 0 : v.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${shouldTrip ? "must trip " : "must pass "} · ${name}`);
  v.forEach(f => console.log(`         → ${f.subject}: ${f.detail.slice(0,110)}`));
}
console.log(bad ? `\n${bad} REGRESSION FAILURE(S)` : "\nall regression cases behave correctly");
