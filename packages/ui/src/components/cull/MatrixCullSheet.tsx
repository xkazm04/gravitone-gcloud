"use client";

// VARIANT "contact sheet -> loupe" (prototype 2026-10-22). The packet as a photographer's contact
// sheet: every run one card (its reference over a strip of what it tried, a label, a pip per
// variant), filed under its group, many to a screen. A run is judged whole from the sheet (K / X /
// a reason), or opened - click or Z - and then the LOUPE takes the whole desk: the reference beside
// the variants at full size, judged one by one, ↑ ↓ to the neighbouring run, Z / Esc back to the
// sheet. The bottom bar never changes.
import { useRef } from "react";

import { tallyOf } from "../../board/cull.ts";
import { groupsOf, columnsOf } from "../../board/runs.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CullFoot } from "./CullFoot.tsx";
import type { MatrixCullProps } from "./MatrixCull.tsx";
import { RunCard } from "./RunCard.tsx";
import { RunView } from "./RunView.tsx";
import { SeriesBadge } from "./SeriesBadge.tsx";
import { useRunDesk } from "./useRunDesk.ts";
import s from "./Runs.module.css";

export function MatrixCullSheet({ packet, verdicts, decide, undo, onCommit, busy = false, announce = () => undefined, keys = true }: MatrixCullProps) {
  const { view, present } = packet;
  const grid = useRef<HTMLDivElement | null>(null);
  const loupe = useRef<HTMLDivElement | null>(null);
  const d = useRunDesk({ packet, verdicts, decide, undo, onCommit, announce, keys, columns: () => columnsOf(grid.current) });
  useLayer(keys && d.open, { kind: "zoom", panelRef: loupe, onClose: () => d.setOpen(false) });
  const byId = new Map<string, (typeof view.items)[number]>(view.items.map((it) => [it.id, it]));
  const mediaOf = (id: string) => ({ url: byId.get(id)?.url ?? "", mime: byId.get(id)?.media.mime ?? "image/png" });
  const groups = groupsOf(d.runs);
  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={
        <>
          {present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
          {present.series !== undefined && <SeriesBadge measured={present.series.measured} graded={present.series.graded} />}
        </>
      }
      foot={<CullFoot tally={tallyOf(d.cells, verdicts)} reasons={view.reasons.list.length} audio={view.lane === "audio"} refusals={d.refusals} busy={busy} onCommit={d.commit} />}
    >
      {d.open && d.run !== undefined ? (
        <div ref={loupe} className={s.desk}>
          <button type="button" className={s.back} onClick={() => d.setOpen(false)}>
            ← {groups.length > 1 ? d.run.group : "runs"}
          </button>
          <RunView run={d.run} at={d.runIx} of={d.runs.length} cells={d.cells} verdicts={verdicts} mediaOf={mediaOf} wordsOf={d.wordsOf} cur={d.cur} nudged={d.nudged} onPress={d.setCur} />
        </div>
      ) : (
        <div className={s.desk} role="grid" aria-label="runs">
          {groups.map((g, gi) => (
            <section key={g.group || "runs"} className={s.group} aria-label={g.group || "runs"}>
              {g.group !== "" && <span className={s.eyebrow}>{g.group}</span>}
              <div ref={gi === 0 ? grid : undefined} className={s.grid}>
                {g.runs.map(({ run, at }) => (
                  <RunCard
                    key={run.row}
                    run={run}
                    at={at}
                    cells={d.cells}
                    verdicts={verdicts}
                    mediaOf={mediaOf}
                    wordsOf={d.wordsOf}
                    face="sheet"
                    current={at === d.runIx}
                    nudged={run.members.some((i) => d.nudged.has(i))}
                    onPress={d.openRun}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DeskFrame>
  );
}
