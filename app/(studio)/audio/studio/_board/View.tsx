"use client";

// THE TAKES BOARD (spark suno-advisor S1, composition c; `&v=board`). Suno returns two takes per
// generation, so the board is a table of generations: one ROW per prompt version, newest at the top,
// its head the prompt (compact, opening to the whole card) and its columns the local sketch, take a
// and take b - each take with its facts and its own verdict. The confirmed taste and the open
// proposals run across the top as a strip. The arrangement is ./board.ts over the one fold
// (../_host/suno.ts); everything arrives through VariantProps and nothing runs because it rendered.
// A conversation with no Suno version yet is the thread view, unchanged.
import { useEffect, useMemo, useRef, useState } from "react";

import { canSendIn } from "@gt/ui/components/dock/dock.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { TasteChips } from "@gt/ui/components/suno/TasteChips.tsx";

import { copyText } from "../../../_shell/clipboard.ts";
import { sunoVersions } from "../_host/suno.ts";
import type { VariantProps } from "../_host/types.ts";
import { View as ThreadView } from "../_view/View.tsx";
import { boardRows, openProposals, proposedIn, rowId } from "./board.ts";
import { Row } from "./Row.tsx";
import s from "./board.module.css";

const reducedMotion = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const copy = async (text: string): Promise<string | null> => {
  const r = await copyText(text);
  return r.ok ? null : r.error;
};

export function View(v: VariantProps) {
  const { session, suno, dock } = v;
  const versions = useMemo(() => sunoVersions(session.turns), [session.turns]);
  if (versions.length === 0) return <ThreadView {...v} />;
  return <Board v={v} versions={versions} canSend={canSendIn(dock.state)} taste={suno.taste} />;
}

function Board({ v, versions, canSend, taste }: { readonly v: VariantProps; readonly versions: ReturnType<typeof sunoVersions>; readonly canSend: boolean; readonly taste: VariantProps["suno"]["taste"] }) {
  const { session, suno } = v;
  const rows = useMemo(() => boardRows(versions, suno.takes), [versions, suno.takes]);
  const proposals = useMemo(() => openProposals(session.turns, taste), [session.turns, taste]);
  const newest = rows[0]?.version.promptId;
  // Opened / folded by hand, by promptId; a row nobody touched is open when it is the newest.
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});
  // A new generation lands at the top, above where the verdict was pressed (scroll anchoring holds
  // the old row in view): bring the new row to the eye. The first paint is left alone.
  const seen = useRef(newest);
  useEffect(() => {
    if (newest === undefined || seen.current === newest) return;
    seen.current = newest;
    document.getElementById(rowId(newest))?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }, [newest]);
  const shared = { v, taste, copy, canSend };
  return (
    <div className={s.board} data-view="board">
      {(proposals.length > 0 || taste.length > 0) && (
        <section className={s.taste} aria-label="taste">
          <CapsHeading text="taste" tally={{ value: taste.length, label: "kept" }} />
          <div className={s.tasteCols}>
            {proposals.length > 0 && (
              <TasteChips proposed={proposals} kept={[]} onKeep={(row) => suno.keepTaste(row, proposedIn(proposals, row.line))} onDrop={suno.dropTaste} />
            )}
            {taste.length > 0 && <TasteChips proposed={[]} kept={taste} onKeep={(row) => suno.keepTaste(row)} onDrop={suno.dropTaste} />}
          </div>
        </section>
      )}
      <CapsHeading text="generations" tally={{ value: rows.length }} />
      <ol className={s.rows} aria-label="generations, newest first">
        {rows.map((r) => (
          <Row key={r.version.promptId} row={r} newest={r.version.promptId === newest} open={opened[r.version.promptId] ?? r.version.promptId === newest} onOpen={(o) => setOpened((was) => ({ ...was, [r.version.promptId]: o }))} shared={shared} />
        ))}
      </ol>
    </div>
  );
}
