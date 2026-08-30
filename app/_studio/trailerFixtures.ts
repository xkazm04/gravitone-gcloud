// FIXTURE — the Glass Harbor trailer's cue, withholding budget and beat slots.
//
// n=0. Nothing here was torn down, timed or measured; it is hand-written in
// the shape a model would emit from `pipeline/BEATS-PROMPT.md` for the seed
// project's logline —
//
//   "A crew that never breaks in — they wait for the one door every city
//    leaves unlocked."
//
// — with `template: trailer`, `targetS: 120`. It exists so the Research step's
// beat-variant board (app/_phases/research/beats/) has something honest to
// draw before a model is wired in, and so the composed spine is typed in
// Script's own vocabulary (app/_phases/script/trailer/types.ts) rather than an
// ad-hoc shape the board would have to translate later.
//
// Every beat kind below is legal for its movement role per
// `structure.ts#LEGAL_KINDS`; every `cueMark` names a section of the cue; every
// `spends` names a budget asset. The regression control for the checker is
// pipeline/trailer-structure-regression.mts — this file is data, not a claim.

import type { BeatSlot } from "../_phases/research/beats/beats";
import type { Cue, TrailerBeat, WithholdingBudget } from "../_phases/script/trailer/types";

/* ───────────────────────────────── the cue ───────────────────────────────────
   Sections in CueSectionKind order. `isBoundary` is where the music BREATHES —
   a place a reset can land — and it is marked honestly: the response and the
   peak run through without a rest, so a stop in either would read as a
   dropout (dynamic-reset.md § constraints, "stop on a natural downbeat"). */

export const GLASS_HARBOR_CUE: Cue = {
  id: "cue-glass-harbor",
  title: "Low Tide — candidate cue",
  frozen: false,
  sections: [
    { id: "c-mood", kind: "mood-open", label: "mood opening — harbour drone, no pulse", isBoundary: true },
    { id: "c-expo", kind: "exposition", label: "exposition — a clock-like tick enters", isBoundary: true },
    { id: "c-response", kind: "response", label: "response — low strings answer the tick", isBoundary: false },
    { id: "c-build", kind: "build", label: "build — and the breath before the peak", isBoundary: true },
    { id: "c-peak", kind: "peak", label: "peak — full energy", isBoundary: false },
    { id: "c-tail", kind: "tail", label: "tail — the tick alone, for the cards", isBoundary: true },
  ],
};

/* ──────────────────────────── the withholding budget ────────────────────────
   Five asset kinds, named for THIS heist — "named specifically, written by
   someone who owns the work rather than the campaign". Every `spend` carries
   its trade sentence; a spend with no recorded reason is the drift the
   technique exists to prevent (withholding-budget.md). */

export const GLASS_HARBOR_BUDGET: WithholdingBudget = {
  campaignId: "campaign-glass-harbor",
  assets: [
    {
      id: "asset-novum",
      kind: "novum",
      name: "the premise — a crew that never breaks in, only waits for the unlocked door",
      allowance: "spend",
      trade: "Buys the pitch in one line; costs nothing the work still needs, because the film opens on it too.",
    },
    {
      id: "asset-best-moment",
      kind: "best-moment",
      name: "the glass floor over the harbour giving way under the crew",
      allowance: "spend",
      trade: "Buys the ticket-deciding image; costs the second-act surprise of it, which test screenings said was survivable.",
    },
    {
      id: "asset-reveal",
      kind: "reveal",
      name: "the unlocked door is the tide-gate control room, not a vault",
      allowance: "imply",
    },
    {
      id: "asset-turn",
      kind: "turn",
      name: "the door was left unlocked FOR them — the city wanted the crew inside",
      allowance: "hold",
    },
    {
      id: "asset-resolution",
      kind: "resolution",
      name: "they walk out through the front, in daylight, with nothing",
      allowance: "hold",
    },
  ],
};

/* ─────────────────────────────── the slots ──────────────────────────────────
   One slot per part of the spine, in spine order. The variants in a slot differ
   by STRATEGY — what the beat is doing for the cut — never by defect: every
   variant is legal for its movement, links with BUT / THEREFORE, and (on a
   rung) raises exactly one variable, so any composition of picks is a
   well-formed chain and the choice is a craft choice.

   THE RESET SLOT. `MovementRole` has no "reset" — the reset is a beat kind, and
   `structure.ts#LEGAL_KINDS` makes it legal inside `escalation` and `climax`.
   `checkReset` reads position, not role: the reset must sit IMMEDIATELY BEFORE
   the peak in chain order and land on a cue boundary. So the reset slot's
   movement is `mv-reset`, a SECOND escalation-role movement (the checker allows
   repeats — "two escalation movements is a shape, not a defect") ordered after
   `mv-esc-3` and before `mv-climax`, sitting on the cue's `c-build` boundary.
   That gives the reset its own named part on the board (PATTERNS.md § 9.1:
   "The reset is a part, not a gap") while every verdict the checker renders
   over the composed cut reads it as the escalation's last stop before the
   peak, which is what it is. The baseline cut in the regression control makes
   the same placement with a single movement; this one names it.

   The three rungs raise DISJOINT variables by slot — esc-1 scale, esc-2 threat
   or cost, esc-3 speed or intimacy — so no combination of picks repeats a
   variable consecutively. */

const beat = (b: TrailerBeat): TrailerBeat => b;

export const GLASS_HARBOR_SLOTS: BeatSlot[] = [
  {
    id: "cold-open",
    movement: { id: "mv-cold-open", role: "cold-open", ordinal: 0, label: "cold open", cueSection: "c-mood" },
    variants: [
      {
        id: "cold-open-a",
        beat: beat({
          id: "b-co-a", movement: "mv-cold-open", at: "0:00", kind: "cold-open", connector: null,
          label: "the door, ajar",
          text: "A service door on a harbour wall, at night, swinging a hand's width open in the wind. Nobody near it. A gloved hand stops it — and does not go in.",
          cueMark: "c-mood",
        }),
        rationale: "Needs no context and looks like it resolves in seconds — the cold open's own test. The hand that does not enter is the premise, unstated.",
      },
      {
        id: "cold-open-b",
        beat: beat({
          id: "b-co-b", movement: "mv-cold-open", at: "0:00", kind: "cold-open", connector: null,
          label: "the falling floor",
          text: "Glass under boots. A crack races outward. Below it, the harbour. Cut to black before anyone falls.",
          cueMark: "c-mood",
          spends: ["asset-best-moment"],
        }),
        rationale: "Spends the best moment up front for maximum arrest. The budget allows it and the trade is recorded.",
        risk: "The cut's ceiling is spent at 0:00 — the climax then has to be a different image, and the shape risks reading as a ramp from a peak.",
      },
      {
        id: "cold-open-c",
        beat: beat({
          id: "b-co-c", movement: "mv-cold-open", at: "0:00", kind: "cold-open", connector: null,
          label: "the count",
          text: "A woman's voice, over black: \"Every city has one. We just wait.\" A tide chart, a single date circled.",
          cueMark: "c-mood",
          spends: ["asset-novum"],
        }),
        rationale: "Leads with the line the campaign is built on. Cheapest to produce and states the premise as a promise a viewer can hold.",
        risk: "Opens on words rather than an image; the doctrine's cold open is a MOMENT, and a line over black is close to a card.",
      },
    ],
  },
  {
    id: "introduction",
    movement: { id: "mv-intro", role: "introduction", ordinal: 1, label: "introduction", cueSection: "c-expo" },
    variants: [
      {
        id: "intro-a",
        beat: beat({
          id: "b-in-a", movement: "mv-intro", at: "0:12", kind: "stakes", connector: "THEREFORE",
          label: "four of them, one rule",
          text: "The crew, introduced by what each one refuses to carry: no crowbar, no drill, no gun. Mara, the planner: \"We've never broken a lock. We wait for the one they forget.\"",
          cueMark: "c-expo",
          spends: ["asset-novum"],
        }),
        rationale: "The least information that makes the stakes legible — who, what they want, and the rule that makes them interesting. Names Mara so a later rung can personalise the cost.",
      },
      {
        id: "intro-b",
        beat: beat({
          id: "b-in-b", movement: "mv-intro", at: "0:12", kind: "stakes", connector: "BUT",
          label: "the city that knows",
          text: "A harbour-master's office. A map of every door in Glass Harbor, each marked LOCKED — except one. The clerk who marked it looks up at the camera.",
          cueMark: "c-expo",
        }),
        rationale: "Introduces the antagonist's side first, so the crew enters an already-set trap. Stakes are legible without a line of dialogue.",
        risk: "Comes within a frame of the held turn (the door was left open for them). Legal — nothing is stated — but it is the imply-adjacent choice.",
      },
    ],
  },
  {
    id: "escalation-1",
    movement: { id: "mv-esc-1", role: "escalation", ordinal: 2, label: "escalation · rung 1", cueSection: "c-response" },
    variants: [
      {
        id: "esc1-a",
        beat: beat({
          id: "b-e1-a", movement: "mv-esc-1", at: "0:30", kind: "rung", connector: "BUT",
          label: "not one door — every door",
          text: "Mara's rule was one door per city. Tonight the schedule shows six cities, six tides, one night. The crew has never worked two at once.",
          raises: ["scale"], move: "widen-scope",
          cueMark: "c-response",
        }),
        rationale: "Widens scope — same threat, more affected. The cheapest move, and it belongs first because the rungs after it can afford more.",
      },
      {
        id: "esc1-b",
        beat: beat({
          id: "b-e1-b", movement: "mv-esc-1", at: "0:30", kind: "rung", connector: "BUT",
          label: "the whole harbour is the job",
          text: "The plan on the table is not a building. It is the harbour itself — piers, gates, the water. \"We're not robbing a room. We're robbing the tide.\"",
          raises: ["scale"], move: "widen-scope",
          cueMark: "c-response",
        }),
        rationale: "Widens scope by scale of object rather than count of jobs. Leans toward the implied reveal (the tide-gate) without naming it.",
        risk: "Closer to the implied reveal than variant A; a later rung that names the control room would overspend it.",
      },
    ],
  },
  {
    id: "escalation-2",
    movement: { id: "mv-esc-2", role: "escalation", ordinal: 3, label: "escalation · rung 2", cueSection: "c-response" },
    variants: [
      {
        id: "esc2-a",
        beat: beat({
          id: "b-e2-a", movement: "mv-esc-2", at: "0:45", kind: "rung", connector: "THEREFORE",
          label: "somebody else is waiting too",
          text: "Because six doors is a pattern, and patterns get noticed. On the pier, a second crew — armed, the way this one never is — watching the same door.",
          raises: ["threat"],
          cueMark: "c-response",
        }),
        rationale: "Raises threat: the thing that was theirs alone is now contested by people who break in. Closes a piece of information (there is a rival) and opens the next (who).",
      },
      {
        id: "esc2-b",
        beat: beat({
          id: "b-e2-b", movement: "mv-esc-2", at: "0:45", kind: "rung", connector: "THEREFORE",
          label: "Mara's brother is on the list",
          text: "So the schedule is checked against the harbour roster — and the night watchman on the one unlocked door is the brother Mara has not spoken to in nine years.",
          raises: ["cost"], move: "personalise-cost",
          cueMark: "c-response",
        }),
        rationale: "Personalises the cost — abstraction to a named person met in the introduction. The move the doctrine says requires the introduction to have happened; it pays off variant intro-a most.",
        risk: "If intro-b was picked, Mara has not been named yet and this rung personalises a cost the viewer has nobody to attach to.",
      },
      {
        id: "esc2-c",
        beat: beat({
          id: "b-e2-c", movement: "mv-esc-2", at: "0:45", kind: "rung", connector: "BUT",
          label: "the door is guarded from the inside",
          text: "The door is unlocked, as promised. Behind it, a corridor lined with faces on screens — the crew's own, from every job they thought nobody saw.",
          raises: ["threat"],
          cueMark: "c-response",
        }),
        rationale: "Raises threat by inverting the safe thing: the unlocked door is the danger. Stays clear of the held turn by never saying who unlocked it.",
      },
    ],
  },
  {
    id: "escalation-3",
    movement: { id: "mv-esc-3", role: "escalation", ordinal: 4, label: "escalation · rung 3", cueSection: "c-build" },
    variants: [
      {
        id: "esc3-a",
        beat: beat({
          id: "b-e3-a", movement: "mv-esc-3", at: "1:00", kind: "rung", connector: "BUT",
          label: "the tide does not wait",
          text: "The door is only unlocked while the water is low. The chart on the wall: forty minutes. The clock on Mara's wrist: eleven.",
          raises: ["speed"], move: "shorten-clock",
          cueMark: "c-build",
        }),
        rationale: "Shortens the clock — strong because it needs no new information at all. The largest rung by pressure, which is what the last rung should be.",
      },
      {
        id: "esc3-b",
        beat: beat({
          id: "b-e3-b", movement: "mv-esc-3", at: "1:00", kind: "rung", connector: "BUT",
          label: "she goes in alone",
          text: "The crew's rule is that nobody enters. Mara takes off the glove, puts a bare hand on the door, and pushes.",
          raises: ["intimacy"], move: "personalise-cost",
          cueMark: "c-build",
        }),
        rationale: "Raises intimacy: the scale collapses to one hand and one decision, which is what makes the reset after it land. A quieter last rung — the peak has to be earned by the reset, not by size.",
        risk: "A last rung that is smaller than rung 2 by pressure; the magnitude rule (unmeasured at this layer) may find the rise inverted once the shot lane sizes it.",
      },
    ],
  },
  {
    id: "reset",
    movement: { id: "mv-reset", role: "escalation", ordinal: 5, label: "the reset", cueSection: "c-build" },
    variants: [
      {
        id: "reset-a",
        beat: beat({
          id: "b-rs-a", movement: "mv-reset", at: "1:16", kind: "reset", connector: "BUT",
          label: "a line, in silence",
          text: "The cue stops on the downbeat. Black. Mara, quiet: \"It was never locked.\"",
          resetHolds: ["line"],
          cueMark: "c-build",
        }),
        rationale: "The form's substitute for narration: what was said is now punctuated. Holds one thing. The line implies the reveal without stating the turn.",
        risk: "\"It was never locked\" sits one word from the held turn (the door was opened FOR them). The budget allows imply; a reviewer should read the line as a stranger.",
      },
      {
        id: "reset-b",
        beat: beat({
          id: "b-rs-b", movement: "mv-reset", at: "1:16", kind: "reset", connector: "BUT",
          label: "the held hand",
          text: "The cue stops. A single held frame: Mara's bare hand flat on the door, not yet pushing. Two seconds of nothing but wind.",
          resetHolds: ["image"],
          cueMark: "c-build",
        }),
        rationale: "An image, not a line — an intake of breath. Safest against the withholding budget, because it says nothing.",
      },
      {
        id: "reset-c",
        beat: beat({
          id: "b-rs-c", movement: "mv-reset", at: "1:16", kind: "reset", connector: "BUT",
          label: "black",
          text: "Nothing. Black, silent, for as long as the cue's breath allows.",
          resetHolds: ["nothing"],
          cueMark: "c-build",
        }),
        rationale: "\"The strongest and the most fragile.\" Maximum headroom for the peak; nothing to misread.",
        risk: "Fragile on a phone with autoplay — two seconds of black reads as a broken video on a feed. Needs the sweetened stop to survive.",
      },
    ],
  },
  {
    id: "climax",
    movement: { id: "mv-climax", role: "climax", ordinal: 6, label: "climax", cueSection: "c-peak" },
    variants: [
      {
        id: "climax-a",
        beat: beat({
          id: "b-cl-a", movement: "mv-climax", at: "1:22", kind: "peak", connector: "THEREFORE",
          label: "the floor goes",
          text: "The peak: the crew on the glass floor, the crack, the harbour below, the fall — cut at the moment of falling, never the landing.",
          cueMark: "c-peak",
          spends: ["asset-best-moment"],
        }),
        rationale: "Spends the best moment as the peak, where its size is earned by the reset. The trade is recorded in the budget. Not the work's own climax — the film's is the walk out — which is exactly the doctrine's point.",
        risk: "If cold-open-b was also picked, the same image appears twice and the peak is a repeat; the board does not forbid it, a reader should.",
      },
      {
        id: "climax-b",
        beat: beat({
          id: "b-cl-b", movement: "mv-climax", at: "1:22", kind: "peak", connector: "THEREFORE",
          label: "every door opens at once",
          text: "Six cities. Six doors, each swinging open on the same tide. The crew, split across all of them, walking in. A montage at full cue energy.",
          cueMark: "c-peak",
        }),
        rationale: "A peak built from scale rather than from the best moment — keeps the glass floor for the film. Pays off esc1-a directly.",
        risk: "Montage-as-peak is the form's most common substitute for magnitude. Without the reset before it this reads as one long beat; with it, it is an arrival.",
      },
    ],
  },
  {
    id: "tail",
    movement: { id: "mv-tail", role: "tail", ordinal: 7, label: "tail — cards and button", cueSection: "c-tail" },
    variants: [
      {
        id: "tail-a",
        beat: beat({
          id: "b-tl-a", movement: "mv-tail", at: "1:50", kind: "title", connector: "THEREFORE",
          label: "GLASS HARBOR",
          text: "Title card on the tick alone. Then the date card. No button — the cut ends on the name.",
          cueMark: "c-tail",
        }),
        rationale: "Title then date, nothing after. The two contractual cards and no risk of a button outperforming the peak.",
      },
      {
        id: "tail-b",
        beat: beat({
          id: "b-tl-b", movement: "mv-tail", at: "1:50", kind: "title", connector: "BUT",
          label: "GLASS HARBOR — then the door",
          text: "Title card on the tick. Date card. Then a button: the same service door from the cold open swinging shut — and clicking locked. Mara, off: \"Huh.\"",
          cueMark: "c-tail",
        }),
        rationale: "Title first, then a button that rhymes with the cold open. Small by construction — one door, one word — so it stays under the climax. One slot beat carries both cards because the tail is one movement; the shot lane splits it.",
        risk: "The button's size against the peak is a magnitude question the beat layer cannot measure; the shot lane decides whether \"Huh.\" is small enough.",
      },
    ],
  },
];
