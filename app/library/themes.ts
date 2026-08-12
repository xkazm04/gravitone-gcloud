// The style library — the mocked nouns of theme onboarding.
//
// A THEME is a locked visual identity: the four-slot style block (technique /
// subject treatment / named palette / finish), the element vocabulary it
// covers, and a reference sheet of proofs the user approved. The research
// batch's one non-negotiable: style is an APPROVED ARTIFACT, not a prompt
// suffix — you generate proofs, the user approves them, and only then is the
// look locked. A locked theme is the gate every project creation stands behind.
//
// Provenance is part of the record on purpose: the brief goes to Claude, which
// writes the style block; the block goes to Leonardo (test) / Nano Banana
// (prod), which renders the proofs; the user approves. Each hop is a fact a
// surface can show.
//
// Fixture data, deliberately uneven — one theme locked, one mid-proofing with
// a rejected proof, one still just words.

export type ThemeStatus = "draft" | "proofing" | "locked";
export type ThemeOrigin = "scratch" | "preset" | "screenshot";

export const STATUS_WORD: Record<ThemeStatus, string> = {
  draft: "still words",
  proofing: "proofing",
  locked: "locked",
};

export const ORIGIN_WORD: Record<ThemeOrigin, string> = {
  scratch: "from a brief",
  preset: "from a preset",
  screenshot: "from a screenshot",
};

/** The four-slot style grammar. Human vocabulary; compiled to model syntax
 *  only at generation time — the slots are what the user edits. */
export interface StyleBlock {
  technique: string;
  subject: string;
  /** Exactly three named colours. Names are part of the prompt; hex is ours. */
  palette: { name: string; hex: string }[];
  finish: string;
}

export type ProofState = "pending" | "approved" | "rejected";

/** One rendered reference — a plate on the theme's proof sheet. */
export interface Proof {
  id: string;
  /** Which element of the vocabulary this proof exercises. */
  label: string;
  /** Gradient mock, same idiom as FrameCandidate.tone. */
  tone: string;
  state: ProofState;
  note?: string;
}

export interface Theme {
  id: string;
  name: string;
  origin: ThemeOrigin;
  status: ThemeStatus;
  block: StyleBlock;
  /** The element vocabulary this theme has proofs for. */
  elements: string[];
  /** The reference sheet. Cap is 14 — the model's reference-image window. */
  proofs: Proof[];
  /** The compiled style block, as the model receives it. Claude's output. */
  promptText: string;
  usedBy: number;
  updated: string;
}

/** Reference-image window of the production model (Nano Banana Pro). */
export const PROOF_CAP = 14;

/* ── Presets ──────────────────────────────────────────────────────────────── */

export interface Preset {
  id: string;
  name: string;
  line: string;
  tone: string;
}

export const PRESETS: Preset[] = [
  { id: "flat-vector", name: "Flat vector", line: "hard shapes, no gradients, editorial confidence", tone: "from-cyan-900/70 via-slate-900 to-slate-950" },
  { id: "paper-cutout", name: "Paper cutout", line: "layered collage, torn edges, drop shadows", tone: "from-amber-950/70 via-slate-900 to-slate-950" },
  { id: "isometric", name: "Isometric", line: "30° worlds, systems drawn as little machines", tone: "from-indigo-950 via-slate-900 to-slate-950" },
  { id: "whiteboard", name: "Whiteboard", line: "marker lines, hand-drawn arrows, live thinking", tone: "from-slate-800 via-slate-900 to-black" },
  { id: "low-poly", name: "Low poly", line: "faceted forms, dusk light, quiet depth", tone: "from-violet-950/80 via-slate-900 to-slate-950" },
  { id: "chalk", name: "Chalk", line: "lecture-hall blackboard, dust and underlines", tone: "from-emerald-950/60 via-slate-900 to-slate-950" },
];

/* ── The element vocabulary a theme can cover ─────────────────────────────── */

export const ELEMENTS = ["charts", "maps", "timelines", "icons", "diagrams", "captions"] as const;

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

export const THEMES: Theme[] = [
  {
    id: "th-1",
    name: "Signal Ledger",
    origin: "preset",
    status: "locked",
    block: {
      technique: "flat vector plates with one drawn data layer",
      subject: "objects as diagrams — the thing and its numbers share the frame",
      palette: [
        { name: "harbor cyan", hex: "#67e8f9" },
        { name: "paper cream", hex: "#f5efe0" },
        { name: "ink navy", hex: "#0b1b2b" },
      ],
      finish: "matte, hairline rules, generous margins",
    },
    elements: ["charts", "maps", "timelines", "captions"],
    proofs: [
      { id: "pr-1a", label: "chart plate", tone: "from-cyan-900/70 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-1b", label: "map plate", tone: "from-cyan-950 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-1c", label: "timeline plate", tone: "from-sky-950 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-1d", label: "icon row", tone: "from-cyan-900/50 via-slate-900 to-black", state: "approved" },
      { id: "pr-1e", label: "caption card", tone: "from-slate-800 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-1f", label: "full frame", tone: "from-cyan-950 via-slate-950 to-black", state: "approved", note: "the proof that sold the lock" },
    ],
    promptText:
      "Flat vector illustration. Objects drawn as diagrams; data shares the frame with the thing it measures. Palette strictly harbor cyan, paper cream, ink navy. Matte finish, hairline rules, generous margins. No gradients, no photographic texture.",
    usedBy: 2,
    updated: "Aug 9",
  },
  {
    id: "th-2",
    name: "Newsprint Cutout",
    origin: "screenshot",
    status: "proofing",
    block: {
      technique: "cutout collage over flat colour fields",
      subject: "grayscale photographic subjects, colour reserved for meaning",
      palette: [
        { name: "coral", hex: "#ff6f61" },
        { name: "navy", hex: "#1f2a44" },
        { name: "cream", hex: "#f2ead9" },
      ],
      finish: "paper grain, hard shadows, halftone at 30%",
    },
    elements: ["charts", "icons", "captions"],
    proofs: [
      { id: "pr-2a", label: "chart plate", tone: "from-rose-950/60 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-2b", label: "icon row", tone: "from-slate-800 via-slate-900 to-slate-950", state: "approved" },
      { id: "pr-2c", label: "caption card", tone: "from-rose-900/50 via-slate-900 to-black", state: "rejected", note: "coral drifted to red — regenerate with the block restated, not just the reference attached" },
      { id: "pr-2d", label: "full frame", tone: "from-amber-950/50 via-slate-900 to-slate-950", state: "pending" },
    ],
    promptText:
      "Modern collage. Real cutout photos in grayscale against flat coral, navy and cream fields. Colour only where it carries meaning. Paper grain, hard shadows, halftone texture at 30%.",
    usedBy: 0,
    updated: "today",
  },
  {
    id: "th-3",
    name: "Chalk Argument",
    origin: "scratch",
    status: "draft",
    block: {
      technique: "blackboard chalk, drawn live — strokes keep their order",
      subject: "claims underlined, numbers boxed, arrows do the arguing",
      palette: [
        { name: "chalk white", hex: "#e8e6df" },
        { name: "board green", hex: "#1d3a32" },
        { name: "mark yellow", hex: "#e3c96b" },
      ],
      finish: "dust, smudge ghosts of erased lines",
    },
    elements: ["diagrams", "timelines"],
    proofs: [],
    promptText:
      "Blackboard chalk illustration. Claims underlined, key numbers boxed, arrows carry the argument. Chalk white and mark yellow on board green. Visible dust and the ghosts of erased lines.",
    usedBy: 0,
    updated: "today",
  },
];

/* ── Derived facts the surfaces read ──────────────────────────────────────── */

export const themeById = new Map(THEMES.map((t) => [t.id, t]));

export function lockedCount(themes: Theme[] = THEMES): number {
  return themes.filter((t) => t.status === "locked").length;
}

/** A theme can lock when every proof on the sheet is approved and there is
 *  at least one proof per declared element. Mock keeps the first clause only. */
export function canLock(t: Theme): boolean {
  return t.status !== "locked" && t.proofs.length > 0 && t.proofs.every((p) => p.state === "approved");
}

export function approvedCount(t: Theme): number {
  return t.proofs.filter((p) => p.state === "approved").length;
}
