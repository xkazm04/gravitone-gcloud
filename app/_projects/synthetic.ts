// `?seed=N` — a synthetic shelf, in memory only, to prove the /projects variants
// at volume (platform-consolidation WP2: "scaling to hundreds of projects").
//
// NEVER WRITTEN. These rows are merged into the view's list and nothing else:
// no IndexedDB, no localStorage flag, nothing a reload keeps. The host refuses
// them in a production build (`process.env.NODE_ENV`, inlined by Next at build
// time, so the branch is dead code there).
//
// Deterministic: the same N gives the same shelf on every load, so a screenshot
// and a DOM count taken twice measure the same thing.

import {
  DISCIPLINES,
  PHASES,
  TEMPLATES,
  TEMPLATE_FAMILY,
  emptyProgress,
  type PhaseState,
  type Project,
} from "@/lib/projects";

export const SYNTH_ID = "syn-";

export function isSynthetic(p: { id: string }): boolean {
  return p.id.startsWith(SYNTH_ID);
}

/** mulberry32 — small, seedable, good enough to scatter fixture rows. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOUNS = [
  "Harbor", "Ledger", "Orbit", "Tide", "Signal", "Furnace", "Atlas", "Meridian", "Quarry", "Lantern",
  "Glacier", "Circuit", "Canopy", "Relay", "Basin", "Summit", "Archive", "Comet", "Delta", "Engine",
];
const ADJ = [
  "Glass", "Quiet", "Iron", "Paper", "Hollow", "Bright", "Salt", "Silent", "Copper", "Northern",
  "Broken", "Second", "Last", "Open", "Slow", "Hidden",
];

const DAY = 24 * 60 * 60 * 1000;
const MAX = 2000;

export function syntheticProjects(n: number, uid: string, now: number = Date.now()): Project[] {
  const count = Math.max(0, Math.min(MAX, Math.floor(n)));
  const r = rng(count * 7919 + 13);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const out: Project[] = [];
  for (let i = 0; i < count; i++) {
    const discipline = pick(DISCIPLINES);
    const tpl = pick(TEMPLATES.filter((t) => TEMPLATE_FAMILY[t.id] === discipline));
    // The furthest step anything reached, then the word that step reports.
    // Weighted towards the early steps — a real shelf has more starts than finishes.
    const progress = emptyProgress();
    const roll = r();
    const head = roll < 0.14 ? -1 : roll > 0.93 ? PHASES.length : Math.floor(r() * r() * PHASES.length);
    PHASES.forEach((k, j) => {
      if (j < head) progress[k] = r() < 0.85 ? "done" : "working";
      else if (j === head) progress[k] = pick<PhaseState>(["working", "working", "review", "blocked", "empty"]);
    });
    const created = now - Math.floor(r() * 120 * DAY);
    out.push({
      id: `${SYNTH_ID}${String(i + 1).padStart(4, "0")}`,
      uid,
      title: `${pick(ADJ)} ${pick(NOUNS)} ${i + 1}`,
      logline: "",
      template: tpl.id,
      discipline,
      targetS: tpl.defaultS,
      createdAt: created,
      updatedAt: created + Math.floor(r() * (now - created)),
      phase: PHASES[Math.max(0, Math.min(PHASES.length - 1, head))],
      progress,
    });
  }
  return out;
}
