// TRIAGE — the research cards an explainer project keeps or cuts.
//
// The scope record (`research-scope`, ScopeStepData) is written by `useScope`,
// a hook that saves the whole `{ scope, confirmed }` record on every change.
// The adapter writes the same record through the same `saveStep`, read fresh
// and with `confirmed` carried through untouched.
//
// WHAT COUNTS AS A DECISION (lib/board/verdicts.ts fromTriage): a card with no
// explicit entry is in its default — facts kept, conclusions not taken — and
// nobody decided that. Once the creator CONFIRMS the board, the whole scope is
// theirs and every card reads as decided. A REQUIRED card cannot be cut: the
// library forbids its removal (CardTile.tsx `locked = !!card.required`), so the
// Board refuses a reject on it with the card's own reason.

import { saveStep, type ScopeStepData } from "@/app/_phases/_shared/stepStore";
import { buildCards, OPT_IN_DEFAULT, EMPTY, OPT_IN_IDS, stateOf } from "@/app/_phases/research/scope";

import type { BoardEntry, BoardSourceExt } from "../source";
import { countEntries, itemId, itemsOf, keyOfItem, VerdictRefused } from "../source";
import type { BoardVerdict } from "../types";
import { fromTriage, toTriage } from "../verdicts";
import { onExplainerPath, projectsFor, readOrThrow, serially, studioHref } from "./projects";

const SEP = "::";
const PHASE = "research-scope";
export const TRIAGE_CLEAR_REFUSAL = "the scope is confirmed — every card is decided";

export function makeTriageSource(ctx: { uid: string | null }): BoardSourceExt {
  const cards = buildCards();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const projects = await projectsFor(ctx.uid);
    const rows = await serially(projects, async (p) => {
      if (!(await onExplainerPath(p))) return [];
      const rec = await readOrThrow<ScopeStepData>(p.id, PHASE);
      const scope = rec?.scope ?? {};
      const confirmed = Boolean(rec?.confirmed);
      return cards.map((c): BoardEntry => ({
        item: {
          id: itemId("triage", `${p.id}${SEP}${c.id}`),
          source: "triage",
          title: c.title,
          projectId: p.id,
          group: p.title,
          media: [{ kind: "text", text: c.detail ?? c.title }],
          machinePick: null,
          verdict: fromTriage(scope[c.id], stateOf(scope, c.id), confirmed),
          reasons: [],
          note: null,
          createdAt: new Date(p.createdAt).toISOString(),
        },
        href: studioHref(p.id, "research"),
        facts: [
          { name: "kind", value: c.kind },
          ...(c.confidence ? [{ name: "confidence", value: c.confidence }] : []),
          ...(c.source ? [{ name: "source", value: c.source }] : []),
          ...(c.dependsOn.length ? [{ name: "needs", value: String(c.dependsOn.length) }] : []),
        ],
        refuse: {
          ...(c.required ? { reject: c.requiredWhy ?? "required — the library forbids cutting it" } : {}),
          ...(confirmed ? { clear: TRIAGE_CLEAR_REFUSAL } : {}),
        },
      }));
    });
    return rows.flat();
  };
  return {
    id: "triage",
    label: "Triage",
    reasonAxes: [],
    native: { href: "/projects", label: "Studio · Research" },
    exclusive: false,
    commitsOn: null,
    count: async () => countEntries(await loadEntries()),
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict) {
      const key = keyOfItem(id);
      const at = key.indexOf(SEP);
      const projectId = key.slice(0, at);
      const cardId = key.slice(at + SEP.length);
      const card = byId.get(cardId);
      if (!card) throw new VerdictRefused("That card is not in the notebook.");
      if (verdict === "reject" && card.required) throw new VerdictRefused(card.requiredWhy ?? "required — the library forbids cutting it");
      const rec = await readOrThrow<ScopeStepData>(projectId, PHASE);
      if (verdict === null && rec?.confirmed) throw new VerdictRefused(TRIAGE_CLEAR_REFUSAL);
      const scope = { ...(rec?.scope ?? {}) };
      const fallback = OPT_IN_IDS.has(cardId) ? OPT_IN_DEFAULT : EMPTY;
      const next = toTriage(scope[cardId], fallback, verdict);
      if (next) scope[cardId] = next;
      else delete scope[cardId];
      const out = await saveStep<ScopeStepData>(projectId, PHASE, { scope, confirmed: rec?.confirmed ?? null });
      if (!out.ok) throw new Error(out.trouble.message);
    },
  };
}
