// THE SUNO PIECES' PLACES IN THE THREAD (spark suno-advisor, S1 composition "thread"), pure so it is
// tested without a DOM. A card keeps the agent's own order: a prompt it showed before its audio stands
// above the card's timeline (the prompt, then its sketch), one shown after it stands below (what the
// take measured, then the version that answers it); a prompt carried in from an earlier answer folds
// to one line at the card's foot. A verdict the person sent reads as chips under their words, and a
// card's taste proposals that were already kept show as kept, not as a second keep.
import type { StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";

/** A prompt version's name as the thread says it: "Neon Overpass · p2", or its id alone. */
export const versionName = (node: Pick<StudioNodeOf<"suno_prompt">, "name" | "promptId">): string => (node.name === undefined ? node.promptId : `${node.name} · ${node.promptId}`);

/** Does the turn show its Suno prompt before its audio (track, parts or sections)? */
export function promptLeads(turn: Pick<StudioTurn, "show">): boolean {
  const p = turn.show.findIndex((n) => n.kind === "suno_prompt");
  const audio = turn.show.findIndex((n) => n.kind === "track" || n.kind === "stems" || n.kind === "sections");
  return p !== -1 && (audio === -1 || p < audio);
}

/** The answer number (1-based, counting agent turns) of a turn; null when it is not an agent turn shown. */
export function answerNumber(turns: readonly ParsedTurn[], turnId: string): number | null {
  let n = 0;
  for (const { turn } of turns) {
    if (turn.from !== "agent") continue;
    n++;
    if (turn.id === turnId) return n;
  }
  return null;
}

const norm = (line: string): string => line.trim().toLowerCase();

/** The kept lines a card's proposals already became (any case), so the card shows each once, as kept. */
export function keptOfProposals(rows: readonly { readonly line: string }[], kept: readonly StudioTasteLine[]): readonly StudioTasteLine[] {
  const proposed = new Set(rows.map((r) => norm(r.line)));
  return kept.filter((k) => proposed.has(norm(k.line)));
}

/** A verdict the person sent, as the chips under their words. */
export type VerdictChips = {
  /** The version it is about, by name (its id when the thread no longer shows it). */
  readonly version: string;
  readonly clip: "a" | "b" | "both";
  readonly call: "keep" | "drop" | null;
  readonly off: readonly string[];
  /** The uploaded take's file name (its id when no facts came back). */
  readonly take: string | null;
};

export function verdictChips(turn: StudioTurn, turns: readonly ParsedTurn[], takes: Readonly<Record<string, StudioTakeFacts>>): VerdictChips | null {
  const v = turn.verdict;
  if (v === undefined) return null;
  let node: StudioNodeOf<"suno_prompt"> | undefined;
  for (const { turn: t } of turns) {
    if (t.from !== "agent") continue;
    for (const n of t.show) if (n.kind === "suno_prompt" && n.promptId === v.promptId) node = n;
  }
  return {
    version: node === undefined ? v.promptId : versionName(node),
    clip: v.clip,
    call: v.keep === undefined ? null : v.keep ? "keep" : "drop",
    off: v.off ?? [],
    take: turn.takeId === undefined ? null : (takes[turn.takeId]?.name ?? turn.takeId),
  };
}

/** The facts of the take a track stands for, when it is the person's uploaded Suno take and was measured. */
export function takeFactsOf(node: StudioNodeOf<"track">, takes: Readonly<Record<string, StudioTakeFacts>>): StudioTakeFacts | null {
  if (node.answers?.as !== "suno" || node.takeId === undefined) return null;
  return takes[node.takeId] ?? null;
}
