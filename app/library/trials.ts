// THE TRIAL SET — five real beats, five different visual problems.
//
// Lifted from the repo's own finished script,
// `pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/script--reversal-chain.md`,
// because a trial set invented for the purpose would quietly avoid the shapes
// that are hard to draw. These five were chosen so that NO STYLE CAN PASS ALL
// FIVE BY BEING GOOD AT ONE THING:
//
//   quantity    a magnitude over time — can it plot?
//   inventory   many discrete items at once — can it hold a set without clutter?
//   analogy     two unlike scenes juxtaposed — can it carry a concept?
//   mechanism   a closed loop that reverses — can it draw causation?
//   flow        two opposing streams meeting — can it show direction?
//
// A style that renders a beautiful chart and mangles a five-icon row is not a
// house style, and one trial would never have found that out.
//
// Each subject is written as PICTURE ONLY. No text, no labels, no numbers — the
// captions and figures are the vector layer we draw ourselves from the
// notebook's facts, so a plate that spells them out is unusable.

export interface Trial {
  id: string;
  /** Short label for a chip. */
  label: string;
  /** Which visual problem it probes. */
  problem: string;
  /** Where it comes from in the script. */
  beat: string;
  /** The subject clause handed to the model. */
  subject: string;
}

export const TRIALS: Trial[] = [
  {
    id: "peak-and-fall",
    label: "the fall",
    problem: "quantity",
    beat: "HOOK · the record high, then half of it gone",
    subject:
      "A single line rising steeply to a sharp peak near the top right, then falling away to roughly half " +
      "its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and " +
      "simple, generous empty space around the curve.",
  },
  {
    id: "wish-list",
    label: "the wish list",
    problem: "inventory",
    beat: "HOOK · every item delivered — reserve, law, regulators, ETFs",
    subject:
      "Four simple emblems in an evenly spaced row: a government building with columns, a rolled document " +
      "with a ribbon, a balance scale, and a bank card. Each has a small tick mark beside it. Uniform size, " +
      "even spacing, clean ground line, generous empty space.",
  },
  {
    id: "booking-not-meal",
    label: "the booking",
    problem: "analogy",
    beat: "MOVEMENT 1 · a full reservation book, an empty dining room",
    subject:
      "A frame split into two equal halves by a thin vertical line. On the left, an open reservation book " +
      "with every line filled. On the right, a dining table with two empty chairs and nothing on it. Both " +
      "halves equally weighted, large simple shapes, generous empty space.",
  },
  {
    id: "flywheel",
    label: "the flywheel",
    problem: "mechanism",
    beat: "MOVEMENT 2 · the mNAV machine, and the moment it inverts",
    subject:
      "A closed circular loop of three thick arrows chasing each other clockwise around a central stack of " +
      "coins. One arrow, at the lower left, points the wrong way against the other two, breaking the circuit. " +
      "Centred, large simple shapes, generous empty space.",
  },
  {
    id: "the-exit",
    label: "the exit",
    problem: "flow",
    beat: "MOVEMENT 1 · long-term holders selling into the demand meant to lift them",
    subject:
      "Two thick opposing streams of small shapes meeting head-on in the middle of the frame: one stream " +
      "flowing in from the left, a heavier stream flowing out to the right. Where they meet the flow is " +
      "visibly congested. Horizontal composition, large simple shapes, generous empty space.",
  },
];

export const trialById = new Map(TRIALS.map((t) => [t.id, t]));

/** Where build-style-trials.mts writes, and where any gallery reads. */
export const trialSrc = (styleId: string, trialId: string) => `/trials/${styleId}/${trialId}.jpg`;
