"use client";

// THE PROMPT SHEET (spark suno-advisor S1, composition b; `&v=sheet`). One living prompt pinned in
// the centre as a large SunoPromptCard - the newest version, or the one pinned from the rail until the
// conversation moves on - with the newest answer's next steps under it. Left, the versions rail: every
// version with its lineage and the verdicts said about it. Right, what answered the pinned version:
// its sketch, its takes with their facts, the verdicts in the person's words, and the taste profile.
// The agent's reply and the verdict row are the dock's (the host's): the verdict there is about the
// newest version, which is why a new turn pins the newest again. A conversation with no Suno version yet is
// the thread view, unchanged.
import { useMemo, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { SunoPromptCard } from "@gt/ui/components/suno/SunoPromptCard.tsx";

import { copyText } from "../../../_shell/clipboard.ts";
import { sunoVersions } from "../_host/suno.ts";
import type { VariantProps } from "../_host/types.ts";
import { askBlockedWords } from "../_view/model.ts";
import { View as ThreadView } from "../_view/View.tsx";
import { Rail } from "./Rail.tsx";
import { pinnedOf, type SheetPick } from "./sheet.ts";
import { SheetSide, Steps } from "./Side.tsx";
import s from "./sheet.module.css";

const copy = async (text: string): Promise<string | null> => {
  const r = await copyText(text);
  return r.ok ? null : r.error;
};

export function View(v: VariantProps) {
  const versions = useMemo(() => sunoVersions(v.session.turns), [v.session.turns]);
  const [pick, setPick] = useState<SheetPick | null>(null);
  const turns = v.session.turns.length;
  const pinned = pinnedOf(versions, pick, turns);
  if (pinned === null) return <ThreadView {...v} />;

  const at = versions.indexOf(pinned);
  const newest = at === versions.length - 1;
  const blocked = askBlockedWords(v.dock.state, v.dock.presence);
  return (
    <div className={s.sheet} data-view="sheet">
      <Rail versions={versions} pinned={pinned.promptId} onPin={(promptId) => setPick({ promptId, seen: turns })} />
      <section className={s.centre} aria-label="pinned prompt">
        <div className={s.pinBar}>
          <Chip label="version" value={`${at + 1} of ${versions.length}`} casing="lower" />
          {newest ? <Chip label="newest" tone="cyan" dot casing="lower" /> : <Button label="newest" size="sm" glyphAfter="chevR" onPress={() => setPick(null)} />}
        </div>
        <SunoPromptCard key={pinned.promptId} node={pinned.node} taste={v.suno.taste} copy={copy} />
        <Steps v={v} blocked={blocked} />
      </section>
      <SheetSide v={v} version={pinned} versions={versions} />
    </div>
  );
}
