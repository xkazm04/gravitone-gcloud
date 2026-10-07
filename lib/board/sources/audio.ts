// AUDIO — a generated take moving through the sound pipeline, plus the prompts
// nothing has been spent on yet.
//
// STUB (WP0 of the masterpiece-pipeline-canvas spark). The signature below is
// final; the body is not written yet. It exists so that the registry, the
// canvas engine and the skins can be built in parallel against a contract that
// already compiles, rather than against each other.
//
// What the real adapter will read, all through routes that exist today
// (lib/sound/client.ts — a client component cannot import the store, which is
// filesystem-backed and server-only):
//   · `proposed`  GET /api/sound/hunts, every leaf whose state is still "idea".
//                 A hunt is operator-seeded, so this stage is EMPTY until one is
//                 drafted — the empty state must say that and offer the draft,
//                 not render as a bare Ghost.
//   · `working`   one generate call in flight. It is synchronous (≤240s) and
//                 not a job, so this band holds a request, not a record.
//   · `gate`      GET /api/sound/takes?verdict=kept&stage=pending, with
//                 `remaster` and `edit` as bands inside it.
//   · `done`      stage=finalized, which is the one stage carrying a real event
//                 timestamp (finalizedAt).
//
// Every write goes through PATCH /api/sound/takes/[id] and POST
// /api/sound/generate, so the server's `applyRules` stays the single authority
// and the canvas adds no second write path to keep consistent. In particular
// the finalize move must offer `needs: "label"` rather than discovering the
// existing 409 after the drop.

import type { BoardCount, BoardEntry } from "../source";
import { SourceUnavailable } from "../source";
import type {
  CanonStage,
  GroupAxis,
  LaneDef,
  MoveOffer,
  MoveRequest,
  MoveResult,
  PipelineEntry,
  PipelineItem,
  PipelinePlacement,
  PipelineSource,
  StageBand,
} from "../pipeline";
import { lanesFromItems } from "../pipeline";
import type { BoardVerdict } from "../types";

const NOT_BUILT = "the audio lane is not built yet (spark masterpiece-pipeline-canvas, WP2)";

export function makeAudioSource(): PipelineSource {
  const stages: CanonStage[] = ["proposed", "working", "gate", "done"];
  const bands: Partial<Record<CanonStage, StageBand[]>> = {
    gate: [
      { id: "pending", label: "pending" },
      { id: "remaster", label: "remaster" },
      { id: "edit", label: "edit" },
    ],
  };
  const groupAxes: GroupAxis[] = [{ id: "group", label: "row", of: (item) => item.lane }];

  return {
    id: "audio",
    label: "Audio",
    reasonAxes: [],
    native: { href: "/playground?m=arrange", label: "Sound lab" },
    exclusive: false,
    commitsOn: null,

    stages,
    bands,
    groupAxes,

    lanes: (items: readonly PipelineItem[], axis: GroupAxis): LaneDef[] => lanesFromItems(items, axis),

    placementOf: (): PipelinePlacement => {
      throw new SourceUnavailable(NOT_BUILT);
    },

    admits: (): MoveOffer => ({ kind: "refused", reason: NOT_BUILT }),

    move: async (_req: MoveRequest): Promise<MoveResult> => ({ ok: false, reason: NOT_BUILT, retryable: false }),

    loadPipeline: async (): Promise<PipelineEntry[]> => {
      throw new SourceUnavailable(NOT_BUILT);
    },

    count: async (): Promise<BoardCount> => {
      throw new SourceUnavailable(NOT_BUILT);
    },

    loadEntries: async (): Promise<BoardEntry[]> => {
      throw new SourceUnavailable(NOT_BUILT);
    },

    load: async () => {
      throw new SourceUnavailable(NOT_BUILT);
    },

    decide: async (_itemId: string, _verdict: BoardVerdict): Promise<void> => {
      throw new SourceUnavailable(NOT_BUILT);
    },
  };
}
