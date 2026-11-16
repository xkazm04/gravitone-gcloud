// The header needs chip's words (./FailedSlot.tsx draws them): pure, so the unit test reads exactly
// what the header would say without loading the chip's server action.
import { TONES, type Tone } from "@gt/ui/components/chip/tone.ts";
import { LOOKS, STATUS } from "@gt/ui/components/status/status.ts";

import { needsTotal } from "../projects/runs/_runs/needs.ts";
import type { NeedsFacts } from "./headerFacts.ts";

const toneOf = (role: string): Tone => TONES.find((t) => t === role) ?? "rose";

/** The chip's words, or null when nothing is drawn. */
export function needsChip(facts: NeedsFacts): { readonly label: string; readonly value: string; readonly tone: Tone; readonly name: string } | null {
  if (facts.needs === null) return { label: "failed", value: "unread", tone: "rose", name: `failed and interrupted jobs could not be read: ${facts.problems.join("; ")}` };
  const { failed, interrupted } = facts.needs;
  if (needsTotal(facts.needs) === 0) return null;
  // Words and hue from the one status vocabulary: failed is rose, interrupted amber (awaiting the
  // operator's look). With both, the chip takes failed's: a known failure outranks an unknown end.
  const present = [...(failed > 0 ? (["failed"] as const) : []), ...(interrupted > 0 ? (["interrupted"] as const) : [])];
  const first = STATUS.job[present[0] ?? "failed"];
  return {
    label: String(needsTotal(facts.needs)),
    value: present.map((s) => STATUS.job[s].label).join(" · "),
    tone: toneOf(LOOKS[first.look].role),
    name: `jobs that need you: ${present.map((s) => `${s === "failed" ? failed : interrupted} ${STATUS.job[s].label}`).join(", ")}`,
  };
}
