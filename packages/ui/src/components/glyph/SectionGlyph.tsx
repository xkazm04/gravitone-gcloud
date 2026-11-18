// THE STUDIO'S SECTION GLYPHS: one mark per header section (and the shell's own doors - kit, sign out, send), so a
// navigation that is drawn narrower than its words still names each place by shape. Drawn on a 20-unit grid at one
// stroke, from currentColor; size is the caller's class. Every glyph is aria-hidden: the link or button that carries
// it keeps its own accessible name.
export type SectionGlyphName = "floor" | "projects" | "runs" | "scout" | "reels" | "library" | "audio" | "ledger" | "kit" | "signout" | "send" | "menu" | "talk";

const PATHS: Readonly<Record<SectionGlyphName, readonly string[]>> = {
  floor: ["M3 5h14", "M3 10h14", "M3 15h14", "M13 3.5v3", "M7 8.5v3", "M11 13.5v3"],
  projects: ["M3 6.5h5l1.5 2H17v8H3z", "M5 4h4l1.5 2"],
  runs: ["M3 15.5h14", "M4 12l3.5-4 3 2.5L16 4.5", "M16 4.5v3.5", "M16 4.5h-3.5"],
  scout: ["M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M12.8 7.2l-1.6 4-4 1.6 1.6-4z"],
  reels: ["M3 4.5h14v11H3z", "M6.5 4.5v11", "M13.5 4.5v11", "M3 8h3.5", "M3 12h3.5", "M13.5 8H17", "M13.5 12H17"],
  library: ["M4 3.5v13", "M7.5 3.5v13", "M11 4l3.6 12.2", "M3 16.5h14"],
  audio: ["M3 10h1.5", "M6 7v6", "M9 4v12", "M12 6.5v7", "M15 8.5v3", "M17 10h.01"],
  ledger: ["M5 3h10v14H5z", "M7.5 7h5", "M7.5 10h5", "M7.5 13h3"],
  kit: ["M3.5 3.5h5v5h-5z", "M11.5 3.5h5v5h-5z", "M3.5 11.5h5v5h-5z", "M14 11.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"],
  signout: ["M8 3.5H4v13h4", "M12 6.5l3.5 3.5-3.5 3.5", "M15.5 10H8"],
  send: ["M3.5 10h12", "M10.5 5l5 5-5 5"],
  menu: ["M6 8l4 4 4-4"],
  talk: ["M4 4.5h12v8.5H9l-3.5 3v-3H4z"],
};

export function SectionGlyph({ name, className }: { readonly name: SectionGlyphName; readonly className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
