// THE PRESETS — eight starting points for a visual identity.
//
// Each is a complete four-slot style block (technique · subject · palette ·
// finish), not a mood word. That shape is the research batch's finding: styles
// that survive across forty frames are described as an ATTRIBUTE GRAMMAR in
// plain language, and the ones that drift are described as a vibe.
//
// Every palette names exactly three colours and assigns each a ROLE — ground,
// objects, accent. An unassigned palette ("navy, cream and cyan") looks fine on
// one image and shreds consistency across a project, because the model is free
// to re-cast which colour carries meaning each time.
//
// THUMBNAILS: all eight are generated from the SAME subject (CANON_SUBJECT
// below) by pipeline/build-preset-thumbs.mts and committed under public/presets/.
// One subject across all eight is the point — the grid then varies by style
// alone, so the user is comparing the only thing they are actually choosing.

import type { StyleBlock } from "@/lib/themes";

export interface Preset {
  id: string;
  name: string;
  /** One line, in the user's language, about when to reach for it. */
  line: string;
  block: StyleBlock;
  /** Element vocabulary this style is known to carry well. */
  elements: string[];
}

/**
 * The one subject every preset thumbnail renders. Deliberately abstract: it
 * exercises shape language, the three colour roles and the finish, without
 * being *about* anything — a thumbnail that told a story would sell the story
 * rather than the style.
 */
export const CANON_SUBJECT =
  "Three ascending rectangular bars standing in a row on a ground line, a circle floating above the tallest bar, " +
  "and one arrow arcing from the circle down to the shortest bar. Centred, large simple shapes, generous empty space.";

export const PRESETS: Preset[] = [
  {
    id: "signal-ledger",
    name: "Signal Ledger",
    line: "Editorial flat vector. The default for argument-led explainers.",
    elements: ["charts", "maps", "timelines", "captions"],
    block: {
      technique: "flat vector editorial illustration, hairline strokes of even weight",
      subject: "objects drawn as diagrams — the thing and its mechanism share one frame",
      palette: [
        { name: "ink navy", hex: "#0B1B2B", role: "ground" },
        { name: "paper cream", hex: "#F5EFE0", role: "objects" },
        { name: "harbor cyan", hex: "#67E8F9", role: "accent" },
      ],
      finish: "matte, no gradients, generous margins",
    },
  },
  {
    id: "newsprint-cutout",
    name: "Newsprint Cutout",
    line: "Collage with real photographic cutouts. Good when people are the subject.",
    elements: ["icons", "captions", "charts"],
    block: {
      technique: "paper collage — grayscale photographic cutouts on flat colour fields",
      subject: "subjects cut out with visible torn edges, arranged against flat blocks",
      palette: [
        { name: "deep navy", hex: "#1F2A44", role: "ground" },
        { name: "bone cream", hex: "#F2EAD9", role: "objects" },
        { name: "signal coral", hex: "#FF6F61", role: "accent" },
      ],
      finish: "paper grain, hard offset shadows, halftone at 30%",
    },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    line: "Technical drawing. Reads as engineering rather than opinion.",
    elements: ["diagrams", "timelines", "maps"],
    block: {
      technique: "technical blueprint linework — thin white construction lines, no fills",
      subject: "objects drawn as exploded schematics with measurement ticks",
      palette: [
        { name: "drafting blue", hex: "#123A5C", role: "ground" },
        { name: "chalk white", hex: "#E8EEF4", role: "objects" },
        { name: "warning amber", hex: "#F0A830", role: "accent" },
      ],
      finish: "faint grid underlay, uniform line weight, no shading",
    },
  },
  {
    id: "chalk-argument",
    name: "Chalk Argument",
    line: "Blackboard, drawn live. Best when the video is a line of reasoning.",
    elements: ["diagrams", "timelines"],
    block: {
      technique: "blackboard chalk drawing, strokes keeping the order they were drawn in",
      subject: "claims underlined, key quantities boxed, arrows carrying the argument",
      palette: [
        { name: "board green", hex: "#1D3A32", role: "ground" },
        { name: "chalk white", hex: "#E8E6DF", role: "objects" },
        { name: "mark yellow", hex: "#E3C96B", role: "accent" },
      ],
      finish: "chalk dust, ghosts of erased lines, slightly uneven strokes",
    },
  },
  {
    id: "isometric-works",
    name: "Isometric Works",
    line: "Systems as little machines. Strong for process and infrastructure.",
    elements: ["diagrams", "maps", "icons"],
    block: {
      technique: "isometric vector at a strict 30 degree projection, flat faces",
      subject: "systems built as connected modules on an implied isometric grid",
      palette: [
        { name: "slate", hex: "#243447", role: "ground" },
        { name: "mint", hex: "#BFE3D0", role: "objects" },
        { name: "ember orange", hex: "#FF8548", role: "accent" },
      ],
      finish: "flat faces with one darker side per solid, no gradients",
    },
  },
  {
    id: "paper-relief",
    name: "Paper Relief",
    line: "Layered cut paper with real depth. Warm, tactile, slower-feeling.",
    elements: ["icons", "maps", "captions"],
    block: {
      technique: "layered cut-paper relief, each element a separate stacked sheet",
      subject: "scenes built in three depth planes — foreground, subject, backdrop",
      palette: [
        { name: "sand", hex: "#E8D5B7", role: "ground" },
        { name: "deep ink", hex: "#2B2118", role: "objects" },
        { name: "rust", hex: "#C4551F", role: "accent" },
      ],
      finish: "soft contact shadow under every sheet, visible paper fibre",
    },
  },
  {
    id: "risograph",
    name: "Risograph",
    line: "Two-ink print with honest misregistration. Distinctive, quietly retro.",
    elements: ["icons", "charts", "captions"],
    block: {
      technique: "two-colour risograph print, ink layers slightly out of register",
      subject: "simple bold shapes overprinted so the two inks mix where they overlap",
      palette: [
        { name: "newsprint", hex: "#EDE6D6", role: "ground" },
        { name: "riso blue", hex: "#0B4FA8", role: "objects" },
        { name: "fluoro pink", hex: "#FF4D8D", role: "accent" },
      ],
      finish: "visible ink texture, 2mm misregistration, no fine detail",
    },
  },
  {
    id: "data-neon",
    name: "Data Neon",
    line: "Dark instrument panel. Suits markets, telemetry and anything live.",
    elements: ["charts", "timelines", "diagrams"],
    block: {
      technique: "dark dashboard vector — hairline grids and glowing plotted lines",
      subject: "quantities drawn as instrument readouts against a measured grid",
      palette: [
        { name: "instrument black", hex: "#0A0D12", role: "ground" },
        { name: "readout lime", hex: "#B6F09C", role: "objects" },
        { name: "alert magenta", hex: "#FF3D8A", role: "accent" },
      ],
      finish: "thin grid, faint glow on plotted lines only, otherwise flat",
    },
  },
];

export const presetById = new Map(PRESETS.map((p) => [p.id, p]));

/** Where build-preset-thumbs.mts writes, and where the UI reads. */
export const thumbSrc = (id: string) => `/presets/${id}.jpg`;
