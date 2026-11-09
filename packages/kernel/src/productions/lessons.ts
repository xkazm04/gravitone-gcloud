// A DONE PRODUCTION'S LESSONS (spark concept-casting-stages S6): one row per dimension (`beats`, `art-style`, `technique`).
// The text seat proposes them; ONLY THE OPERATOR edits or accepts. A proposal names what it was drawn from, every entry a
// piece of the production's own evidence; where the evidence holds nothing on a dimension the row says so (`nothing`)
// and can never be accepted. A dry stand-in's proposal can never be accepted either. The tables are ./schema.ts (migration 4).

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { LESSON_DIMENSIONS, LESSON_STATES, PRODUCTION_EVENTS, lessonIdOf, lessonSourceSchema, productionLessonSchema, type LessonDimension, type LessonSource, type Production, type ProductionLesson } from "@gt/domain/production";
import { z } from "zod";

import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { LESSON_COLUMNS, lessonRowSchema } from "./schema.ts";
import { readProduction } from "./store.ts";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const sourcesSchema = z.array(lessonSourceSchema);

function toLesson(row: Row): ProductionLesson {
  const r = must(parseAt("lesson row", lessonRowSchema, row));
  return must(
    parseAt("lesson", productionLessonSchema, {
      id: r.id,
      productionId: r.production_id,
      dimension: r.dimension,
      state: z.enum(LESSON_STATES).parse(r.state),
      text: r.text,
      ...(r.proposed_text === null ? {} : { proposedText: r.proposed_text }),
      drawnFrom: must(parseJsonAt(`lesson ${r.id} drawn_from`, sourcesSchema, r.drawn_from)),
      ...(r.dry === 1 ? { dry: true } : {}),
      proposedAt: r.proposed_at,
      ...(r.accepted_at === null ? {} : { acceptedAt: r.accepted_at }),
      ...(r.accepted_by === null ? {} : { acceptedBy: r.accepted_by }),
    }),
  );
}

/** A production's lessons in dimension order. */
export function lessonsOf(r: Reader, id: string): readonly ProductionLesson[] {
  const rows = r.all(`SELECT ${LESSON_COLUMNS} FROM production_lessons WHERE production_id = ?`, id).map(toLesson);
  return [...rows].sort((a, b) => LESSON_DIMENSIONS.indexOf(a.dimension) - LESSON_DIMENSIONS.indexOf(b.dimension));
}

export function readLesson(r: Reader, id: string, lessonId: string): ProductionLesson | undefined {
  const row = r.get(`SELECT ${LESSON_COLUMNS} FROM production_lessons WHERE production_id = ? AND id = ?`, id, lessonId);
  return row === undefined ? undefined : toLesson(row);
}

/** Every accepted lesson, newest first, with the production it came from. */
export function acceptedLessons(r: Reader): readonly { readonly lesson: ProductionLesson; readonly production: Production }[] {
  return r.all(`SELECT ${LESSON_COLUMNS} FROM production_lessons WHERE state = 'accepted' ORDER BY accepted_at DESC, rowid DESC`).flatMap((row) => {
    const lesson = toLesson(row);
    const production = readProduction(r, lesson.productionId);
    return production === undefined ? [] : [{ lesson, production }];
  });
}

/** A dimension's proposal: words and where they came from, or the sentence saying the evidence holds none. */
export type LessonProposal = { readonly dimension: LessonDimension; readonly text: string; readonly drawnFrom: readonly LessonSource[] } | { readonly dimension: LessonDimension; readonly nothing: string };

/**
 * Lands the seat's proposals, at most one per dimension, on a done production. A dimension that already has a row keeps it:
 * a re-driven job never replaces what the operator edited or accepted. Emits one `production.lesson-proposed` per row written.
 */
export function proposeLessonsIn(t: Tx, id: string, proposals: readonly LessonProposal[], dry: boolean, actor: Actor): readonly ProductionLesson[] {
  const p = readProduction(t, id);
  if (p === undefined) throw new AppError("not-found", `production: no ${id}`);
  if (p.stage !== "done") throw new AppError("refused", `lessons: ${id} is at ${p.stage}; a lesson is proposed only once the Board has approved the cut`);
  const out: ProductionLesson[] = [];
  for (const q of proposals) {
    const lessonId = lessonIdOf(q.dimension);
    if (t.get("SELECT 1 AS hit FROM production_lessons WHERE production_id = ? AND id = ?", id, lessonId) !== undefined) continue;
    const nothing = "nothing" in q;
    if (!nothing && q.drawnFrom.length === 0) throw new AppError("invalid", `lessons: the ${q.dimension} lesson names nothing it was drawn from`);
    t.run(
      "INSERT INTO production_lessons (production_id, id, dimension, state, text, drawn_from, dry, proposed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      lessonId,
      q.dimension,
      nothing ? "nothing" : "proposed",
      nothing ? q.nothing : q.text,
      JSON.stringify(nothing ? [] : q.drawnFrom),
      dry ? 1 : 0,
      t.at,
    );
    append(t, { actor, type: PRODUCTION_EVENTS.lessonProposed, subject: { kind: "production", id }, data: { lesson: lessonId, dimension: q.dimension, ...(nothing ? { nothing: true } : {}) } });
    const landed = readLesson(t, id, lessonId);
    if (landed !== undefined) out.push(landed);
  }
  return out;
}

const operatorOnly = (actor: Actor, what: string): void => {
  if (actor.kind !== "operator") throw new AppError("refused", `lessons: only the operator ${what} (${actor.kind} ${actor.id} tried)`);
};

function openLesson(t: Tx, id: string, lessonId: string): ProductionLesson {
  const l = readLesson(t, id, lessonId);
  if (l === undefined) throw new AppError("not-found", `lessons: ${id} has no ${lessonId}`);
  if (l.state === "nothing") throw new AppError("refused", `lessons: ${lessonId} says the evidence held nothing on ${l.dimension}; there is no lesson to change`);
  return l;
}

function writeText(t: Tx, id: string, l: ProductionLesson, text: string): void {
  t.run("UPDATE production_lessons SET text = ?, proposed_text = COALESCE(proposed_text, ?) WHERE production_id = ? AND id = ?", text, l.text, id, l.id);
}

/** The operator rewrites a proposed lesson. It stays proposed. */
export function editLessonIn(t: Tx, id: string, lessonId: string, text: string, actor: Actor): ProductionLesson {
  operatorOnly(actor, "edits a lesson");
  const words = text.trim();
  if (words === "") throw new AppError("invalid", "lessons: a lesson has words");
  const l = openLesson(t, id, lessonId);
  if (l.state === "accepted") throw new AppError("refused", `lessons: ${lessonId} is accepted and fixed`);
  if (words !== l.text) writeText(t, id, l, words);
  return readLesson(t, id, lessonId) ?? l;
}

/**
 * The operator accepts a proposed lesson, optionally with an edit. Accepting it again is a no-op and answers the lesson, so
 * a retry of the registry queue that follows can never write twice. Emits `production.lesson-accepted` once.
 */
export function acceptLessonIn(t: Tx, id: string, lessonId: string, text: string | undefined, actor: Actor): ProductionLesson {
  operatorOnly(actor, "accepts a lesson");
  const l = openLesson(t, id, lessonId);
  if (l.state === "accepted") return l;
  if (l.dry === true) throw new AppError("refused", `lessons: ${lessonId} was written by a dry stand-in; it can never be accepted`);
  const words = text?.trim();
  if (words === "") throw new AppError("invalid", "lessons: a lesson has words");
  if (words !== undefined && words !== l.text) writeText(t, id, l, words);
  t.run("UPDATE production_lessons SET state = 'accepted', accepted_at = ?, accepted_by = ? WHERE production_id = ? AND id = ?", t.at, actor.id, id, lessonId);
  append(t, { actor, type: PRODUCTION_EVENTS.lessonAccepted, subject: { kind: "production", id }, data: { lesson: lessonId, dimension: l.dimension } });
  const done = readLesson(t, id, lessonId);
  if (done === undefined) throw new AppError("internal", `lessons: ${lessonId} vanished from ${id}`);
  return done;
}
