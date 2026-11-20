// THE ONE WRITER OF A FILM OR RELEASE VERDICT (spark reel-studio). The /reels screen's actions and the Board's
// apply both come here, so a stop decided in one place reads decided in the other. A `release` keep lands both
// publish copies on the Calendar (lib/producers/reelActs.ts `landReelFilm`); nothing else lands a film.
//
// The order is the Board's (lib/decision/v1/sources/reel.ts, held from hitl-approval resume-after-decision): the
// subject is checked, a clash is refused BEFORE the Calendar is touched, the slots are made, and only then is the
// verdict recorded - a crash between the two heals on the next call, which finds the slots and writes the verdict.
// The same verdict twice is success both times (`same`); a round older than the head is `superseded` and lands
// nothing.
//
// No `server-only` mark: pipeline CLIs and the producers reach this too, and the kernel handle it opens by default
// is lib/kernelProcess.ts (the unmarked door).

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { err, ok, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Store } from "@gt/kernel/store";

import { FoundryError, readJson } from "../foundry/runStore.ts";
import { kernel } from "../kernelProcess.ts";
import { landReelFilm, reelScheduleOf } from "../producers/reelActs.ts";
import { filmSubjectSha } from "./film.ts";
import { parseState } from "./state.ts";
import { parsePublish, readVerdicts, recordVerdict, reelDir, roundOf, verdictClash, type Recorded, type ReelPublish, type ReelVerdict } from "./store.ts";
import { parseTable } from "./table.ts";
import { FILM_DIR, FILM_FACES, ReelError, type ReelState, type ReelTable } from "./types.ts";

export type FilmStopKey = "film" | "release";

export type Decided = {
  readonly recorded: Recorded;
  /** The Calendar slots a release keep made or found, one per face. */
  readonly slots?: readonly string[];
};

/** Who lands the slots and which store holds them. The /reels screen passes neither: the operator, in the process's kernel. */
export type DecideOptions = { readonly store?: () => Result<Store>; readonly by?: Actor };

/** The film's own publish words, film-relative. Written once on first need, then the operator's to edit. */
export const FILM_PUBLISH = `${FILM_DIR}/publish.json`;

const TITLE_MAX = 100;
const TAGS_MAX = 8;
const STOP_WORDS = new Set(["the", "and", "for", "from", "with", "who", "has", "have", "most", "every", "what", "which", "how", "many", "much", "was", "are", "all", "its", "that", "this", "than", "into", "over", "one", "two", "per"]);
const strip = (s: string): string => s.replace(/[<>]/g, "");

/** The words a film's two slots carry by default: the idea's title, its hook and the table's source line, tags from the title and the unit. */
export function defaultFilmPublish(state: Pick<ReelState, "idea">, table: Pick<ReelTable, "unit" | "source"> | undefined): ReelPublish {
  const title = strip(state.idea.title.trim()).slice(0, TITLE_MAX);
  const source = table === undefined ? [] : ["", `Source: ${table.source.name} (${table.source.url})`, `Licence: ${table.source.licence}`];
  const description = strip([state.idea.hook.trim(), ...source].join("\n"));
  const words = `${state.idea.title} ${table?.unit ?? ""}`.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const tags = [...new Set([...words.filter((w) => !STOP_WORDS.has(w)), "data visualization", "statistics"])].slice(0, TAGS_MAX);
  return { title, description, tags };
}

/** The reel's table, or undefined for a reel that has none (an imported film). */
export async function tableOf(dir: string): Promise<ReelTable | undefined> {
  const raw = await readJson<unknown>(path.join(dir, "table.json")).catch(() => null);
  if (raw === null) return undefined;
  const t = parseTable(raw);
  return typeof t === "string" ? undefined : t;
}

/** `film/publish.json` as it reads, or the default it would be written as; a file that does not read is its sentence. */
export async function filmPublishOf(dir: string, state: ReelState): Promise<{ readonly publish: ReelPublish | string; readonly written: boolean }> {
  const raw = await readJson<unknown>(path.join(dir, FILM_PUBLISH)).catch(() => "unreadable");
  if (raw === null) return { publish: defaultFilmPublish(state, await tableOf(dir)), written: false };
  const p = parsePublish(raw);
  return { publish: typeof p === "string" ? `${FILM_PUBLISH}: ${p}` : p, written: true };
}

/** Write the default `film/publish.json` when there is none (never over the operator's words), and return what it holds. */
export async function ensureFilmPublish(dir: string, state: ReelState): Promise<ReelPublish | string> {
  const at = await filmPublishOf(dir, state);
  if (at.written || typeof at.publish === "string") return at.publish;
  await writeFile(path.join(dir, FILM_PUBLISH), `${JSON.stringify(at.publish, null, 2)}\n`, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EEXIST") throw e;
  });
  return (await filmPublishOf(dir, state)).publish;
}

const BY_STATUS: Readonly<Record<number, AppErrorCode>> = { 400: "invalid", 403: "refused", 404: "not-found", 409: "conflict", 503: "unavailable" };

function failure(e: unknown): Result<never> {
  if (e instanceof FoundryError) return err(BY_STATUS[e.status] ?? "internal", e.message, { cause: e });
  if (e instanceof ReelError) return err(e.code === "unbuilt" ? "internal" : "invalid", e.message, { cause: e });
  return err("internal", e instanceof Error ? e.message : String(e), { cause: e });
}

const liveStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Record `verdict` for the film or release stop of `slug` (its `of` must be the current `filmSubjectSha`). */
export async function decideReelStop(slug: string, key: FilmStopKey, verdict: ReelVerdict, opts: DecideOptions = {}): Promise<Result<Decided>> {
  try {
    const dir = reelDir(slug);
    const state = parseState(await readJson<unknown>(path.join(dir, "reel.json")));
    if (typeof state === "string") return err("not-found", `reel ${slug}: reel.json: ${state}`);
    const film = state.film;
    const subject = film === undefined ? undefined : filmSubjectSha(film, key);
    if (film === undefined || subject === undefined) return err("not-found", `reel ${slug}: there is nothing to judge at the ${key} stop yet`);
    if (verdict.of !== subject) return err("conflict", `reel ${slug}: the film was made again since you looked`);
    if (verdict.verdict === "keep" && verdict.by !== "operator") return err("refused", `reel ${slug}: only an operator keeps the ${key} stop`);
    if (verdict.verdict === "drop" && key !== "film") return err("invalid", `reel ${slug}: only the film stop can be dropped`);

    const verdicts = await readVerdicts(dir);
    if (key === "release") {
      const fv = verdicts.stops.film;
      if (fv?.verdict !== "keep" || fv.of !== filmSubjectSha(film, "film")) return err("refused", `reel ${slug}: the film is not kept, so it has no release to decide`);
    }
    const held = verdicts.stops[key];
    if (held !== undefined && held.round > verdict.round) return ok({ recorded: "superseded" });
    const clash = verdictClash(slug, key, held, verdict);
    if (clash !== undefined) return err("refused", clash);
    const waiting = roundOf(held, subject).round;
    if (verdict.round !== waiting) return err("conflict", `reel ${slug}: round ${verdict.round} of the ${key} stop is not the one waiting (${waiting})`);

    const slots: string[] = [];
    if (key === "release" && verdict.verdict === "keep") {
      const schedule = reelScheduleOf(verdict.note, verdict.at);
      if (!schedule.ok) return schedule;
      const publish = await ensureFilmPublish(dir, state);
      if (typeof publish === "string") return err("invalid", `reel ${slug}: ${publish}`);
      const store = (opts.store ?? liveStore)();
      if (!store.ok) return store;
      const by: Actor = opts.by ?? { kind: "operator", id: "reels" };
      for (const face of FILM_FACES) {
        const copy = film.copies[face];
        if (copy === undefined) return err("not-found", `reel ${slug}: the ${face} copy is gone`);
        const slot = await landReelFilm(store.value, { slug, face, round: verdict.round, sha256: copy.sha, file: path.join(dir, FILM_DIR, copy.file), publish, schedule: schedule.value }, by);
        if (!slot.ok) return slot;
        slots.push(slot.value.slot.id);
      }
    }
    const recorded = await recordVerdict(dir, key, verdict);
    return ok({ recorded, ...(slots.length === 0 ? {} : { slots }) });
  } catch (e) {
    return failure(e);
  }
}
