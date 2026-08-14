// The mocked PROJECT — Glass Harbor's story: five scenes, states deliberately
// uneven because a real project always is (scene 5 unpicked).
//
// Only what a surface reads is authored here. The frame candidates carry an id
// and a tone because the landing contact sheet draws the tone and rings the
// pick; the prompts, models and pick-notes that used to sit beside them had no
// reader and are gone with the Motion step's `clip`/`vfx`/`lines` tail.

import type { Scene } from "./projectTypes";

export const PROJECT = {
  title: "Glass Harbor",
  logline:
    "A crew that never breaks in — they wait for the one door every city leaves unlocked.",
  totalS: 31,
};

export const SCENES: Scene[] = [
  {
    id: "sc-1",
    index: 1,
    slug: "EXT. PIER 7 — NIGHT",
    mood: "tense / patient",
    targetS: 6,
    frames: [
      { id: "f-1a", tone: "from-cyan-950 via-slate-900 to-slate-950" },
      { id: "f-1b", tone: "from-slate-800 via-slate-900 to-black" },
      { id: "f-1c", tone: "from-indigo-950 via-slate-900 to-slate-950" },
    ],
    pickedFrameId: "f-1a",
  },
  {
    id: "sc-2",
    index: 2,
    slug: "INT. CRANE CAB — NIGHT",
    mood: "coiled / precise",
    targetS: 7,
    frames: [
      { id: "f-2a", tone: "from-amber-950/70 via-slate-900 to-slate-950" },
      { id: "f-2b", tone: "from-slate-800 via-slate-900 to-slate-950" },
      { id: "f-2c", tone: "from-cyan-900/60 via-slate-900 to-slate-950" },
    ],
    pickedFrameId: "f-2b",
  },
  {
    id: "sc-3",
    index: 3,
    slug: "EXT. ROOFTOP — NIGHT",
    // "turn" is load-bearing: the Cut reads it to place the act-two marker.
    mood: "vertigo / turn",
    targetS: 6,
    frames: [
      { id: "f-3a", tone: "from-sky-950 via-slate-900 to-slate-950" },
      { id: "f-3b", tone: "from-slate-900 via-slate-950 to-black" },
      { id: "f-3c", tone: "from-cyan-950 via-slate-950 to-black" },
    ],
    pickedFrameId: "f-3a",
  },
  {
    id: "sc-4",
    index: 4,
    slug: "INT. HARBOR GATE — NIGHT",
    mood: "held breath",
    targetS: 7,
    frames: [
      { id: "f-4a", tone: "from-amber-950/60 via-slate-900 to-slate-950" },
      { id: "f-4b", tone: "from-slate-800 via-slate-900 to-black" },
      { id: "f-4c", tone: "from-rose-950/40 via-slate-900 to-slate-950" },
    ],
    pickedFrameId: "f-4a",
  },
  {
    id: "sc-5",
    index: 5,
    slug: "EXT. WATERLINE — DAWN",
    mood: "release",
    targetS: 5,
    frames: [
      { id: "f-5a", tone: "from-cyan-900/50 via-slate-900 to-slate-950" },
      { id: "f-5b", tone: "from-sky-950 via-slate-900 to-slate-950" },
      { id: "f-5c", tone: "from-amber-950/50 via-slate-900 to-slate-950" },
    ],
    pickedFrameId: null,
  },
];
