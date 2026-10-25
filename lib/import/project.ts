import { filmDefaults, planParts, recipeById, type PlannedPart } from "@gt/catalog/recipes";
import { TEMPLATES, type TemplateId } from "@gt/catalog/projects";
import { parseAt } from "@gt/domain/door";
import { composeInputSchema } from "@gt/domain/produce.schema";
import { isStepKind, type StepKind } from "@gt/domain/steps/registry";
import { canonical, sha256Hex } from "@gt/kernel/canonical";
import type { Reader } from "@gt/kernel/store";

import { isoOfMs, uploadOf, type Archive, type Row } from "./archive.ts";
import { markOriginal, type Sink, type StagedBlob } from "./bytes.ts";
import { publicFile, stageItems, stageThemes, type ItemPreview, type PublicFile, type StagedItem, type StagedTheme, type ThemePreview } from "./shelf.ts";
import { stageStep, type Loss, type StagedStep } from "./steps.ts";

// A v1 PROJECT, STAGED (Phase 4 wave D, L42) - what importing it WOULD create, read before
// anything is written (registry import-normalization: detect -> parse -> adapt -> review ->
// commit; "nothing persists to the real store until the commit action"). ./commit.ts writes a
// staged project in one transaction; the import screen and the route's preview show this.
//
// THE MAPPING (brief §L42.2, COMMON decisions 2 and 10):
//   recipe        `film/<template>` for every v1 template but `music-video`, which is the album
//                 recipe (`album-video`, the prototype's `recipeOfTemplate`); an ad template is a
//                 film recipe of its own (`film/ad-social-15`, `film/ad-spot-30`).
//   units         the template's pace at v1's OWN target length (`filmDefaults(targetS)`, not the
//                 template default) - and a frames record that holds N picture units plans N plates.
//   parts         the recipe's, as compose plans them (./commit.ts calls the creation door itself).
//   records       each v1 step row through ./steps.ts; the part of its owner kind holds it.
//   jobs          a work part that holds imported records has a terminal `done` job (imported -
//                 the work v1 did is the producer's output); one that holds none has NO job:
//                 the import never queues work (COMMON decision 3 - every launch is a receipt,
//                 then a confirm), and that part's work is the editor's acts from here.
//   launched      when any part holds a record. A v1 project with nothing in it is imported as a
//                 DRAFT, so its Plan launches through a receipt like any composed one.
//   sign-off      v1's `signedOff[step]` on a step whose gate part the recipe has, and whose
//                 judged part holds records: the gate is ratified by a committed packet whose one
//                 decision says "imported sign-off, v1 at <ts>". A sign-off with no gate to carry
//                 it (research, script, motion) is the done job itself, and is reported.
//   theme         a style ref on the project (`v1-theme:<id>`), the Style ./shelf.ts imports the
//                 theme as (Phase 5); the theme row is also kept in the import record (proofs as
//                 blobs) for the byte-exact re-export. A theme the Style door refuses leaves the
//                 project with no style, and says why.
//   assets        the shelf rows the project's records name (an ad's image takes, a poster, a
//                 logo), with their uploaded bytes as blobs, in the import record; every shelf
//                 row, named or not, also becomes a Library item (./shelf.ts) whose `project`
//                 collection is each imported project that names it.
// IDEMPOTENT BY v1 ID: the kernel id is `v1-<v1 id>`, so a re-import finds the row and SKIPS.

export const IMPORT_VERSION = 1;

export type Outcome = "import" | "skip" | "refuse";

/** The screen's and the route's view of one project: counts, never bytes. */
export type ProjectPreview = {
  readonly v1Id: string;
  readonly id: string;
  readonly title: string;
  readonly recipe: string;
  readonly outcome: Outcome;
  readonly reason?: string;
  readonly launched: boolean;
  readonly parts: number;
  readonly held: number;
  readonly done: readonly string[];
  readonly ratified: readonly string[];
  readonly blobs: number;
  readonly bytes: number;
  readonly losses: readonly Loss[];
};

/** The import record kept beside the project (as a blob; the event names it). */
export type ImportRecord = {
  readonly kind: "gravitone-v1-import";
  readonly v: typeof IMPORT_VERSION;
  readonly from: string;
  readonly exportedAt: number;
  readonly project: unknown;
  readonly steps: readonly unknown[];
  readonly theme?: unknown;
  readonly assets: readonly unknown[];
  readonly uploads: readonly unknown[];
};

export type StagedProject = {
  readonly preview: ProjectPreview;
  readonly row: Row;
  readonly steps: readonly StagedStep[];
  readonly record: ImportRecord;
  readonly blobs: readonly StagedBlob[];
  readonly units: Readonly<Record<string, number>>;
  readonly parts: readonly PlannedPart[];
  readonly styleId?: string;
  readonly runtimeS: number;
  /** Gate part key -> v1's sign-off instant (ISO). */
  readonly signed: ReadonlyMap<string, string>;
};

export type ImportPlan = {
  readonly projects: readonly StagedProject[];
  readonly themes: readonly StagedTheme[];
  readonly items: readonly StagedItem[];
  readonly losses: readonly Loss[];
  readonly token: string;
};

const V1_ID = /^[A-Za-z0-9._-]{1,120}$/;
export const kernelIdOf = (v1Id: string): string => `v1-${v1Id}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTemplate = (t: unknown): t is TemplateId => typeof t === "string" && TEMPLATES.some((x) => x.id === t);
export const recipeOfTemplate = (t: TemplateId): string => (t === "music-video" ? "album-video" : `film/${t}`);

/** Every string value in a value (to find the shelf rows a project's records name). */
function strings(v: unknown, out: Set<string>): Set<string> {
  if (typeof v === "string") out.add(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (isObj(v)) for (const x of Object.values(v)) strings(x, out);
  return out;
}

function refused(row: Row, reason: string): StagedProject {
  const v1Id = String(row["id"]);
  const preview: ProjectPreview = { v1Id, id: kernelIdOf(v1Id), title: String(row["title"] ?? v1Id), recipe: "", outcome: "refuse", reason, launched: false, parts: 0, held: 0, done: [], ratified: [], blobs: 0, bytes: 0, losses: [] };
  return { preview, row, steps: [], record: { kind: "gravitone-v1-import", v: IMPORT_VERSION, from: "", exportedAt: 0, project: row, steps: [], assets: [], uploads: [] }, blobs: [], units: {}, parts: [], runtimeS: 0, signed: new Map() };
}

function stageProject(archive: Archive, row: Row, exists: (id: string) => boolean, themes: ReadonlyMap<string, ThemePreview>): StagedProject {
  const v1Id = String(row["id"]);
  if (!V1_ID.test(v1Id)) return refused(row, `project id ${v1Id.slice(0, 40)} is not a v1 id`);
  const template = row["template"];
  if (!isTemplate(template)) return refused(row, `template ${String(template)} is not in the catalogue`);
  const recipe = recipeById(recipeOfTemplate(template));
  if (recipe === undefined) return refused(row, `no recipe for template ${template}`);
  const owners = new Set<StepKind>(recipe.parts.map((p) => p.kind).filter((k): k is StepKind => isStepKind(k)));
  const sink: Sink = new Map();
  const mine = archive.rows.steps.filter((s) => s["projectId"] === v1Id);
  const steps = mine.map((s) => stageStep(s, owners, sink));
  const losses: Loss[] = steps.flatMap((s) => (s.loss === undefined ? [] : [s.loss]));

  const themeId = typeof row["themeId"] === "string" ? row["themeId"] : undefined;
  const themeRow = themeId === undefined ? undefined : archive.rows.themes.find((t) => t["id"] === themeId);
  if (themeId !== undefined && themeRow === undefined) losses.push({ entity: "theme", grade: "dropped", reason: `theme ${themeId} is not in the archive` });
  const theme = themeId === undefined ? undefined : themes.get(themeId);
  const styled = themeRow !== undefined && theme !== undefined && theme.outcome !== "refuse";
  if (theme?.outcome === "refuse") losses.push({ entity: "theme", grade: "dropped", reason: `theme ${theme.name} is not a style the store takes: ${theme.reason ?? "refused"}` });

  const named = strings([row, mine], new Set());
  const assets = archive.rows.assets.filter((a) => named.has(String(a["id"])));
  const uploadIds = new Set(assets.map((a) => uploadOf(a["src"])).filter((x): x is string => x !== null));
  const uploads = archive.rows.uploads.filter((u) => uploadIds.has(String(u["id"])));
  const record: ImportRecord = {
    kind: "gravitone-v1-import",
    v: IMPORT_VERSION,
    from: archive.header.from,
    exportedAt: archive.header.exportedAt,
    project: row,
    steps: steps.map((s) => s.original),
    ...(themeRow === undefined ? {} : { theme: markOriginal(themeRow, sink) }),
    assets: assets.map((a) => markOriginal(a, sink)),
    uploads: uploads.map((u) => markOriginal(u, sink)),
  };

  const targetS = typeof row["targetS"] === "number" && row["targetS"] > 0 ? row["targetS"] : TEMPLATES.find((t) => t.id === template)?.defaultS ?? 120;
  const held = steps.filter((s) => s.held !== undefined);
  const frames = held.find((s) => s.held?.key === "frames")?.held?.record["units"];
  const pace = filmDefaults(targetS);
  const units: Record<string, number> = recipe.family === "film" ? { plates: Array.isArray(frames) && frames.length > 0 ? frames.length : pace.plates.value, shots: pace.shots.value, prompts: pace.prompts.value } : {};
  const parts = planParts(recipe, units);
  const holding = new Set(held.map((s) => s.held?.owner));
  const done = parts.filter((p) => isStepKind(p.kind) && holding.has(p.kind)).map((p) => p.key);
  const signedOff = isObj(row["signedOff"]) ? row["signedOff"] : {};
  const signed = new Map<string, string>();
  for (const [step, at] of Object.entries(signedOff)) {
    const when = isoOfMs(at);
    if (when === undefined) {
      losses.push({ entity: `sign-off ${step}`, grade: "dropped", reason: `v1's sign-off instant ${String(at)} is unreadable` });
      continue;
    }
    const gate = parts.find((p) => p.kind === "gate" && p.judges === step);
    if (gate !== undefined && done.includes(step)) signed.set(gate.key, when);
    else if (done.includes(step)) losses.push({ entity: `sign-off ${step}`, grade: "approximate", reason: `${step} has no gate in ${recipe.id}; its done part carries the sign-off` });
    else losses.push({ entity: `sign-off ${step}`, grade: "dropped", reason: `no ${step} part holds records to sign off in ${recipe.id}` });
  }
  const blobs = [...sink.values()];
  const id = kernelIdOf(v1Id);
  const styleId = styled ? theme.id : undefined;
  const title = String(row["title"] ?? "").trim() || "Untitled film";
  // The creation door, at staging: what commit's land() hands compose, so an input the door refuses
  // (a target whose units are no integer, say) is refused here with its sentence, not promised as import.
  const door = parseAt("compose", composeInputSchema, { recipe: recipe.id, title: title.slice(0, 200), ...(styleId === undefined ? {} : { styleId }), units });
  if (!door.ok) return refused(row, door.error.message);
  const preview: ProjectPreview = {
    v1Id,
    id,
    title,
    recipe: recipe.id,
    outcome: exists(id) ? "skip" : "import",
    ...(exists(id) ? { reason: `already imported as ${id}` } : {}),
    launched: done.length > 0,
    parts: parts.length,
    held: held.length,
    done,
    ratified: [...signed.keys()],
    blobs: blobs.length,
    bytes: blobs.reduce((n, b) => n + b.ref.bytes, 0),
    losses,
  };
  return { preview, row, steps, record, blobs, units, parts, ...(styleId === undefined ? {} : { styleId }), runtimeS: targetS, signed };
}

/** The preview a token binds: what each project, theme and shelf item would become, and the archive's digest. */
export const previewToken = (digest: string, projects: readonly ProjectPreview[], themes: readonly ThemePreview[], items: readonly ItemPreview[]): string =>
  sha256Hex(canonical({ digest, projects, themes, items }));

/**
 * Stage every project, theme and shelf asset of an archive against the store as it is now (`r`:
 * which ids already exist; `pub`: the studio's served files a seeded asset points at). Nothing
 * is written.
 */
export function planImport(r: Reader, archive: Archive, pub: PublicFile = publicFile): ImportPlan {
  const exists = (id: string) => r.get("SELECT 1 AS x FROM projects WHERE id = ?", id) !== undefined;
  const themes = stageThemes(r, archive);
  const byTheme = new Map(themes.map((t) => [t.preview.v1Id, t.preview]));
  const projects = archive.rows.projects.map((p) => stageProject(archive, p, exists, byTheme));
  // An asset's project collections: every project that lands or is already landed and names it.
  const named = new Map<string, string[]>();
  for (const p of projects) {
    if (p.preview.outcome === "refuse") continue;
    for (const a of p.record.assets) if (isObj(a)) named.set(String(a["id"]), [...(named.get(String(a["id"])) ?? []), p.preview.id]);
  }
  const items = stageItems(r, archive, named, pub);
  return {
    projects,
    themes,
    items,
    losses: [],
    token: previewToken(
      archive.digest,
      projects.map((p) => p.preview),
      themes.map((t) => t.preview),
      items.map((i) => i.preview),
    ),
  };
}
