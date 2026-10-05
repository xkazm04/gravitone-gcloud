// ALTERNATIVE — which kept plate a scene of the cut uses.
//
// One item per alternative, in scenes that hold more than one (a scene with a
// single plate asks nothing). The native `select` (app/_phases/frames/
// alternatives/useAlternatives.ts:139) is a hook and does TWO writes: the
// scene's `activeId` in `frames-alts`, and — through `onAdopt`, i.e.
// useFrames' setFrames — the chosen plate onto the frame in the `frames`
// record, "exactly one place the answer lives". The adapter performs the same
// two writes through `saveStep`, frames record first: if the second write
// fails, the cut already shows the chosen picture and the alternatives view
// re-reads its active id on the next visit, which is the recoverable order.
//
// REJECT HAS NO WRITER. Discarding an alternative deletes a picture somebody
// paid for and the Frames step refuses to discard the last one
// (useAlternatives.ts `remove`); that stays a deliberate act on the native
// surface. CLEAR has none either: a scene always uses one picture. So this
// source decides by approve alone, and is `exclusive` — approving one plate
// un-approves its sibling, and the undo stack records both.

import { readStep, saveStep } from "@/app/_phases/_shared/stepStore";
import type { AltsStepData } from "@/app/_phases/frames/alternatives/alts";
import { SYNTH_MARK } from "@/app/_phases/frames/alternatives/alts";
import type { FramesStepData } from "@/app/_phases/frames/useFrames";

import type { BoardEntry, BoardSourceExt } from "../source";
import { countEntries, itemId, itemsOf, keyOfItem, VerdictRefused } from "../source";
import type { BoardVerdict } from "../types";
import { fromAlternative } from "../verdicts";
import { projectsFor, readOrThrow, serially, studioHref } from "./projects";

const SEP = "::";
const ALTS = "frames-alts";
const FRAMES = "frames";
export const ALT_REJECT_REFUSAL = "discarding a plate happens on the Frames step";
export const ALT_CLEAR_REFUSAL = "a scene always uses one plate — approve another";

export function makeAlternativeSource(ctx: { uid: string | null }): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const projects = await projectsFor(ctx.uid);
    const rows = await serially(projects, async (p) => {
      const alts = await readOrThrow<AltsStepData>(p.id, ALTS);
      if (!alts?.byFrame) return [];
      const frames = await readOrThrow<FramesStepData>(p.id, FRAMES);
      const titleOf = new Map((frames?.frames ?? []).map((f) => [f.id, f.title]));
      return Object.entries(alts.byFrame)
        .filter(([frameId, scene]) => !frameId.includes(SYNTH_MARK) && scene.alts.length > 1)
        .flatMap(([frameId, scene]) =>
          scene.alts.map((alt, n): BoardEntry => ({
            item: {
              id: itemId("alternative", `${p.id}${SEP}${frameId}${SEP}${alt.id}`),
              source: "alternative",
              title: `${titleOf.get(frameId) ?? frameId} · plate ${n + 1}/${scene.alts.length}`,
              projectId: p.id,
              group: p.title,
              media: alt.plate.src ? [{ kind: "image", src: alt.plate.src }] : [{ kind: "text", text: alt.plate.subject ?? "" }],
              machinePick: null,
              verdict: fromAlternative(scene.activeId, alt.id),
              reasons: [],
              note: alt.plate.note ?? null,
              createdAt: new Date(alt.createdAt).toISOString(),
            },
            href: studioHref(p.id, "frames"),
            facts: [
              { name: "model", value: alt.plate.model ?? "—" },
              { name: "cost", value: typeof alt.plate.costUsd === "number" ? `$${alt.plate.costUsd.toFixed(3)}` : "—" },
              ...(alt.seeded ? [{ name: "origin", value: "assembly" }] : []),
            ],
            refuse: { reject: ALT_REJECT_REFUSAL, clear: ALT_CLEAR_REFUSAL },
          })),
        );
    });
    return rows.flat();
  };
  return {
    id: "alternative",
    label: "Alternatives",
    reasonAxes: [],
    native: { href: "/projects", label: "Studio · Frames" },
    exclusive: true,
    commitsOn: null,
    count: async () => countEntries(await loadEntries()),
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict) {
      if (verdict === "reject") throw new VerdictRefused(ALT_REJECT_REFUSAL);
      const [projectId, frameId, altId] = keyOfItem(id).split(SEP);
      const altsRead = await readStep<AltsStepData>(projectId, ALTS);
      if (!altsRead.ok) throw new Error(altsRead.trouble.message);
      const scene = altsRead.data?.byFrame?.[frameId];
      const alt = scene?.alts.find((a) => a.id === altId);
      if (!scene || !alt) throw new VerdictRefused("That plate is no longer kept for this scene.");
      if (verdict === null) {
        // Undo of an approve lands here; the sibling's own approve, replayed
        // by the same undo, is what moves the scene — this one has nothing
        // to write.
        if (scene.activeId === altId) throw new VerdictRefused(ALT_CLEAR_REFUSAL);
        return;
      }
      if (scene.activeId === altId) return;

      const framesRead = await readStep<FramesStepData>(projectId, FRAMES);
      if (!framesRead.ok) throw new Error(framesRead.trouble.message);
      const stored = framesRead.data;
      if (!stored?.frames?.some((f) => f.id === frameId)) throw new VerdictRefused("That scene is not in the stored cut.");
      const wroteFrames = await saveStep<FramesStepData>(projectId, FRAMES, {
        ...stored,
        frames: stored.frames.map((f) => (f.id === frameId ? { ...f, plate: { ...alt.plate } } : f)),
      });
      if (!wroteFrames.ok) throw new Error(wroteFrames.trouble.message);
      const byFrame = { ...altsRead.data!.byFrame, [frameId]: { ...scene, activeId: altId } };
      const wroteAlts = await saveStep<AltsStepData>(projectId, ALTS, { byFrame });
      if (!wroteAlts.ok) throw new Error(wroteAlts.trouble.message);
    },
  };
}
