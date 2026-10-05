// THE SOUND LAB'S CLASS LISTS — one spelling of the lab's type and surfaces,
// read by the shell and all three modules (triage · arrange · hunt). Carried
// over from the round-3 lab (its parts.tsx, retired in round 4), which drew
// them off the baseline pages: /projects' race sheet and /library's atelier —
// glass on white/8 hairlines, cyan for what is selected or playing, emerald /
// amber / rose for a verdict. No colour literal here: Tailwind palette classes
// only, as the rest of the repo spells them (components/ui/tokens.ts owns the
// rest).

import type { Verdict } from "@/lib/sound/types";

/** Small mono caps label — the only place uppercase tracking is used. */
export const CAPS = "font-jetbrains text-label uppercase tracking-[0.14em] text-white/40";
/** A nested card inside a <Panel>. */
export const CARD = "rounded-xl border border-white/8 bg-white/[0.025]";
/** A text field. */
export const FIELD =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-hanken text-label text-slate-200 placeholder:text-white/25 focus:border-cyan-400/40";

const BTN_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-1.5 font-jetbrains text-label transition disabled:cursor-not-allowed disabled:opacity-40";
export const BTN = `${BTN_BASE} border-white/12 text-white/75 hover:border-white/25 hover:bg-white/[0.05] hover:text-white`;
export const BTN_CYAN = `${BTN_BASE} border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20`;
export const BTN_KEEP = `${BTN_BASE} border-emerald-400/35 text-emerald-100 hover:bg-emerald-400/12`;
export const BTN_REJECT = `${BTN_BASE} border-rose-400/35 text-rose-100 hover:bg-rose-400/12`;

/** A pill that toggles (a technique, a defect, a facet). `on` is the cyan ring. */
export const pill = (on: boolean, tone: "cyan" | "rose" = "cyan") =>
  `inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-hanken text-label transition ${
    on
      ? tone === "rose"
        ? "border-rose-400/50 bg-rose-400/12 text-rose-100"
        : "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
      : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white"
  }`;

/** A verdict's word, text tone, dot and ring. `proven` is read, never stored
 *  (lib/sound/types.ts#Verdict): a kept take whose mean is 7 or more. */
export const VERDICT_TONE: Record<Verdict | "proven", { word: string; text: string; dot: string; ring: string }> = {
  proven: { word: "proven", text: "text-emerald-300", dot: "bg-emerald-300", ring: "border-emerald-400/40" },
  kept: { word: "kept", text: "text-emerald-200/80", dot: "bg-emerald-400/70", ring: "border-emerald-400/30" },
  unjudged: { word: "unjudged", text: "text-amber-300", dot: "bg-amber-400", ring: "border-amber-400/35" },
  rejected: { word: "rejected", text: "text-rose-300", dot: "bg-rose-400", ring: "border-rose-400/35" },
};
