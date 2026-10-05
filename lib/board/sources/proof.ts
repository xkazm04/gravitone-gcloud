// PROOF — a style's proof sheet, each proof approved or rejected (lib/themes.ts:47).
//
// `useThemes().judgeProof` is a hook, so the adapter writes through the store
// functions it wraps: `getTheme` fresh, map the one proof's state, `putTheme`.
// That is the whole of judgeProof (lib/useThemes.ts:116) minus the React state.
//
// A LOCKED style is left out. The native sheet stops offering approve/reject the
// moment a style locks (app/library/parts.tsx: `onJudge={locked ? undefined
// : …}`) — projects build on its approved proofs, and un-approving one would
// change the reference set under them. The Board does not reopen what the
// Library closed.

import { getTheme, listThemes, putTheme, statusOf } from "@/lib/themes";

import type { BoardEntry, BoardSourceExt } from "../source";
import { countEntries, itemId, itemsOf, keyOfItem, SourceUnavailable, VerdictRefused } from "../source";
import type { BoardVerdict } from "../types";
import { fromProof, toProof } from "../verdicts";

const SEP = "::";

export function makeProofSource(ctx: { uid: string | null }): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    if (!ctx.uid) throw new SourceUnavailable("not signed in");
    if (typeof indexedDB === "undefined") throw new SourceUnavailable("IndexedDB unavailable");
    const themes = await listThemes(ctx.uid);
    return themes
      .filter((t) => statusOf(t) !== "locked")
      .flatMap((t) =>
        t.proofs.map((p): BoardEntry => ({
          item: {
            id: itemId("proof", `${t.id}${SEP}${p.id}`),
            source: "proof",
            title: p.label,
            projectId: null,
            group: t.name,
            media: [{ kind: "image", src: `data:${p.mime};base64,${p.base64}` }],
            machinePick: null,
            verdict: fromProof(p.state),
            reasons: [],
            note: p.note ?? null,
            createdAt: new Date(p.createdAt).toISOString(),
          },
          href: "/library",
          facts: [
            { name: "model", value: p.model ?? "—" },
            { name: "provider", value: p.provider ?? "—" },
            { name: "cost", value: typeof p.costUsd === "number" ? `$${p.costUsd.toFixed(3)}` : "—" },
          ],
          refuse: {},
        })),
      );
  };
  return {
    id: "proof",
    label: "Proofs",
    reasonAxes: [],
    native: { href: "/library", label: "Library · Styles" },
    exclusive: false,
    commitsOn: null,
    count: async () => countEntries(await loadEntries()),
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict, _reasons?: string[], note?: string) {
      const key = keyOfItem(id);
      const at = key.indexOf(SEP);
      const themeId = key.slice(0, at);
      const proofId = key.slice(at + SEP.length);
      const theme = await getTheme(themeId);
      if (!theme) throw new VerdictRefused("That style no longer exists.");
      if (statusOf(theme) === "locked") throw new VerdictRefused("This style is locked; its proofs are final.");
      if (!theme.proofs.some((p) => p.id === proofId)) throw new VerdictRefused("That proof is no longer on the sheet.");
      await putTheme({
        ...theme,
        proofs: theme.proofs.map((p) => (p.id === proofId ? { ...p, state: toProof(verdict), note: note ?? p.note } : p)),
      });
    },
  };
}
