"use client";

// The Review items' detail, in the dialog (prototype dock-package, round 2, variant "checklist"): every problem in the
// store's words, each a door to the step that fixes it; every pending suggestion; the Calendar slots Schedule would
// create; and Schedule itself, which only a release with nothing blocking may press.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { CHANNEL_NAMES } from "@gt/domain/release";
import { PROBLEM_TEXT, releaseReady } from "@gt/domain/release.problems";

import { plannedSlots } from "../../../../../../_release/draft.ts";
import { day } from "../../../../../../_release/wizard/fmt.ts";
import { CHANNEL_ENTRY, STATUS_ENTRY } from "../../../../../../_release/wizard/status.ts";
import { STEP_LABEL, stepOf, trackIndexOf } from "../../../../../../_release/wizard/steps.ts";
import { StateMark } from "../ItemList.tsx";
import { Suggestion } from "../Suggestion.tsx";
import type { EditorProps } from "./types.ts";
import e from "./editors.module.css";

export function ProblemsEditor({ item, r, go, close }: EditorProps) {
  return (
    <ul className={e.rows}>
      {item.problems.map((p, i) => {
        const step = stepOf(p);
        const ti = trackIndexOf(p);
        const where = ti === null ? STEP_LABEL[step] : `${STEP_LABEL[step]} · ${r.tracks[ti]?.title ?? ti + 1}`;
        return (
          <li key={`${p.code}:${p.at}:${i}`}>
            <button
              type="button"
              className={e.door}
              aria-label={`${PROBLEM_TEXT[p.code]} Fix in ${where}`}
              onClick={() => {
                close();
                go(step, ti ?? undefined);
              }}
            >
              <StateMark mark={p.severity === "block" ? "need" : "warn"} />
              <span className={e.doorText}>{PROBLEM_TEXT[p.code]}</span>
              <span className={e.rowNote} aria-hidden="true">
                {where} ›
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SuggestionsEditor({ session }: EditorProps) {
  return (
    <div className={e.stack}>
      {session.pending.length > 1 && (
        <span>
          <Button label="Accept all" size="sm" tone="violet" tally={{ value: session.pending.length }} onPress={() => session.accept(session.pending.map((p) => p.id))} />
        </span>
      )}
      {session.pending.map((p) => (
        <Suggestion key={p.id} p={p} session={session} field />
      ))}
    </div>
  );
}

export function SlotsEditor({ r, read }: EditorProps) {
  const slots = plannedSlots(r, read.channels);
  return (
    <ul className={e.rows}>
      {slots.map((sl) => (
        <li key={sl.channel} className={e.rowLine}>
          <span className={e.rowName}>{CHANNEL_NAMES[sl.channel]}</span>
          <span className={e.rowValue}>{sl.at === null ? "when processed" : day(sl.at)}</span>
          <EntryPill entry={CHANNEL_ENTRY[sl.state]} />
          {sl.detail !== null && <span className={e.rowNote}>{sl.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleEditor({ r, read, problems, session }: EditorProps) {
  const ready = releaseReady(problems);
  const scheduled = r.status === "scheduled" || r.status === "published";
  const blocks = problems.filter((p) => p.severity === "block").length;
  const slots = plannedSlots(r, read.channels).length;
  return (
    <div className={e.stack}>
      <dl className={e.facts}>
        <div className={e.fact}>
          <dt>status</dt>
          <dd>
            <EntryPill entry={STATUS_ENTRY[r.status]} />
          </dd>
        </div>
        <div className={e.fact}>
          <dt>date</dt>
          <dd>{r.releaseDate === null ? "when processed" : day(r.releaseDate)}</dd>
        </div>
        <div className={e.fact}>
          <dt>slots</dt>
          <dd>{slots}</dd>
        </div>
      </dl>
      <span>
        <Button
          label={scheduled ? "Scheduled" : "Schedule"}
          tone="emerald"
          disabled={!ready || scheduled}
          {...(ready ? {} : { badge: { label: "block", value: blocks, tone: "rose" as const } })}
          onPress={() => session.dispatch({ type: "schedule", id: r.id })}
        />
      </span>
    </div>
  );
}
