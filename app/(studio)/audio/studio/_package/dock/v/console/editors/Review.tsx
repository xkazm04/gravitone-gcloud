"use client";

// THE REVIEW, OPENED FROM THE MASTER (prototype dock-package, "console"): every rule the release breaks in the store's
// words, blocks first, each a door to the strip that fixes it; and every signal still waiting, answerable here.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { ReleaseProblem } from "@gt/domain/release.problems";

import { STEP_LABEL, stepOf, trackIndexOf } from "../../../../../../_release/wizard/steps.ts";
import { Rules } from "../Rules.tsx";
import { Signals } from "../Signal.tsx";
import { Module } from "./Cell.tsx";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

export function ReviewEditor({ release: r, problems, session, go, reduce }: EditorProps) {
  const door = (p: ReleaseProblem) => {
    const step = stepOf(p);
    const ti = trackIndexOf(p);
    return { where: ti === null ? STEP_LABEL[step] : `${STEP_LABEL[step]} · ${ti + 1} ${r.tracks[ti]?.title ?? ""}`, go: () => go(step, ti ?? undefined) };
  };
  const blocks = problems.filter((p) => p.severity === "block");
  const warns = problems.filter((p) => p.severity === "warn");
  const paths = [...new Set(session.pending.map((p) => p.path))];
  return (
    <div className={s.stack}>
      {problems.length === 0 && <Chip label="nothing to fix" tone="emerald" dot />}
      {blocks.length > 0 && (
        <Module label="blocks" count={String(blocks.length)}>
          <Rules problems={blocks} label="blocks" reduce={reduce} door={door} />
        </Module>
      )}
      {warns.length > 0 && (
        <Module label="warnings" count={String(warns.length)}>
          <Rules problems={warns} label="warnings" reduce={reduce} door={door} />
        </Module>
      )}
      {paths.length > 0 && (
        <Module label="incoming" count={String(session.pending.length)}>
          <div className={s.signalGrid}>
            <Signals paths={paths} session={session} reduce={reduce} />
          </div>
        </Module>
      )}
    </div>
  );
}
