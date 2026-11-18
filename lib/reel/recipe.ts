// THE REEL'S RECIPE - the one backup the retention sweep keeps (spark reel-studio, the owner's rule of 2026-11-18:
// "keeping stored prompt or procedure with standardized syntax as only backup for replication or documentation").
//
// `<slug>/recipe.json` is `gravitone.reel-recipe/1`: everything needed to make the film again or to say how it was
// made - the idea, the table and its source, the page code by sha, the render settings, the bed's Suno prompt, the
// encode settings, the verdicts with their notes, the publications, and what the archive deleted. `<slug>/RECIPE.md`
// is the same record written for a person. Both are rewritten on every sweep (and before any deletion), so they never
// describe a film older than its reel.json.
//
// What it cannot replicate, said in the record itself: the bed (Suno does not make the same song twice from a
// prompt) and the vendor-free but machine-dependent render (a re-render on another GPU differs by a few dB PSNR).

import { createHash } from "node:crypto";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "../foundry/runStore.ts";
import { bedFilter } from "./encode.ts";
import type { FilmStage } from "./film.ts";
import type { ReelVerdicts } from "./store.ts";
import { FILM_DIR, FILM_FACES, FILM_SPEC, REEL_FPS, type ArchivedFile, type BedPrompt, type FilmFace, type ReelIdea, type ReelState } from "./types.ts";

export const RECIPE_SCHEMA = "gravitone.reel-recipe/1";
export const RECIPE_FILE = "recipe.json";
export const RECIPE_DOC = "RECIPE.md";

/** Files the recipe lists by sha: the page code and everything it loads, never a video or a picture. */
const CODE_EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".md", ".woff", ".woff2", ".ttf", ".otf", ".svg", ".csv", ".geojson", ".txt"]);
const SKIP = new Set(["progress.json", "publish.json"]);

export type RecipeFile = { readonly file: string; readonly bytes: number; readonly sha: string };

export type ReelRecipe = {
  readonly schema: typeof RECIPE_SCHEMA;
  readonly slug: string;
  readonly writtenAt: string;
  readonly stage: FilmStage;
  readonly idea: ReelIdea;
  readonly data: { readonly table?: { readonly file: "table.json"; readonly sha?: string }; readonly imported?: { readonly from: string; readonly at: string } };
  readonly pages: readonly RecipeFile[];
  /** The /data/ folder every page also reads, shared by all reels: `<reelsRoot>/_shared/data`. */
  readonly sharedData: "_shared/data";
  readonly render: {
    readonly renderer: "pipeline/reel/film-render.mts";
    readonly fps: number;
    readonly frames?: number;
    readonly faces: Readonly<Record<FilmFace, { readonly page: string; readonly width: number; readonly height: number; readonly step: 1 | 2; readonly sha?: string; readonly seconds?: number; readonly renderedAt?: string }>>;
  };
  readonly bed?: { readonly prompt?: BedPrompt; readonly seconds: number; readonly sha: string; readonly lufs?: number; readonly takeId?: string; readonly mux: Readonly<Record<FilmFace, string>> };
  readonly encode: {
    readonly codec: "libx264";
    readonly passes: 2;
    readonly preset: "slow";
    readonly pixFmt: "yuv420p";
    readonly audio: "aac";
    readonly targets: Readonly<Record<FilmFace, number>>;
    readonly copies: Partial<Record<FilmFace, { readonly sha: string; readonly bytes: number; readonly seconds: number; readonly vmaf?: { readonly mean: number; readonly min: number } }>>;
  };
  readonly verdicts: ReelVerdicts["stops"];
  readonly published: readonly { readonly face: FilmFace; readonly slotId: string; readonly at: string; readonly dry: boolean }[];
  readonly archived: readonly ArchivedFile[];
  /** What a rebuild from this record cannot reproduce exactly. */
  readonly limits: readonly string[];
};

const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** The film folder's code files, film-relative and sorted, each with its sha. */
export async function pageFiles(filmDir: string): Promise<RecipeFile[]> {
  const out: RecipeFile[] = [];
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(path.join(filmDir, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const r = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== "thumbs" && e.name !== "stills" && e.name !== "history") await walk(r);
      } else if (e.isFile() && CODE_EXT.has(path.extname(e.name).toLowerCase()) && !SKIP.has(r)) {
        const b = await readFile(path.join(filmDir, r));
        out.push({ file: r, bytes: b.length, sha: sha256(b) });
      }
    }
  };
  await walk("");
  return out.sort((a, b) => (a.file < b.file ? -1 : 1));
}

export async function buildRecipe(o: {
  readonly dir: string;
  readonly state: ReelState;
  readonly stage: FilmStage;
  readonly verdicts: ReelVerdicts;
  readonly published: readonly { readonly face: FilmFace; readonly slotId: string; readonly at: string; readonly dry: boolean }[];
  readonly now: Date;
}): Promise<ReelRecipe> {
  const { state } = o;
  const film = state.film;
  const hasTable = await stat(path.join(o.dir, "table.json")).then((s) => s.isFile(), () => false);
  const faces = Object.fromEntries(
    FILM_FACES.map((f) => {
      const r = film?.renders[f];
      const s = FILM_SPEC[f];
      return [f, { page: s.page, width: s.width, height: s.height, step: s.step, ...(r === undefined ? {} : { sha: r.sha, seconds: r.seconds, renderedAt: r.renderedAt }) }];
    }),
  ) as ReelRecipe["render"]["faces"];
  const copies: { -readonly [K in FilmFace]?: NonNullable<ReelRecipe["encode"]["copies"][K]> } = {};
  for (const f of FILM_FACES) {
    const c = film?.copies[f];
    if (c !== undefined) copies[f] = { sha: c.sha, bytes: c.bytes, seconds: c.seconds, ...(c.vmaf === undefined ? {} : { vmaf: c.vmaf }) };
  }
  const bed = film?.bed;
  const desktopSeconds = film?.renders.desktop?.seconds ?? (film === undefined ? 0 : film.frames / REEL_FPS);
  const phoneSeconds = film?.renders.phone?.seconds ?? desktopSeconds / 2;
  return {
    schema: RECIPE_SCHEMA,
    slug: state.slug,
    writtenAt: o.now.toISOString(),
    stage: o.stage,
    idea: state.idea,
    data: {
      ...(hasTable ? { table: { file: "table.json" as const, ...(state.tableSha === undefined ? {} : { sha: state.tableSha }) } } : {}),
      ...(film?.imported === undefined ? {} : { imported: film.imported }),
    },
    pages: film === undefined ? [] : await pageFiles(path.join(o.dir, FILM_DIR)),
    sharedData: "_shared/data",
    render: { renderer: "pipeline/reel/film-render.mts", fps: REEL_FPS, ...(film === undefined ? {} : { frames: film.frames }), faces },
    ...(bed === undefined
      ? {}
      : {
          bed: {
            ...(bed.prompt === undefined ? {} : { prompt: bed.prompt }),
            seconds: bed.seconds,
            sha: bed.sha,
            ...(bed.lufs === undefined ? {} : { lufs: bed.lufs }),
            ...(bed.takeId === undefined ? {} : { takeId: bed.takeId }),
            mux: { desktop: bedFilter("desktop", desktopSeconds), phone: bedFilter("phone", phoneSeconds) },
          },
        }),
    encode: { codec: "libx264", passes: 2, preset: "slow", pixFmt: "yuv420p", audio: "aac", targets: { desktop: FILM_SPEC.desktop.targetBytes, phone: FILM_SPEC.phone.targetBytes }, copies },
    verdicts: o.verdicts.stops,
    published: o.published,
    archived: film?.archived ?? [],
    limits: [
      "The bed is kept only as its Suno prompt: Suno does not make the same track twice, so a rebuild has a different song.",
      "A re-render on another machine or GPU matches the original closely but not bit for bit.",
    ],
  };
}

const mb = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;

/** The recipe written for a person. Same facts, no new ones. */
export function recipeDoc(r: ReelRecipe): string {
  const L: string[] = [];
  L.push(`# ${r.idea.title}`, "", `> ${r.idea.hook}`, "", r.idea.path, "", `- slug: \`${r.slug}\`  stage: ${r.stage}  written: ${r.writtenAt}`, `- schema: \`${r.schema}\``, "");
  L.push("## Data", "");
  if (r.data.table !== undefined) L.push(`- table: \`${r.data.table.file}\`${r.data.table.sha === undefined ? "" : ` (sha ${r.data.table.sha.slice(0, 12)})`}`);
  if (r.data.imported !== undefined) L.push(`- imported from \`${r.data.imported.from}\` at ${r.data.imported.at}`);
  if (r.data.table === undefined && r.data.imported === undefined) L.push("- no table yet");
  L.push("", "## Pages", "", `${r.pages.length} files under \`film/\`, plus the shared \`${r.sharedData}\`:`, "");
  for (const p of r.pages) L.push(`- \`${p.file}\` ${p.bytes} B, sha ${p.sha.slice(0, 12)}`);
  L.push("", "## Render", "", `Renderer \`${r.render.renderer}\`, ${r.render.fps} fps${r.render.frames === undefined ? "" : `, ${r.render.frames} frames at desktop speed`}.`, "");
  for (const f of FILM_FACES) {
    const x = r.render.faces[f];
    L.push(`- ${f}: \`${x.page}\` ${x.width}x${x.height}, step ${x.step}${x.seconds === undefined ? "" : `, ${x.seconds.toFixed(1)} s`}${x.sha === undefined ? "" : `, sha ${x.sha.slice(0, 12)}`}`);
  }
  L.push("", "## Bed", "");
  if (r.bed === undefined) L.push("- none");
  else {
    const p = r.bed.prompt;
    L.push(`- ${r.bed.seconds.toFixed(1)} s${r.bed.lufs === undefined ? "" : `, ${r.bed.lufs.toFixed(1)} LUFS`}, sha ${r.bed.sha.slice(0, 12)}`);
    if (p !== undefined) {
      L.push(`- Suno style: ${p.style}`);
      for (const [k, v] of [["title", p.title], ["model", p.model], ["url", p.url], ["note", p.note]] as const) if (v !== undefined) L.push(`- Suno ${k}: ${v}`);
      if (p.lyrics !== undefined) L.push("- lyrics:", "", "```", p.lyrics, "```");
    }
    for (const f of FILM_FACES) L.push(`- mux ${f}: \`${r.bed.mux[f]}\``);
  }
  L.push("", "## Encode", "", `2-pass ${r.encode.codec} ${r.encode.preset}, ${r.encode.pixFmt}, ${r.encode.audio}; targets desktop ${mb(r.encode.targets.desktop)}, phone ${mb(r.encode.targets.phone)}.`, "");
  for (const f of FILM_FACES) {
    const c = r.encode.copies[f];
    if (c !== undefined) L.push(`- ${f}: ${mb(c.bytes)}, ${c.seconds.toFixed(1)} s${c.vmaf === undefined ? "" : `, VMAF ${c.vmaf.mean.toFixed(1)} (min ${c.vmaf.min.toFixed(1)})`}, sha ${c.sha.slice(0, 12)}`);
  }
  L.push("", "## Verdicts", "");
  const stops = Object.entries(r.verdicts);
  if (stops.length === 0) L.push("- none");
  for (const [stop, v] of stops) {
    if (v === undefined) continue;
    L.push(`- ${stop}: ${v.verdict}${v.reasons.length === 0 ? "" : ` (${v.reasons.join(", ")})`}, round ${v.round}, ${v.at}${v.note === undefined ? "" : ` - ${v.note}`}`);
    for (const pin of v.pins ?? []) L.push(`  - at ${pin.t.toFixed(1)} s${pin.reasons.length === 0 ? "" : ` [${pin.reasons.join(", ")}]`}: ${pin.text}`);
  }
  L.push("", "## Published", "");
  if (r.published.length === 0) L.push("- not yet");
  for (const p of r.published) L.push(`- ${p.face}: slot \`${p.slotId}\` at ${p.at}${p.dry ? " (dry)" : ""}`);
  L.push("", "## Archived", "");
  if (r.archived.length === 0) L.push("- nothing yet");
  for (const a of r.archived) L.push(`- \`${a.file}\` ${mb(a.bytes)}, ${a.rule}, ${a.at}${a.foundMissing === true ? " (already gone)" : ""}`);
  L.push("", "## Limits", "", ...r.limits.map((x) => `- ${x}`), "");
  return L.join("\n");
}

/** Write recipe.json and RECIPE.md beside reel.json (atomic each). */
export async function writeRecipe(dir: string, r: ReelRecipe): Promise<void> {
  await writeJsonAtomic(path.join(dir, RECIPE_FILE), r);
  const tmp = path.join(dir, `${RECIPE_DOC}.partial`);
  await writeFile(tmp, recipeDoc(r), "utf8");
  await rename(tmp, path.join(dir, RECIPE_DOC));
}
