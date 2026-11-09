// THE PRODUCTION SEAM (spark concept-casting-stages S0): the final signatures S1 fills. A stub so the later sessions
// compile against one shape; every body refuses until S1 lands the kernel record, the moves and the take producer.
// Not registered as a producer yet.

import type { ActorKind } from "@gt/domain/event";
import type { Result } from "@gt/domain/errors";
import type { Production, ProductionId, ProductionSource, ProductionStage, ProductionTake, TakeKind } from "@gt/domain/production";

const notBuilt = (fn: string): never => {
  throw new Error(`lib/producers/production.ts: ${fn} is not built yet (S1)`);
};

export type StartProductionInput = { readonly source: ProductionSource; readonly title: string; readonly by: string };

/** Start a kept concept as a production. Nothing starts itself: a press of Start is the only caller. */
export async function startProduction(input: StartProductionInput): Promise<Result<Production>> {
  return notBuilt(`startProduction(${input.source.kind})`);
}

export type MoveProductionInput = { readonly id: ProductionId; readonly to: ProductionStage; readonly by: string; readonly actor: ActorKind };

/** One stage move; an illegal one is refused with @gt/domain/production `refusalOfMove`'s sentence. */
export async function moveProduction(input: MoveProductionInput): Promise<Result<Production>> {
  return notBuilt(`moveProduction(${input.id})`);
}

export type RequestTakeInput = { readonly id: ProductionId; readonly kind: TakeKind; readonly beats: readonly string[]; readonly by: string };

/** Enqueue a hero or rough-cut render on gpu.local from the storyboard's frames. */
export async function requestTake(input: RequestTakeInput): Promise<Result<ProductionTake>> {
  return notBuilt(`requestTake(${input.id})`);
}

/** The operator marks one take proven. Agents never reach this. */
export async function markProven(input: { readonly id: ProductionId; readonly takeId: string; readonly by: string }): Promise<Result<Production>> {
  return notBuilt(`markProven(${input.id})`);
}
