import { COMPOSER_RECIPE } from "@gt/catalog/partOptions";
import { planParts, recipeById, type WorkKind } from "@gt/catalog/recipes";
import { AppError } from "@gt/domain/errors";
import type { MediaLane } from "@gt/domain/lane";
import type { NativeProducer } from "@gt/domain/produce";
import type { ParsedRunInput } from "@gt/domain/produce.schema";

// WHAT A RUN IS, FROM WHAT LAUNCHED IT - the recipe, the work kind (and so the option table and the
// producer), the media lane and the units of a Run, for both doors a Run comes through: a Floor
// composer's input and a producer's own launch (Phase 4 wave B, item 5). Pure.
//
// The composer half moved here from launch.ts unchanged. The native half is new: until it, a
// producer's CLI or route enqueued a job with no Run row, so nothing could say what the job was
// FOR - its quote never reached the queue (records/schema.ts `quotedSecondsOf` read 0), Runs had
// no row to draw and `rerouteOptions` refused it. Each native producer maps to the catalog recipe
// whose work part it makes, so its options, its unit noun and its price come from the same table
// a Plan part of that kind reads.

export type RunPlan = { readonly recipe: string; readonly kind: WorkKind; readonly lane: MediaLane; readonly units: number };

type Native = { readonly media: MediaLane; readonly recipe: (input: ParsedRunInput) => string };

/** Exhaustive by the mapped type: a producer added to `ProducerRunInput` is a compile error here. */
const NATIVE: { readonly [P in NativeProducer]: Native } = {
  extract: { media: "image", recipe: () => "style/extract" },
  article: { media: "article", recipe: () => "article/post" },
  // A track's video is the album recipe's `render` part, made one track at a time.
  mv: { media: "video", recipe: () => "album-video" },
  suno: { media: "audio", recipe: () => "track/music" },
  // `all` runs both lanes; the two recipes have the same part, so `edu` stands for the pair.
  strips: { media: "video", recipe: (i) => ("producer" in i && i.producer === "strips" && i.lane === "stat" ? "strips/stat" : "strips/edu") },
  forge: { media: "image", recipe: () => "style/forge-sweep" },
  dojo: { media: "image", recipe: () => "style/dojo-cycle" },
  // A hunt renders a track's work part one leaf at a time: music leaves are `track/music`'s, effect
  // leaves `track/sfx`'s (the composer's two audio recipes, COMPOSER_RECIPE.audio).
  hunt: { media: "audio", recipe: (i) => ("producer" in i && i.producer === "hunt" && i.kind === "sfx" ? "track/sfx" : "track/music") },
};

/** The kind of a recipe's work part: the native recipe's own, or (album-video) the producer's. */
function workPart(recipeId: string, producer?: NativeProducer) {
  const recipe = recipeById(recipeId);
  const parts = recipe === undefined ? [] : planParts(recipe).filter((p) => p.kind !== "gate" && p.kind !== "slot");
  const part = producer === "mv" ? parts.find((p) => p.kind === "render") : parts[0];
  if (part === undefined) throw new AppError("internal", `run: recipe ${recipeId} has no work part${producer === undefined ? "" : ` for ${producer}`}`);
  return part;
}

const clamp = (units: number, range: readonly [number, number]): number => Math.min(range[1], Math.max(range[0], Math.round(units)));

export function runPlanOf(input: ParsedRunInput, units: number | undefined): RunPlan {
  if ("producer" in input) {
    const n = NATIVE[input.producer];
    const recipe = n.recipe(input);
    const part = workPart(recipe, input.producer);
    // A producer counts its own units (an extract run's sources, a strips round's cards); only a
    // count it did not give falls back to the recipe's default.
    const given = units ?? (input.producer === "extract" ? input.sources : undefined);
    return { recipe, kind: part.kind, lane: n.media, units: given === undefined ? part.units : Math.max(1, Math.round(given)) };
  }
  const map = COMPOSER_RECIPE[input.lane];
  const id = input.lane === "audio" ? ((input.kind === "sfx" ? map.sfx : map.music) ?? map.recipe) : map.recipe;
  const part = workPart(id);
  const range = part.unitsRange ?? [1, 200];
  return { recipe: id, kind: part.kind, lane: input.lane, units: units === undefined ? part.units : clamp(units, range) };
}
