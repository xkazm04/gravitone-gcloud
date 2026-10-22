"use server";

// THE LIBRARY'S SERVER ACTIONS - the LibraryPort the route calls (./contract.ts), over whichever
// side ./port.ts switches to. Each goes through the one action core (app/_server/actionCore.ts):
// who first, then the input through its zod door, then the body, then the wire envelope. Reads
// resolve the principal with `read` key use; the acts with `money`, as the Board's do - a pin is
// a write, and a write on a key set nobody could confirm is refused.

import { z } from "zod";

import { LIBRARY_KINDS, LIBRARY_PAGE_MAX, LIBRARY_SORTS, MODEL_EXPORT_PROJECTS } from "@gt/domain/library";

import { runAction } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import type { Principal } from "../../../../lib/principal.ts";
import { principal } from "../../../_server/principal.ts";
import type { LibraryPort } from "./contract.ts";
import { actOn, serverLibrary, type Who } from "./port.ts";

const word = z.string().min(1).max(200);
const facets = z.record(word, z.array(word).max(200));
const queryInput = z.object({
  kind: z.enum(LIBRARY_KINDS).optional(),
  q: z.string().max(400).optional(),
  facets: facets.optional(),
  sort: z.enum(LIBRARY_SORTS).optional(),
  offset: z.number().int().nonnegative().max(10_000_000).optional(),
  limit: z.number().int().min(0).max(LIBRARY_PAGE_MAX),
});
const id = z.string().min(1).max(400);
const act = z.discriminatedUnion("act", [
  z.object({ act: z.literal("pin"), collection: word.optional() }),
  z.object({ act: z.literal("unpin"), collection: word.optional() }),
  z.object({ act: z.literal("use-in-project"), projectId: word }),
  z.object({ act: z.literal("export"), project: z.enum(MODEL_EXPORT_PROJECTS) }),
]);

type In<K extends keyof LibraryPort> = Parameters<LibraryPort[K]>[0];
type Out<K extends keyof LibraryPort> = ReturnType<LibraryPort[K]>;

const reader = () => principal("read");

export async function query(input: In<"query">): Out<"query"> {
  return runAction("library query", reader, queryInput, (i) => serverLibrary().query(i), input);
}

export async function detail(input: In<"detail">): Out<"detail"> {
  return runAction("library detail", reader, z.object({ id, facets: facets.optional() }), (i) => serverLibrary().detail(i.id, i.facets ?? {}), input);
}

/** The ledger's actor for an act: the principal's uid; the shared secret names nobody. */
const as = (p: Principal): Who => ("uid" in p ? { who: p.uid } : {});

const actAction = action("library act", z.object({ id, act, facets: facets.optional() }), (i, who) => actOn(serverLibrary(), i.id, i.act, i.facets ?? {}, as(who)));
export async function libraryAct(input: In<"act">): Out<"act"> {
  return actAction(input);
}
