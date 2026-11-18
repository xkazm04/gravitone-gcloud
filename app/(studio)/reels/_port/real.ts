// The /reels real side: the reels root (REELS_STORE_DIR, else foundry-out/reels) read folder by folder. Every fact
// is the folder's: the stage is `filmStageOf` over the state and the recorded verdicts (never stored), a verdict is
// current while its `of` is the film's sha now, a render's progress is the job's own reading. Media are served by
// the foundry file route's `kind=reel` door, film-relative paths under `film/`. A folder that does not read throws
// its own sentence; the page draws it verbatim.
import { stat } from "node:fs/promises";
import path from "node:path";

import { measureContinuity } from "@/lib/reel/continuity";
import { filmStageOf, filmSubjectSha } from "@/lib/reel/film";
import { readVerdicts, listReelSlugs, reelDir, type ReelVerdict, type ReelVerdicts, type StopKey } from "@/lib/reel/store";
import { readPublish, readReelState } from "@/lib/reel/studio";
import { parseTable } from "@/lib/reel/table";
import { FILM_DIR, FILM_SPEC, type FilmFace, type FilmRecord, type ReelState } from "@/lib/reel/types";
import { readJson } from "@/lib/foundry/runStore";
import { reelJobsOf, type ReelJobView } from "@/lib/producers/reel";

import { REEL_REASONS } from "./reasons.ts";
import type { ReelDetail, ReelLastVerdict, ReelRow, ReelTableView, ReelVerdictView, ReelsPort } from "./types.ts";

const media = (slug: string, filmRel: string): string => `/api/foundry/file?kind=reel&run=${encodeURIComponent(slug)}&path=${encodeURIComponent(`${FILM_DIR}/${filmRel}`)}`;

const exists = (abs: string): Promise<boolean> => stat(abs).then((s) => s.isFile(), () => false);

async function stateOf(slug: string): Promise<ReelState> {
  const r = await readReelState(slug);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function lastOf(v: ReelVerdicts): ReelLastVerdict | undefined {
  let last: ReelLastVerdict | undefined;
  for (const [stop, x] of Object.entries(v.stops) as [StopKey, ReelVerdict][]) {
    if (last === undefined || x.at > last.at) last = { stop, verdict: x.verdict, at: x.at };
  }
  return last;
}

const faces = <T>(f: (face: FilmFace) => T | undefined): Partial<Record<FilmFace, T>> => {
  const out: Partial<Record<FilmFace, T>> = {};
  for (const face of ["desktop", "phone"] as const) {
    const x = f(face);
    if (x !== undefined) out[face] = x;
  }
  return out;
};

const nonEmpty = <T extends object>(o: T): T | undefined => (Object.keys(o).length === 0 ? undefined : o);

function filmFacts(slug: string, film: FilmRecord | undefined): Pick<ReelRow, "seconds" | "bytes" | "poster" | "strip"> {
  if (film === undefined) return { strip: [] };
  const seconds = nonEmpty(faces((f) => film.renders[f]?.seconds));
  const bytes = nonEmpty(faces((f) => film.copies[f]?.bytes ?? film.renders[f]?.bytes));
  const poster = film.thumbs?.poster;
  return {
    strip: (film.thumbs?.desktop ?? []).map((t) => media(slug, t)),
    ...(seconds === undefined ? {} : { seconds }),
    ...(bytes === undefined ? {} : { bytes }),
    ...(poster === undefined ? {} : { poster: media(slug, poster) }),
  };
}

function progressOf(jobs: readonly ReelJobView[]): ReelRow["progress"] {
  return jobs.find((j) => j.kind === "reel-render" && j.state === "running" && j.progress !== undefined)?.progress;
}

async function rowFor(slug: string): Promise<{ row: ReelRow; state: ReelState; verdicts: ReelVerdicts; jobs: readonly ReelJobView[] }> {
  const [state, verdicts, jobs] = await Promise.all([stateOf(slug), readVerdicts(reelDir(slug)), reelJobsOf(slug)]);
  const last = lastOf(verdicts);
  const progress = progressOf(jobs);
  const row: ReelRow = {
    slug,
    title: state.idea.title,
    hook: state.idea.hook,
    stage: filmStageOf(state, verdicts),
    updatedAt: state.updatedAt,
    ...filmFacts(slug, state.film),
    ...(last === undefined ? {} : { last }),
    ...(progress === undefined ? {} : { progress }),
  };
  return { row, state, verdicts, jobs };
}

async function tableOf(slug: string): Promise<ReelTableView | undefined> {
  const raw = await readJson<unknown>(path.join(reelDir(slug), "table.json"));
  if (raw === null) return undefined;
  const t = parseTable(raw);
  if (typeof t === "string") throw new Error(`reel ${slug}: table.json: ${t}`);
  const c = measureContinuity(t);
  return {
    unit: t.unit,
    granularity: t.granularity,
    periods: t.periods.length,
    entities: t.entities.length,
    source: t.source,
    continuity: { ok: c.ok, steps: c.steps, leadChanges: c.leadChanges, movements: c.movements, events: c.events, failures: c.failures },
  };
}

function verdictViews(v: ReelVerdicts, shas: ReelDetail["subjectSha"]): ReelDetail["verdicts"] {
  const out: Partial<Record<StopKey, ReelVerdictView>> = {};
  for (const [stop, x] of Object.entries(v.stops) as [StopKey, ReelVerdict][]) {
    const now = stop === "film" || stop === "release" ? shas?.[stop] : undefined;
    out[stop] = { verdict: x.verdict, reasons: x.reasons, at: x.at, round: x.round, current: now === undefined ? stop !== "film" && stop !== "release" : x.of === now, ...(x.note === undefined ? {} : { note: x.note }), ...(x.pins === undefined ? {} : { pins: x.pins }) };
  }
  return out;
}

async function mediaOf(slug: string, film: FilmRecord | undefined): Promise<ReelDetail["media"]> {
  if (film === undefined) return {};
  const dir = path.join(reelDir(slug), FILM_DIR);
  const [mixD, mixP] = await Promise.all([exists(path.join(dir, FILM_SPEC.desktop.mix)), exists(path.join(dir, FILM_SPEC.phone.mix))]);
  const out: { -readonly [K in keyof ReelDetail["media"]]: ReelDetail["media"][K] } = {};
  if (film.renders.desktop !== undefined) out.desktop = media(slug, film.renders.desktop.file);
  if (film.renders.phone !== undefined) out.phone = media(slug, film.renders.phone.file);
  if (film.thumbs !== undefined && film.thumbs.phone.length > 0) out.phoneStrip = film.thumbs.phone.map((t) => media(slug, t));
  const d0 = film.thumbs?.desktop[0];
  const p0 = film.thumbs?.phone[0];
  if (d0 !== undefined) out.posterDesktop = media(slug, d0);
  if (p0 !== undefined) out.posterPhone = media(slug, p0);
  if (film.bed !== undefined && mixD) out.mixDesktop = media(slug, FILM_SPEC.desktop.mix);
  if (film.bed !== undefined && mixP) out.mixPhone = media(slug, FILM_SPEC.phone.mix);
  if (film.copies.desktop !== undefined) out.releaseDesktop = media(slug, film.copies.desktop.file);
  if (film.copies.phone !== undefined) out.releasePhone = media(slug, film.copies.phone.file);
  if (film.bed !== undefined) out.bed = media(slug, film.bed.file);
  return out;
}

export const realReels: ReelsPort = {
  async listReels() {
    const slugs = await listReelSlugs();
    const rows = await Promise.all(slugs.map(async (s) => (await rowFor(s)).row));
    return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  },
  async reel(slug) {
    if (!(await listReelSlugs()).includes(slug)) return undefined;
    const { row, state, verdicts, jobs } = await rowFor(slug);
    const film = state.film;
    const filmSha = film === undefined ? undefined : filmSubjectSha(film, "film");
    const releaseSha = film === undefined ? undefined : filmSubjectSha(film, "release");
    const subjectSha = nonEmpty({ ...(filmSha === undefined ? {} : { film: filmSha }), ...(releaseSha === undefined ? {} : { release: releaseSha }) });
    const [table, m, publish] = await Promise.all([tableOf(slug), mediaOf(slug, film), readPublish(slug)]);
    if (!publish.ok) throw new Error(publish.error.message);
    const prompt = film?.bed?.prompt;
    return {
      ...row,
      idea: state.idea,
      media: m,
      verdicts: verdictViews(verdicts, subjectSha),
      reasons: REEL_REASONS,
      jobs,
      ...(table === undefined ? {} : { table }),
      ...(film === undefined ? {} : { film }),
      ...(prompt === undefined ? {} : { bedPrompt: prompt }),
      ...(publish.value === undefined ? {} : { publish: publish.value }),
      ...(subjectSha === undefined ? {} : { subjectSha }),
    };
  },
};
