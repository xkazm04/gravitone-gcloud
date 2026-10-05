// ADOPTION — which candidate script an explainer project adopts.
//
// One item per (project, candidate render). The record is ONE pointer
// (`ScriptAdoptionStepData.renderId`, app/_phases/_shared/stepStore.ts:140)
// written by `useAdoption.adopt`, which is a hook; the adapter writes the same
// record through the same `saveStep` the hook calls, with the same convention
// (app/_phases/script/candidates/adoption.ts): a pick writes the id, an un-pick
// of the adopted one writes `""`, never a deletion.
//
// REJECT HAS NO WRITER. Adoption is one-of-N: the record can say "this one",
// and nothing about the others. A rejected candidate would be a verdict the
// Script step can neither show nor honour, so the Board refuses it and says so
// — approve another candidate, or open the step. And because approving B
// silently un-approves A, the source is `exclusive`: the Board re-reads it after
// a decide so an undo restores A too (lib/board/undo.ts).

import { saveStep, type ScriptAdoptionStepData } from "@/app/_phases/_shared/stepStore";
import { ADOPTION_PHASE } from "@/app/_phases/script/candidates/adoption";
import { RENDERS } from "@/app/_phases/script/renders";

import type { BoardEntry, BoardSourceExt } from "../source";
import { countEntries, itemId, itemsOf, keyOfItem, VerdictRefused } from "../source";
import type { BoardVerdict } from "../types";
import { fromAdoption, toAdoption } from "../verdicts";
import { onExplainerPath, projectsFor, readOrThrow, serially, studioHref } from "./projects";

const SEP = "::";
export const ADOPTION_REJECT_REFUSAL = "one pick per project — approve another candidate";

export function makeAdoptionSource(ctx: { uid: string | null }): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const projects = await projectsFor(ctx.uid);
    const rows = await serially(projects, async (p) => {
      if (!(await onExplainerPath(p))) return [];
      const rec = await readOrThrow<ScriptAdoptionStepData>(p.id, ADOPTION_PHASE);
      return RENDERS.map((r): BoardEntry => ({
        item: {
          id: itemId("adoption", `${p.id}${SEP}${r.id}`),
          source: "adoption",
          title: `${r.engineLabel} · ${r.title}`,
          projectId: p.id,
          group: p.title,
          media: [{ kind: "text", text: r.beats[0]?.text ?? r.title }],
          machinePick: null,
          verdict: fromAdoption(rec?.renderId, r.id),
          reasons: [],
          note: null,
          createdAt: new Date(p.createdAt).toISOString(),
        },
        href: studioHref(p.id, "script"),
        facts: [
          { name: "feels like", value: r.feelsLike },
          { name: "best for", value: r.bestFor },
          { name: "weakness", value: r.weakness },
          { name: "words", value: String(r.words) },
        ],
        refuse: { reject: ADOPTION_REJECT_REFUSAL },
      }));
    });
    return rows.flat();
  };
  return {
    id: "adoption",
    label: "Adoption",
    reasonAxes: [],
    native: { href: "/projects", label: "Studio · Script" },
    exclusive: true,
    commitsOn: null,
    count: async () => countEntries(await loadEntries()),
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict) {
      if (verdict === "reject") throw new VerdictRefused(ADOPTION_REJECT_REFUSAL);
      const key = keyOfItem(id);
      const at = key.indexOf(SEP);
      const projectId = key.slice(0, at);
      const renderId = key.slice(at + SEP.length);
      const rec = await readOrThrow<ScriptAdoptionStepData>(projectId, ADOPTION_PHASE);
      const write = toAdoption(rec?.renderId, renderId, verdict);
      if (write === undefined) return;
      const out = await saveStep<ScriptAdoptionStepData>(projectId, ADOPTION_PHASE, { renderId: write });
      if (!out.ok) throw new Error(out.trouble.message);
    },
  };
}
