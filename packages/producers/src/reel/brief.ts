// THE REEL TURNS' WORDS AND CHECKS, PURE (spark reel-studio WP2): what the data and author turns are handed beside
// their prompt files, and the check an authored film answers to before it is landed. No fs here; the acts in
// lib/producers/reel/ read the folder, call these, and write.

/** Desktop timeline frames per second (lib/reel/types.ts REEL_FPS). */
export const FILM_FPS = 30;
/** How long the desktop film may run, seconds (lib/reel/types.ts FILM_SECONDS; a package does not import lib/). */
export const FILM_SECONDS_RANGE: readonly [number, number] = [60, 120];

export type IdeaWords = { readonly title: string; readonly hook: string; readonly path: string };
export type Pin = { readonly t: number; readonly reasons: readonly string[]; readonly text: string };

/** `m:ss.s` of desktop seconds, the clock the operator pinned against. */
export function clock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/** inputs/IDEA.md: the idea, and the operator's words when a table was sent back. */
export function ideaMarkdown(idea: IdeaWords, note?: string): string {
  const lines = ["# The idea", "", `**Title:** ${idea.title}`, "", `**Hook (the question the first seconds ask):** ${idea.hook}`, "", `**Path (why someone keeps watching):** ${idea.path}`];
  if (note !== undefined && note.trim() !== "") lines.push("", "## The operator sent the last table back", "", note.trim());
  return `${lines.join("\n")}\n`;
}

/** inputs/NOTES.md for a redo: each pin at its film time with its reasons, in time order, and the verdict's note. */
export function notesMarkdown(pins: readonly Pin[], verdictNote?: string): string {
  const sorted = pins
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.t - b.p.t || a.i - b.i)
    .map((x) => x.p);
  const lines = ["# The operator's notes on the last film", "", "Desktop film time, in order. Each is a moment to change; the reasons are the operator's words for what was wrong.", ""];
  for (const p of sorted) lines.push(`- **${clock(p.t)}** (frame ${Math.round(p.t * FILM_FPS)})${p.reasons.length === 0 ? "" : ` [${p.reasons.join(", ")}]`}: ${p.text.trim() || "(no words)"}`);
  if (sorted.length === 0) lines.push("- (no pinned notes)");
  if (verdictNote !== undefined && verdictNote.trim() !== "") lines.push("", "## On the whole film", "", verdictNote.trim());
  return `${lines.join("\n")}\n`;
}

/** The film's declared length, `out/reel.json` {"frames": N}, or the sentence refusing it. */
export function declaredFrames(raw: unknown): number | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "out/reel.json is not an object holding {\"frames\": N}";
  const f = (raw as Record<string, unknown>)["frames"];
  if (typeof f !== "number" || !Number.isInteger(f) || f < 1) return `out/reel.json frames is ${JSON.stringify(f)}, not a whole number of frames`;
  const [lo, hi] = FILM_SECONDS_RANGE;
  if (f < lo * FILM_FPS || f > hi * FILM_FPS) return `out/reel.json declares ${f} frames (${(f / FILM_FPS).toFixed(1)} s); the desktop film is ${lo} to ${hi} s, ${lo * FILM_FPS} to ${hi * FILM_FPS} frames`;
  return f;
}

export type FilmFile = { readonly name: string; readonly text: string };

const PAGES = ["reel-desktop.html", "reel.html"] as const;

/** Things a frame-pure page never calls: the frame would depend on the wall clock or on chance. */
const IMPURE: readonly (readonly [RegExp, string])[] = [
  [/\bMath\.random\s*\(/, "Math.random() (a frame must be a pure function of i: use a seeded generator)"],
  [/\bDate\.now\s*\(/, "Date.now() (a frame must not read the wall clock)"],
  [/\brequestAnimationFrame\s*\(/, "requestAnimationFrame() (the renderer calls renderFrameAt; nothing animates by itself)"],
  [/\bsetInterval\s*\(/, "setInterval() (nothing animates by itself)"],
];

/** A URL to another origin in code: every request off 127.0.0.1 is aborted at render time. */
const REMOTE = /(?:src|href)\s*=\s*["']https?:\/\/|\bfrom\s+["']https?:\/\/|\bimport\s*\(\s*["']https?:\/\/|\bfetch\s*\(\s*["']https?:\/\//;

/**
 * The check a film answers to before it is landed (pipeline/REEL-FILM-PROMPT.md is the contract): both pages, one
 * shared module they both load, the page contract's three names, nothing from another origin, nothing that reads the
 * clock or chance, and the declared length inside the desktop band. Each finding is one line.
 */
export function lintFilm(files: readonly FilmFile[], declared: number | string): string[] {
  const out: string[] = [];
  const byName = new Map(files.map((f) => [f.name, f.text]));
  const modules = files.filter((f) => /\.(m?js)$/.test(f.name));
  for (const page of PAGES) {
    const html = byName.get(page);
    if (html === undefined) {
      out.push(`${page} is missing`);
      continue;
    }
    if (!modules.some((m) => html.includes(m.name))) out.push(`${page} loads none of the film's modules (${modules.map((m) => m.name).join(", ") || "there are none"}): both pages load one shared module`);
  }
  if (modules.length === 0) out.push("no .js module: the film's code lives in one module both pages load");
  const all = files.map((f) => f.text).join("\n");
  for (const name of ["window.REEL", "renderFrameAt", "REEL_READY"]) if (!all.includes(name)) out.push(`${name} is never set: the page contract needs it`);
  for (const f of files) {
    for (const [re, why] of IMPURE) if (re.test(f.text)) out.push(`${f.name}: ${why}`);
    if (REMOTE.test(f.text)) out.push(`${f.name}: loads from another origin; data comes from /data/, three from /three/`);
  }
  if (typeof declared === "string") out.push(declared);
  return out;
}

/** inputs/feedback.md for the one fix turn: what the check found, verbatim. */
export function fixMarkdown(findings: readonly string[]): string {
  return ["# The check of your film", "", "The film was NOT landed. Fix each finding in out/ in place; change nothing else.", "", ...findings.map((f) => `- ${f}`), ""].join("\n");
}
