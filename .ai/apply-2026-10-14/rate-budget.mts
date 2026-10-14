/* eslint-disable @typescript-eslint/no-explicit-any -- one-off A/B harness over loosely typed model JSON */
// A/B for delivery-rate-budgeting at lib/script/validate.ts::parseDraft.
// Same constructed answers through parseDraft; the verdict is accept/refuse + findings.
import { readFileSync } from "node:fs";
import { fixtureSource } from "@/app/_phases/_shared/notebook/source";
import { parseDraft, DraftError } from "@/lib/script/validate";

const base = JSON.parse(readFileSync("tests/_engine/cassettes/compose-ok.json", "utf8")).turns[0].resultJson;
const ctx = { source: fixtureSource(), scope: {}, template: "mid-educational-video", targetS: 300 };
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const spoken = (r: any) => r.beats.reduce((n: number, b: any) => n + words(b.text), 0);

function scaled(factor: number, budget?: number) {
  const o = JSON.parse(JSON.stringify(base));
  const r = o.renders[0];
  for (const b of r.beats) b.text = Array(factor).fill(b.text).join(" ");
  if (budget) r.wordBudget = budget;
  o.renders = [r];
  return o;
}
const cases: [string, any][] = [
  ["as-recorded (46 wpm, 229 words, budget 950)", { ...base, renders: [base.renders[0]] }],
  ["x2 words (92 wpm)", scaled(2)],
  ["x6 words = 1374 words in 300s (275 wpm), budget 950", scaled(6)],
  ["x6 words, budget raised to 1400 (model self-consistent but 275 wpm)", scaled(6, 1400)],
  ["x4 words = 916 (183 wpm), budget 950: inside band", scaled(4)],
  ["x5 words = 1145 (229 wpm), budget 950: over its own budget by 20%", scaled(5)],
];
for (const [label, o] of cases) {
  const w = spoken(o.renders[0]);
  try {
    const out: any = parseDraft(JSON.stringify(o), ctx as any);
    const rate = out.findings.filter((f: any) => f.rule === "rate").map((f: any) => f.verdict);
    console.log(`${label}\n   words=${w} -> ACCEPTED${rate.length ? " rate-findings=" + rate.join(",") : ""}`);
  } catch (e) {
    if (!(e instanceof DraftError)) throw e;
    console.log(`${label}\n   words=${w} -> REFUSED: ${e.message.slice(0, 140)}`);
  }
}
