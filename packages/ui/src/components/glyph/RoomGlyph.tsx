// THE ROOMS' GLYPHS (design baseline P4, 2026-11-17): one mark per room a route's context column lists - the audio
// desk's rooms, the Ledger's and the Projects' own - so a column reads like the Library's rail (a mark, a word, a
// count) and an overview card names its room by the same shape. Same grid and stroke as ./SectionGlyph.tsx: a
// 20-unit box, one stroke, currentColor; size is the caller's class. aria-hidden: the row carries the name.
export type RoomGlyphName =
  | "overview"
  | "compose"
  | "cover"
  | "hunt"
  | "arrange"
  | "songlab"
  | "rubric"
  | "strengths"
  | "lessons"
  | "batch"
  | "release"
  | "lanes"
  | "plan"
  | "runs";

const PATHS: Readonly<Record<RoomGlyphName, readonly string[]>> = {
  overview: ["M3.5 3.5h5.5v5.5H3.5z", "M11 3.5h5.5v5.5H11z", "M3.5 11h5.5v5.5H3.5z", "M11 11h5.5v5.5H11z"],
  compose: ["M4 16l1-4 8.5-8.5a2.1 2.1 0 0 1 3 3L8 15z", "M12 5l3 3"],
  cover: ["M10 16.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"],
  hunt: ["M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M13.5 13.5L17 17"],
  arrange: ["M3.5 5h13", "M3.5 10h9", "M3.5 15h11", "M15 8.5l2 1.5-2 1.5"],
  songlab: ["M5 3.5h4v4H5z", "M5 12.5h4v4H5z", "M9 5.5h2.5v9H9", "M11.5 10H16"],
  rubric: ["M4 16V11", "M8 16V7", "M12 16V9", "M16 16V4"],
  strengths: ["M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z"],
  lessons: ["M4 4.5h5a2 2 0 0 1 2 2V16a1.5 1.5 0 0 0-1.5-1.5H4z", "M16 4.5h-5", "M16 4.5v10h-4.5"],
  batch: ["M4 6.5h9v9H4z", "M7 3.5h9v9"],
  release: ["M10 16.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M10 6.5v3.5l2.5 1.5"],
  lanes: ["M3.5 3.5h5.5v5.5H3.5z", "M11 3.5h5.5v5.5H11z", "M3.5 11h5.5v5.5H3.5z", "M11 11h5.5v5.5H11z"],
  plan: ["M4 5h12", "M4 10h8", "M4 15h10", "M2.5 5h.01", "M2.5 10h.01", "M2.5 15h.01"],
  runs: ["M3 15.5h14", "M4 12l3.5-4 3 2.5L16 4.5"],
};

export function RoomGlyph({ name, className }: { readonly name: RoomGlyphName; readonly className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
