// THE LEDGER'S GROUPING — the recipe, family and effect-category groupings the
// ledger can sort its rows under, and the tags a row carries. Split out of
// book.ts. Moved verbatim.
import { refById } from "./audioRefs";
import type { Take } from "./take";

/* ── the ledger's grouping ─────────────────────────────────────────────── */

export const ROUNDS: Record<string, { s: string; retired: boolean; label: string }> = {
  round1: { s: "r1 fft", retired: false, label: "round 1 · fft autocorr" },
  round2: { s: "r2 librosa", retired: false, label: "round 2 · librosa" },
  round3: { s: "r3 cloud", retired: true, label: "round 3 · cloud read" },
};

export const roundOf = (k: string) => ROUNDS[k.slice(0, 6)] ?? { s: k, retired: false, label: k };

const FAMILY: Record<string, string> = {
  "nu-disco": "House & disco",
  "80s french touch": "House & disco",
  "deep house": "House & disco",
  "melodic house": "House & disco",
  "progressive house": "House & disco",
  "organic house": "House & disco",
  synthwave: "Synth & retro",
  "retro electronic": "Synth & retro",
  outrun: "Synth & retro",
  "future bass": "Bass music",
  "melodic dubstep": "Bass music",
  chillstep: "Bass music",
  "drum and bass": "Bass music",
  "liquid dnb": "Bass music",
  trap: "Bass music",
  "dark trap": "Bass music",
  "808-driven": "Bass music",
  "boom bap": "Hip hop & downtempo",
  "jazz rap": "Hip hop & downtempo",
  "golden age hip hop": "Hip hop & downtempo",
  "lo-fi hip hop": "Hip hop & downtempo",
  "dusty sample": "Hip hop & downtempo",
  "trip hop": "Hip hop & downtempo",
  downtempo: "Hip hop & downtempo",
  "ambient drone": "Ambient & cinematic",
  textural: "Ambient & cinematic",
  "cinematic ambient": "Ambient & cinematic",
  "orchestral-electronic": "Ambient & cinematic",
};

export function recipeOf(t: Take): string {
  if (t.kind === "sfx") return `Effects · ${t.draft_id ? "drafted" : "no recipe"}`;
  if (t.draft_id) return "Draft returns";
  if (t.reference_track_id) {
    const r = refById(t.reference_track_id);
    return `Ref · ${r ? `${r.artist} — ${r.title}` : t.reference_track_id}`;
  }
  if (t.prompt_round) return `Round · ${roundOf(t.prompt_round).label}`;
  return t.parent_id ? "Returns" : "Hand prompt";
}

export type Grouping = "none" | "recipe" | "family" | "sfx";

export function groupOf(t: Take, g: Grouping): string | null {
  if (g === "recipe") return recipeOf(t);
  if (g === "family") return t.kind === "sfx" ? "Effects" : (FAMILY[t.genre_tags[0] ?? ""] ?? "Other");
  if (g === "sfx") return t.kind === "sfx" ? (t.sfx_category ?? "uncategorized") : "Tracks";
  return null;
}

export function tagsOf(t: Take): string[] {
  return t.kind === "sfx"
    ? [t.sfx_category ?? "", ...(t.loopable ? ["loop"] : [])].filter(Boolean)
    : [...t.genre_tags, ...t.mood_tags, ...t.instrumentation];
}
