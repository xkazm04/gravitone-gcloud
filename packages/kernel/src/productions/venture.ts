// A PRODUCTION AND ITS VENTURE (spark concept-casting-stages S6): the operator's two acts, start and join, on any production
// that has a proven take, and the operator's own press on /scout/ventures. An agent can do none of these. A production joins
// one venture, once. A venture born here carries no genre and is not a night's (`isNightVenture`).

import { AppError } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { mintSlugId, operatorVentureProposal, provenVentureProposal, type Venture, type VentureFrame } from "@gt/domain/genre";
import { PRODUCTION_EVENTS, type Production } from "@gt/domain/production";

import { append } from "../events.ts";
import type { Reader, Tx } from "../store.ts";
import { bornVenture, listVentures, readVenture } from "../ventures/store.ts";
import { readProduction } from "./store.ts";

/** The operator's words for a new venture's frame. A proven video or an operator press names no genre. */
export type VentureWords = { readonly name: string; readonly tone: string; readonly audience: string; readonly format: string; readonly look: string };

const operatorOnly = (actor: Actor, what: string): void => {
  if (actor.kind !== "operator") throw new AppError("refused", `venture: only the operator ${what} (${actor.kind} ${actor.id} tried)`);
};

const fold = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

function nameRefusal(r: Reader, name: string): void {
  const twin = listVentures(r).find((v) => v.retiredAt === undefined && fold(v.name) === fold(name));
  if (twin !== undefined) throw new AppError("refused", `venture: "${name}" is live venture ${twin.id}'s`);
}

const frameOf = (w: VentureWords): VentureFrame => ({ tone: w.tone, audience: w.audience, format: w.format, look: w.look, genres: [] });

/** Why this production cannot start or join a venture yet, or undefined. */
export function ventureRefusalOf(p: Production): string | undefined {
  if (p.stage === "dropped") return `venture: ${p.id} was dropped`;
  if (!p.takes.some((t) => t.provenAt !== undefined)) return `venture: ${p.id} has no proven take; only a proven video starts or joins a venture`;
  if (p.ventureId !== undefined) return `venture: ${p.id} is already in ${p.ventureId}`;
  return undefined;
}

function mustHave(r: Reader, id: string): Production {
  const p = readProduction(r, id);
  if (p === undefined) throw new AppError("not-found", `production: no ${id}`);
  return p;
}

function setVentureIn(t: Tx, p: Production, ventureId: string, how: "started" | "joined", actor: Actor): Production {
  t.run("UPDATE productions SET venture_id = ? WHERE id = ?", ventureId, p.id);
  append(t, { actor, type: PRODUCTION_EVENTS.venture, subject: { kind: "production", id: p.id }, data: { venture: ventureId, how } });
  return mustHave(t, p.id);
}

/** Puts a proven production in a live venture. Joining the one it is already in answers as a no-op; another is refused. */
export function joinVentureIn(t: Tx, id: string, ventureId: string, actor: Actor): Production {
  operatorOnly(actor, "joins a production to a venture");
  const p = mustHave(t, id);
  if (p.ventureId === ventureId) return p;
  const refused = ventureRefusalOf(p);
  if (refused !== undefined) throw new AppError("refused", refused);
  const v = readVenture(t, ventureId);
  if (v === undefined) throw new AppError("not-found", `venture: no ${ventureId}`);
  if (v.retiredAt !== undefined) throw new AppError("refused", `venture: ${ventureId} was retired ${v.retiredAt.slice(0, 10)}`);
  return setVentureIn(t, p, ventureId, "joined", actor);
}

/** A proven video starts a venture of its own and is its first production. */
export function startVentureIn(t: Tx, id: string, words: VentureWords, actor: Actor): { readonly production: Production; readonly venture: Venture } {
  operatorOnly(actor, "starts a venture");
  const p = mustHave(t, id);
  const refused = ventureRefusalOf(p);
  if (refused !== undefined) throw new AppError("refused", refused);
  nameRefusal(t, words.name);
  const venture = bornVenture(t, { name: words.name, kind: "channel", frame: frameOf(words), proposal: provenVentureProposal(p.id), ground: "proven" }, actor);
  return { production: setVentureIn(t, p, venture.id, "started", actor), venture };
}

/** A venture on the operator's own word, with no video behind it yet. */
export function operatorVentureIn(t: Tx, words: VentureWords, actor: Actor): Venture {
  operatorOnly(actor, "creates a venture");
  nameRefusal(t, words.name);
  const slug = mintSlugId("vn", words.name, new Set(listVentures(t).map((v) => v.id))).slice(3);
  return bornVenture(t, { name: words.name, kind: "channel", frame: frameOf(words), proposal: operatorVentureProposal(slug), ground: "operator" }, actor);
}
