// GENRE AND VENTURE HEADS (spark scout-vision S2) - the kernel's half: who was born from which kept proposal, and
// who was retired. What a genre has proven is derived from the scout nights on read (lib/foundry/scout/genres.ts),
// never written here. The tables, their triggers and the row door are ./schema.ts (the `ventures` module).
//
// Every write is one transaction: the head row, its `venture_ops` line(s) and ONE ledger event (`genre.born`,
// `venture.born`, `genre.retired`, `venture.retired`) with the actor it was handed. A channel's ties to its genres
// land in the birth's transaction as `tied` ops and ride the `venture.born` event's `genres`.

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { BORN_VENTURE_KINDS, mintSlugId, type Genre, type Venture, type VentureFrame, type VentureKind } from "@gt/domain/genre";

import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import {
  GENRE_COLUMNS,
  VENTURE_COLUMNS,
  genreBirthSchema,
  genreRowSchema,
  grammarSchema,
  ventureBirthSchema,
  ventureFrameSchema,
  ventureRowSchema,
} from "./schema.ts";

/** What a kept `genre` proposal births; the id is minted from the name (mintSlugId), bornAt/by from the act. */
export type GenreBirth = Pick<Genre, "name" | "bornFrom" | "proposal" | "use" | "look" | "grammar">;
/** What a kept `venture` proposal births; a channel's frame names the genre(s) it is born from. */
export type VentureBirth = { readonly name: string; readonly kind: VentureKind; readonly frame: VentureFrame; readonly proposal: string };

/** A Result's value, or its error thrown: inside a read or a tx, a throw is the refusal. */
function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

// A row that will not parse is corruption; it refuses rather than reads as a head with fewer words.
function toGenre(row: Row): Genre {
  const r = must(parseAt("genre row", genreRowSchema, row));
  return {
    id: r.id,
    name: r.name,
    bornFrom: r.born_from,
    proposal: r.proposal,
    use: r.use,
    look: r.look,
    grammar: must(parseJsonAt(`genre ${r.id} grammar`, grammarSchema, r.grammar)),
    ...(r.venture_id === null ? {} : { ventureId: r.venture_id }),
    bornAt: r.born_at,
    by: r.born_by,
    ...(r.retired_at === null ? {} : { retiredAt: r.retired_at }),
  };
}

function toVenture(row: Row): Venture {
  const r = must(parseAt("venture row", ventureRowSchema, row));
  const f = must(parseJsonAt(`venture ${r.id} frame`, ventureFrameSchema, r.frame));
  const frame: VentureFrame = {
    tone: f.tone,
    audience: f.audience,
    format: f.format,
    look: f.look,
    genres: f.genres,
    ...(f.characters === undefined ? {} : { characters: f.characters }),
  };
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    frame,
    proposal: r.proposal,
    bornAt: r.born_at,
    by: r.born_by,
    ...(r.retired_at === null ? {} : { retiredAt: r.retired_at }),
  };
}

function op(t: Tx, subjectKind: "genre" | "venture", subjectId: string, what: "born" | "retired" | "tied", actor: Actor, data: EventData): void {
  t.run(
    "INSERT INTO venture_ops (subject_kind, subject_id, op, at, actor_kind, actor_id, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
    subjectKind,
    subjectId,
    what,
    t.at,
    actor.kind,
    actor.id,
    JSON.stringify(data),
  );
}

const takenIds = (r: Reader, table: "genres" | "ventures"): ReadonlySet<string> =>
  new Set(r.all(`SELECT id FROM ${table}`).map((row) => String(row["id"])));

/**
 * Births a genre. Idempotent on `proposal`: a second call for the same kept proposal returns the genre it already
 * birthed and writes nothing (the Board's apply may be redelivered). Emits `genre.born`.
 */
export function bornGenre(t: Tx, birth: GenreBirth, actor: Actor): Genre {
  const b = must(parseAt("genre birth", genreBirthSchema, birth));
  const prior = t.get(`SELECT ${GENRE_COLUMNS} FROM genres WHERE proposal = ?`, b.proposal);
  if (prior !== undefined) return toGenre(prior);
  const id = mintSlugId("gn", b.name, takenIds(t, "genres"));
  t.run(
    "INSERT INTO genres (id, name, born_from, proposal, use, look, grammar, born_at, born_by_kind, born_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    b.name,
    b.bornFrom,
    b.proposal,
    b.use,
    b.look,
    JSON.stringify(b.grammar),
    t.at,
    actor.kind,
    actor.id,
  );
  const data = { name: b.name, bornFrom: b.bornFrom, proposal: b.proposal };
  op(t, "genre", id, "born", actor, data);
  append(t, { actor, type: "genre.born", subject: { kind: "genre", id }, data });
  return mustGenre(t, id);
}

const bornKinds: readonly VentureKind[] = BORN_VENTURE_KINDS;

/**
 * Births a venture; idempotent on `proposal` like bornGenre. A channel ties each genre in `frame.genres` to it
 * (Genre.ventureId) in the same transaction. Refuses kind `game` until S4. Emits `venture.born`.
 */
export function bornVenture(t: Tx, birth: VentureBirth, actor: Actor): Venture {
  const b = must(parseAt("venture birth", ventureBirthSchema, birth));
  const prior = t.get(`SELECT ${VENTURE_COLUMNS} FROM ventures WHERE proposal = ?`, b.proposal);
  if (prior !== undefined) return toVenture(prior);
  if (!bornKinds.includes(b.kind)) throw new AppError("refused", `a ${b.kind} venture is born from its asset catalogue in S4; ${b.proposal} cannot birth one yet`);
  const genres = [...new Set(b.frame.genres)];
  if (b.kind === "channel" && genres.length === 0) throw new AppError("invalid", `a channel is born from at least one genre; ${b.proposal} names none`);
  for (const gid of genres) {
    const g = readGenre(t, gid);
    if (g === undefined) throw new AppError("not-found", `${b.proposal} names genre ${gid}, which was never born`);
    if (g.retiredAt !== undefined) throw new AppError("refused", `${b.proposal} names genre ${gid}, retired ${g.retiredAt}`);
    if (b.kind === "channel" && g.ventureId !== undefined) throw new AppError("conflict", `genre ${gid} already produces for ${g.ventureId}`);
  }
  const id = mintSlugId("vn", b.name, takenIds(t, "ventures"));
  const frame = { ...b.frame, genres };
  t.run(
    "INSERT INTO ventures (id, name, kind, frame, proposal, born_at, born_by_kind, born_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    b.name,
    b.kind,
    JSON.stringify(frame),
    b.proposal,
    t.at,
    actor.kind,
    actor.id,
  );
  const data = { name: b.name, kind: b.kind, proposal: b.proposal, genres };
  op(t, "venture", id, "born", actor, data);
  if (b.kind === "channel") {
    for (const gid of genres) {
      t.run("UPDATE genres SET venture_id = ? WHERE id = ?", id, gid);
      op(t, "genre", gid, "tied", actor, { ventureId: id });
    }
  }
  append(t, { actor, type: "venture.born", subject: { kind: "venture", id }, data });
  return mustVenture(t, id);
}

/** Retiring is the operator's act, never an agent's or a machine's. */
function operatorOnly(actor: Actor, what: string): void {
  if (actor.kind !== "operator") throw new AppError("refused", `retiring ${what} is the operator's act; ${actor.kind} ${actor.id} cannot`);
}

/** Retires a live genre (terminal); retiring a retired one refuses. Operator actors only. Emits `genre.retired`. */
export function retireGenre(t: Tx, id: string, actor: Actor): Genre {
  operatorOnly(actor, `genre ${id}`);
  const g = mustGenre(t, id);
  if (g.retiredAt !== undefined) throw new AppError("refused", `genre ${id} was retired ${g.retiredAt}`);
  t.run("UPDATE genres SET retired_at = ? WHERE id = ?", t.at, id);
  op(t, "genre", id, "retired", actor, {});
  append(t, { actor, type: "genre.retired", subject: { kind: "genre", id }, data: {} });
  return mustGenre(t, id);
}

/** Retires a live venture (terminal); operator actors only. Emits `venture.retired`. */
export function retireVenture(t: Tx, id: string, actor: Actor): Venture {
  operatorOnly(actor, `venture ${id}`);
  const v = mustVenture(t, id);
  if (v.retiredAt !== undefined) throw new AppError("refused", `venture ${id} was retired ${v.retiredAt}`);
  t.run("UPDATE ventures SET retired_at = ? WHERE id = ?", t.at, id);
  op(t, "venture", id, "retired", actor, {});
  append(t, { actor, type: "venture.retired", subject: { kind: "venture", id }, data: {} });
  return mustVenture(t, id);
}

export function readGenre(r: Reader, id: string): Genre | undefined {
  const row = r.get(`SELECT ${GENRE_COLUMNS} FROM genres WHERE id = ?`, id);
  return row === undefined ? undefined : toGenre(row);
}

/** Every genre, oldest birth first, retired ones included. */
export function listGenres(r: Reader): readonly Genre[] {
  // rowid breaks a tie between genres born in one transaction (one `t.at`): the later insert is younger.
  return r.all(`SELECT ${GENRE_COLUMNS} FROM genres ORDER BY born_at, rowid`).map(toGenre);
}

export function readVenture(r: Reader, id: string): Venture | undefined {
  const row = r.get(`SELECT ${VENTURE_COLUMNS} FROM ventures WHERE id = ?`, id);
  return row === undefined ? undefined : toVenture(row);
}

/** Every venture, oldest birth first, retired ones included. */
export function listVentures(r: Reader): readonly Venture[] {
  return r.all(`SELECT ${VENTURE_COLUMNS} FROM ventures ORDER BY born_at, rowid`).map(toVenture);
}

function mustGenre(r: Reader, id: string): Genre {
  const g = readGenre(r, id);
  if (g === undefined) throw new AppError("not-found", `no genre ${id}`);
  return g;
}

function mustVenture(r: Reader, id: string): Venture {
  const v = readVenture(r, id);
  if (v === undefined) throw new AppError("not-found", `no venture ${id}`);
  return v;
}
