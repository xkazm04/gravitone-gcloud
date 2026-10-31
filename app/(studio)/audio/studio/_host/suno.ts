// THE SUNO THREAD OF A CONVERSATION (spark suno-advisor), pure so it is tested without a DOM: every
// prompt version the agent showed, in the order first shown, with what answered it - the local
// sketch of it, the person's verdicts on it and the takes they uploaded for it. All three S1
// compositions (thread, sheet, board) arrange this one fold; none of them re-derives it.
import type { StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";

import type { ParsedTurn } from "./types.ts";

export type SunoVerdict = {
  readonly turnId: string;
  readonly at: string;
  readonly text: string;
  readonly verdict: NonNullable<StudioTurn["verdict"]>;
  readonly takeId?: string;
};

export type SunoVersion = {
  readonly promptId: string;
  /** The turn that showed this version (the newest one, when a later turn re-showed it unchanged). */
  readonly turnId: string;
  readonly node: StudioNodeOf<"suno_prompt">;
  /** The local sketch of it (a `track` answering it `as: "sketch"`), newest. */
  readonly sketch?: { readonly turnId: string; readonly node: StudioNodeOf<"track"> };
  /** The person's verdicts on it, oldest first. */
  readonly verdicts: readonly SunoVerdict[];
  /** Takes uploaded for it: by the verdicts that carried one, and by agent tracks answering it `as: "suno"`. */
  readonly takes: readonly { readonly takeId: string; readonly clip?: "a" | "b"; readonly turnId: string }[];
};

export function sunoVersions(turns: readonly ParsedTurn[]): readonly SunoVersion[] {
  const order: string[] = [];
  const by = new Map<string, { turnId: string; node: StudioNodeOf<"suno_prompt">; sketch?: SunoVersion["sketch"]; verdicts: SunoVerdict[]; takes: { takeId: string; clip?: "a" | "b"; turnId: string }[] }>();
  const addTake = (promptId: string, take: { takeId: string; clip?: "a" | "b"; turnId: string }): void => {
    const v = by.get(promptId);
    if (v === undefined) return;
    const seen = v.takes.find((t) => t.takeId === take.takeId);
    if (seen === undefined) v.takes.push(take);
    else if (seen.clip === undefined && take.clip !== undefined) seen.clip = take.clip;
  };
  for (const { turn } of turns) {
    if (turn.from === "user") {
      if (turn.verdict === undefined) continue;
      const v = by.get(turn.verdict.promptId);
      if (v === undefined) continue;
      v.verdicts.push({ turnId: turn.id, at: turn.at, text: turn.text, verdict: turn.verdict, ...(turn.takeId !== undefined ? { takeId: turn.takeId } : {}) });
      const clip = turn.verdict.clip === "both" ? undefined : turn.verdict.clip;
      if (turn.takeId !== undefined) addTake(turn.verdict.promptId, { takeId: turn.takeId, turnId: turn.id, ...(clip !== undefined ? { clip } : {}) });
      continue;
    }
    for (const n of turn.show) {
      if (n.kind !== "suno_prompt") continue;
      const had = by.get(n.promptId);
      if (had === undefined) {
        order.push(n.promptId);
        by.set(n.promptId, { turnId: turn.id, node: n, verdicts: [], takes: [] });
      } else {
        had.turnId = turn.id;
        had.node = n;
      }
    }
    for (const n of turn.show) {
      if (n.kind !== "track" || n.answers === undefined) continue;
      const v = by.get(n.answers.promptId);
      if (v === undefined) continue;
      if (n.answers.as === "sketch") v.sketch = { turnId: turn.id, node: n };
      else if (n.takeId !== undefined) addTake(n.answers.promptId, { takeId: n.takeId, turnId: turn.id, ...(n.answers.clip !== undefined ? { clip: n.answers.clip } : {}) });
    }
  }
  return order.flatMap((id) => {
    const v = by.get(id);
    return v === undefined ? [] : [{ promptId: id, ...v }];
  });
}

/** The version a verdict sent now would be about: the newest one shown. */
export const newestVersion = (versions: readonly SunoVersion[]): SunoVersion | null => versions[versions.length - 1] ?? null;
