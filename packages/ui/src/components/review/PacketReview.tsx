"use client";

// THE PACKET REVIEW (prototype index.html :625-682): the article on the left, what the machine
// checked and what reviewers said on the right, and three ends - Approve (A), Reject (R), or
// send an edit plan back (⇧E) for another turn. ↑/↓ walk the sections, E opens a note under
// the focused one; inside the note Tab cycles the five directives, ⏎ attaches, Esc cancels.
//
// Approve and Reject are verdicts on the one item, written through the gate like any other,
// then the commit flow shows what the commit will do before it does it (decision 6) - the
// prototype approved in one key and showed nothing. A reject names the source's reasons
// (CHECK_DIMENSIONS for an article) from the chips in the side panel. The edit plan is the
// prototype's EditNote list, sent as the structured plan (decision 8); the adapter renders it
// to v1's rework note.
//
// APPROVE -> CALENDAR (prototype :659, :842-850; Phase 6): a source whose kept subject is
// publishable (./schedule.ts SCHEDULE_CHANNELS - an article, by its blog pull request) shows the
// calendar control beside the oracle, proposed at the prototype's next-day 08:00 UTC, and Approve
// carries the schedule as the verdict's note. The applier makes the slot from that note in the
// commit's own apply; nothing is scheduled before the commit, and a schedule changed after the
// preview is a stale preview like any other decision.
import { useEffect, useState } from "react";

import type { EditDirective, EditNote as Note } from "@gt/domain/board";

import type { BoardPacket } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { cycleDirective, noteText } from "../../board/commit.ts";
import { useKeys } from "../../keymap/dispatch.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import { PipRow } from "../piprow/PipRow.tsx";
import { ApproveSchedule } from "./ApproveSchedule.tsx";
import { ArticlePage, EditNote } from "./ArticlePage.tsx";
import { encodeSchedule, proposeAt, scheduleChannels, type ScheduleIntent } from "./schedule.ts";
import s from "./Review.module.css";

export type PacketReviewProps = {
  readonly packet: BoardPacket;
  readonly verdicts: Readonly<Record<string, BoardVerdict>>;
  readonly decide: (ids: readonly string[], v: BoardVerdict | null, label: string) => void;
  readonly onCommit: () => void;
  readonly onSendPlan: (plan: readonly Note[]) => void;
  readonly busy?: boolean;
  readonly announce?: (message: string) => void;
  readonly keys?: boolean;
  /** The proposal's clock (the kit pins it); absent, the browser's. */
  readonly nowMs?: number;
};

export function PacketReview({ packet, verdicts, decide, onCommit, onSendPlan, busy = false, announce = () => undefined, keys = true, nowMs }: PacketReviewProps) {
  const { view, present } = packet;
  const doc = present.review;
  const item = view.items[0];
  const n = doc?.sections.length ?? 0;
  const [focus, setFocus] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [directive, setDirective] = useState<EditDirective>("more_weight");
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<readonly Note[]>([]);
  const [reasons, setReasons] = useState<readonly string[]>(() => (item === undefined ? [] : (verdicts[item.id]?.reasons ?? [])));
  const channels = scheduleChannels(view.source);
  const [schedule, setSchedule] = useState<ScheduleIntent | null>(() => {
    const first = channels[0];
    return first === undefined ? null : { channel: first, publishAt: proposeAt(nowMs ?? Date.now()) };
  });

  useEffect(() => {
    document.querySelector(`[data-sec="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  const openNote = (i: number) => {
    setFocus(i);
    setEditing(i);
    setText("");
  };
  const attach = () => {
    const sec = editing === null ? undefined : doc?.sections[editing];
    if (sec === undefined || editing === null) return;
    setPlan((p) => [...p, { section: sec.id, directive, text: noteText(directive, text) }]);
    setEditing(null);
    announce(`note attached to §${editing + 1}`);
  };
  const verdict = (v: "keep" | "reject") => {
    // A second press while a write or a preview is in flight is the same act again, not a new one.
    if (item === undefined || busy) return;
    decide([item.id], v === "keep" ? keepVerdict() : { verdict: "reject", reasons }, view.title ?? view.id);
    onCommit();
  };
  // The attached notes ride with the approve, as the prototype's decide({notes}) kept them.
  const keepVerdict = () => {
    if (schedule === null) return { verdict: "keep" as const, reasons: [] };
    const notes = plan.map((p) => `§${sectionNo(p.section)} ${p.directive}: ${p.text}`).join("\n");
    return { verdict: "keep" as const, reasons: [], note: encodeSchedule({ ...schedule, ...(notes === "" ? {} : { notes }) }).slice(0, view.reasons.noteMax) };
  };
  const send = () => {
    if (plan.length === 0) {
      announce("edit plan · attach a note first");
      return;
    }
    onSendPlan(plan);
  };

  useKeys(
    "board.review",
    {
      "prev-section": () => setFocus((f) => Math.max(0, f - 1)),
      "next-section": () => setFocus((f) => Math.min(Math.max(0, n - 1), f + 1)),
      note: () => openNote(focus),
      "send-edit-plan": send,
      approve: () => verdict("keep"),
      reject: () => verdict("reject"),
      directive: ({ cap }) => setDirective((d) => cycleDirective(d, cap.startsWith("⇧"))),
      attach,
      "cancel-note": () => setEditing(null),
    },
    { facts: doc === undefined ? [] : ["draft"], enabled: keys },
  );

  const toggle = (r: string) =>
    setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : cur.length >= view.reasons.max ? cur : view.reasons.list.filter((x) => x === r || cur.includes(x))));
  const sectionNo = (id: string) => (doc?.sections.findIndex((x) => x.id === id) ?? -1) + 1;

  return (
    <DeskFrame
      title={doc?.title ?? view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
      foot={
        <>
          <Keycaps mode="board.review" label="review keys" facts={new Set(doc === undefined ? [] : ["draft"])} />
          <div className={s.ends}>
            <Button label="Reject" tone="rose" shortcut={{ mode: "board.review", verb: "reject" }} onPress={() => verdict("reject")} />
            <Button label={`Edit plan · ${plan.length}`} tone="amber" shortcut={{ mode: "board.review", verb: "send-edit-plan" }} onPress={send} />
            <Button label={schedule === null ? "Approve" : "Approve → calendar"} tone="emerald" shortcut={{ mode: "board.review", verb: "approve" }} onPress={() => verdict("keep")} />
          </div>
        </>
      }
    >
      <div className={s.review} data-component="PacketReview">
        <div className={s.pageWrap}>
          {doc === undefined ? (
            <article className={s.article}>
              <span className={s.illus}>
                <Chip label="draft text not in this export" ghost />
              </span>
              <h1 className={s.h1}>{view.title ?? view.id}</h1>
            </article>
          ) : (
            <ArticlePage
              doc={doc}
              plan={plan}
              focus={focus}
              editing={editing}
              onFocus={setFocus}
              onNote={openNote}
              editor={<EditNote onAttach={attach} directive={directive} text={text} onDirective={setDirective} onText={setText} section={(editing ?? 0) + 1} />}
            />
          )}
        </div>
        <aside className={s.side}>
          {schedule !== null && <ApproveSchedule channels={channels} value={schedule} onChange={setSchedule} />}
          <CapsHeading text="oracle · before gate" />
          {(doc?.checks ?? []).map((c) => (
            <div key={c.name} className={s.checkrow}>
              <span>{c.name}</span>
              <b className={c.ok ? s.ok : s.bad}>{c.value}</b>
            </div>
          ))}
          {doc !== undefined && doc.reviewers.length > 0 && (
            <>
              <div className={s.sideHead}>
                <CapsHeading text="reviewers" />
                <PipRow looks={doc.reviewers.map((r) => (r.vote === "approve" ? "done" : "awaiting"))} label={`${doc.reviewers.filter((r) => r.vote === "approve").length} of ${doc.reviewers.length} approve`} />
              </div>
              {doc.reviewers.map((r) => (
                <div key={r.who} className={r.vote === "approve" ? s.rev : s.revRequest}>
                  <div className={s.who}>
                    <span>{r.who}</span>
                    <span className={r.vote === "approve" ? s.ok : s.ask}>{r.vote}</span>
                  </div>
                  {r.note}
                </div>
              ))}
            </>
          )}
          <CapsHeading text="edit plan" tally={{ value: plan.length, label: "notes" }} />
          {plan.map((p, i) => (
            <div key={`${p.section}:${i}`} className={s.noteChip}>
              <Chip label={`§${sectionNo(p.section)}`} />
              <Chip label={p.directive} tone="amber" casing="lower" />
              <span>{p.text}</span>
            </div>
          ))}
          {view.reasons.list.length > 0 && (
            <>
              <CapsHeading text="reject reasons" />
              <div className={s.reasons} role="group" aria-label="reject reasons">
                {view.reasons.list.map((r) => (
                  <Chip key={r} label={r} casing="lower" tone={reasons.includes(r) ? "rose" : "neutral"} pressed={reasons.includes(r)} onPress={() => toggle(r)} />
                ))}
              </div>
            </>
          )}
          {doc?.spend !== undefined && (
            <>
              <CapsHeading text="spend" />
              <div className={s.checkrow}>
                <span>run</span>
                <b className={s.bright}>
                  ${doc.spend.low}–{doc.spend.high}
                </b>
              </div>
            </>
          )}
        </aside>
      </div>
    </DeskFrame>
  );
}
