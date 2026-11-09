import "server-only";

// THE SEAM for /scout/productions, the scout port's switch: GRAVITONE_PRODUCE_SIDE=fixture is the scripted slate
// (./fixture.ts, every act refused with a sentence saying so); otherwise the kernel's production record (./real.ts).

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ProductionId, ProductionSource, ProductionStage } from "@gt/domain/production";

import type { AudioDecisionInput, CastLaunchInput, CastLaunchView, CutLaunchInput, CutLaunchView, ProductionsView, RoleEditInput, TakeLaunchView, TakeRequestInput, VentureWordsInput } from "./contract.ts";
import { fixtureProductions } from "./fixture.ts";
import { realProductions } from "./real.ts";

export type ServerProductions = {
  readonly view: () => Promise<Result<ProductionsView>>;
  readonly start: (source: ProductionSource, who: Actor) => Promise<Result<ProductionsView>>;
  readonly launch: (input: TakeRequestInput, who: Actor) => Promise<Result<TakeLaunchView>>;
  readonly proven: (id: ProductionId, takeId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly drop: (id: ProductionId, who: Actor) => Promise<Result<ProductionsView>>;
  readonly move: (id: ProductionId, to: ProductionStage, who: Actor) => Promise<Result<ProductionsView>>;
  readonly castLaunch: (input: CastLaunchInput, who: Actor) => Promise<Result<CastLaunchView>>;
  readonly saveRoles: (id: ProductionId, roles: readonly RoleEditInput[], who: Actor) => Promise<Result<ProductionsView>>;
  readonly heard: (id: ProductionId, roundId: string, voiceId: string, at: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly pick: (id: ProductionId, roundId: string, character: string, voice: string, saveToLibrary: boolean, who: Actor) => Promise<Result<ProductionsView>>;
  readonly recast: (id: ProductionId, roleId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly retryVoices: (id: ProductionId, roundId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly retryCreate: (id: ProductionId, roundId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly decideAudio: (input: AudioDecisionInput, who: Actor) => Promise<Result<ProductionsView>>;
  readonly cutLaunch: (input: CutLaunchInput, who: Actor) => Promise<Result<CutLaunchView>>;
  readonly editLesson: (id: ProductionId, lessonId: string, text: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly acceptLesson: (id: ProductionId, lessonId: string, text: string | undefined, who: Actor) => Promise<Result<ProductionsView>>;
  readonly joinVenture: (id: ProductionId, ventureId: string, who: Actor) => Promise<Result<ProductionsView>>;
  readonly startVenture: (id: ProductionId, words: VentureWordsInput, who: Actor) => Promise<Result<ProductionsView>>;
};

const SCRIPTED = "the fixture side has no record to act on (GRAVITONE_PRODUCE_SIDE=fixture)";

const fixtureSide: ServerProductions = {
  view: async () => ok(unwrap(fixtureProductions())),
  start: async () => err("refused", SCRIPTED),
  launch: async () => err("refused", SCRIPTED),
  proven: async () => err("refused", SCRIPTED),
  drop: async () => err("refused", SCRIPTED),
  move: async () => err("refused", SCRIPTED),
  castLaunch: async () => err("refused", SCRIPTED),
  saveRoles: async () => err("refused", SCRIPTED),
  heard: async () => err("refused", SCRIPTED),
  pick: async () => err("refused", SCRIPTED),
  recast: async () => err("refused", SCRIPTED),
  retryVoices: async () => err("refused", SCRIPTED),
  retryCreate: async () => err("refused", SCRIPTED),
  decideAudio: async () => err("refused", SCRIPTED),
  cutLaunch: async () => err("refused", SCRIPTED),
  editLesson: async () => err("refused", SCRIPTED),
  acceptLesson: async () => err("refused", SCRIPTED),
  joinVenture: async () => err("refused", SCRIPTED),
  startVenture: async () => err("refused", SCRIPTED),
};

function unwrap(r: Result<ProductionsView>): ProductionsView {
  if (!r.ok) throw r.error;
  return r.value;
}

export function serverProductions(): ServerProductions {
  return process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? fixtureSide : realProductions;
}
