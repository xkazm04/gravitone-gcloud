// THE PRESETS — six starting points for a visual identity.
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
// THUMBNAILS: all six are generated from the SAME subject (CANON_SUBJECT
// below) by pipeline/build-preset-thumbs.mts and committed under public/presets/.
// One subject across all six is the point — the grid then varies by style
// alone, so the user is comparing the only thing they are actually choosing.
//
// CLIPS: each preset also has five seconds of motion under public/clips/presets/,
// animated FROM its own swatch by pipeline/video/render_preset_clips.py on the
// local Wan stack and squeezed to a repository-sized pair of files by
// pipeline/build-preset-clips.mts. Image-to-video, so the clip begins on the
// exact still the rail shows — a clip generated from the prompt again would be
// a second picture, and the showcase would be selling something the rail does
// not have.

import type { Discipline } from "@/lib/projects";
import type { StyleBlock } from "@/lib/themes";

export interface Preset {
  id: string;
  name: string;
  /** One line, in the user's language, about when to reach for it. Read once,
   *  large, in the atelier's showcase — the rail's cards carry only the name,
   *  because above each of them is a render of the style the sentence
   *  describes. */
  line: string;
  /** The five seconds the showcase clip animates, written for image-to-video
   *  off this preset's own swatch (pipeline/video/render_preset_clips.py).
   *
   *  SMALL ON PURPOSE, and the same shape every time: what holds still, then
   *  the one thing that moves. A swatch that reorganises itself has stopped
   *  being a swatch — the clip's job is to show how this style BEHAVES in
   *  motion, not to tell a different story than the still it starts on. */
  motion: string;
  block: StyleBlock;
  /** Element vocabulary this style is known to carry well. */
  elements: string[];
  /** Which kind of video this preset was written for. All six were written for
   *  explainers; a theme made from a preset inherits this tag. */
  discipline: Discipline;
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
    discipline: "educational",
    elements: ["charts", "maps", "timelines", "captions"],
    motion:
      "Very slow camera push in toward the centre of the frame. The shapes are unchanged and nothing is added or removed; only the framing tightens.",
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
    discipline: "educational",
    elements: ["icons", "captions", "charts"],
    motion:
      "Very slow camera push in. The paper grain and the halftone dots shimmer faintly across the flat colour fields; the cut-out shapes and their hard shadows stay exactly as they are.",
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
    discipline: "educational",
    elements: ["diagrams", "timelines", "maps"],
    motion:
      "Very slow camera drift to the right across the drawing. The faint grid underlay slides with it; the linework is unchanged and nothing is added or removed.",
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
    discipline: "educational",
    elements: ["diagrams", "timelines"],
    motion:
      "Very slow camera push in toward the board. Fine chalk dust hangs and drifts in the air. Every stroke stays exactly where it is; nothing is drawn, erased or added, and nothing enters the frame.",
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
    id: "paper-relief",
    name: "Paper Relief",
    line: "Layered cut paper with real depth. Warm, tactile, slower-feeling.",
    discipline: "educational",
    elements: ["icons", "maps", "captions"],
    motion:
      "The camera drifts slowly across the layered sheets and the parallax between the depth planes shifts. The sheets and their soft contact shadows are unchanged, and nothing enters the frame.",
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
    id: "data-neon",
    name: "Data Neon",
    line: "Dark instrument panel. Suits markets, telemetry and anything live.",
    discipline: "educational",
    elements: ["charts", "timelines", "diagrams"],
    motion:
      "Very slow camera push in toward the flat panel. The glow along the plotted line brightens and dims once. The grid, the lines and the readouts stay exactly as they are, and nothing enters the frame.",
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

/** Where build-preset-clips.mts writes, and where the showcase reads. VP9 only,
 *  and the poster carries the browsers that cannot play it — that poster is the
 *  clip's own first frame, which is the still this surface showed before it had
 *  a clip, so the fallback is the old surface rather than a hole. The reasoning
 *  and the cost that decided it are in pipeline/video/transcode.mjs. */
export const clipSources = (id: string) => [
  { src: `/clips/presets/${id}.webm`, type: 'video/webm; codecs="vp9"' },
];
export const clipPoster = (id: string) => `/clips/presets/${id}.jpg`;
