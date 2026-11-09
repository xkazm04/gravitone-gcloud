import "server-only";

// THE SEAM for /scout/productions, the scout port's switch: GRAVITONE_PRODUCE_SIDE=fixture is the scripted slate
// (./fixture.ts, every act refused with a sentence saying so); otherwise the kernel's production record (./real.ts).

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ProductionId, ProductionSource, ProductionStage } from "@gt/domain/production";

import type { ProductionsView, TakeLaunchView, TakeRequestInput } from "./contract.ts";
import { fixtureProductions } from "./fixture.ts";
import { realProductions } from "./real.ts";

export type ServerProductions = {
  readonly view: () => Promise<Result<ProductionsView>>;
  readonly start: (source: ProductionSource, who: Actor) => Promise<Result<ProductionsView>>;
  readonly launch: (input: TakeRequestInput, who: Actor) => Promise<Result<TakeLaunchView>>;
  readonly proven: (id: ProductionId, takeId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly drop: (id: ProductionId, who: Actor) => Promise<Result<ProductionsView>>;
  readonly move: (id: ProductionId, to: ProductionStage, who: Actor) => Promise<Result<ProductionsView>>;
};

const SCRIPTED = "the fixture side has no record to act on (GRAVITONE_PRODUCE_SIDE=fixture)";

const fixtureSide: ServerProductions = {
  view: async () => ok(unwrap(fixtureProductions())),
  start: async () => err("refused", SCRIPTED),
  launch: async () => err("refused", SCRIPTED),
  proven: async () => err("refused", SCRIPTED),
  drop: async () => err("refused", SCRIPTED),
  move: async () => err("refused", SCRIPTED),
};

function unwrap(r: Result<ProductionsView>): ProductionsView {
  if (!r.ok) throw r.error;
  return r.value;
}

export function serverProductions(): ServerProductions {
  return process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? fixtureSide : realProductions;
}
