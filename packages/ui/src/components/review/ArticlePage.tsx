// The article as the reviewer reads it (prototype index.html `ArticleReview` page half and
// `EditNote`): numbered § sections in the serif reading measure, the focused one ruled cyan,
// a noted one amber, its notes under it, and the note editor - five directives and one line of
// text - opened under the section it is about. An illustrative draft says so on its first line.
import type { ReactNode } from "react";

import type { EditDirective, EditPlan } from "@gt/domain/board";
import { EDIT_DIRECTIVES } from "@gt/domain/board";

import type { ReviewDoc } from "../../board/port.ts";
import { notesOn } from "../../board/commit.ts";
import { FIELD_ATTR } from "../../keymap/target.ts";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import s from "./Review.module.css";

export type EditNoteProps = {
  /** ⏎ in the note: the form's own submit (see below). */
  readonly onAttach: () => void;
  readonly directive: EditDirective;
  readonly text: string;
  readonly onDirective: (d: EditDirective) => void;
  readonly onText: (t: string) => void;
  readonly section: number;
  /** Focus moves into the note when it opens (E); a /kit specimen leaves focus where it is. */
  readonly focus?: boolean;
};

export function EditNote({ onAttach, directive, text, onDirective, onText, section, focus = true }: EditNoteProps) {
  return (
    <div className={s.editNote} data-component="EditNote">
      <div className={s.directives} role="radiogroup" aria-label="directive">
        {EDIT_DIRECTIVES.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={directive === d} className={s.directive} onClick={() => onDirective(d)}>
            {d}
          </button>
        ))}
      </div>
      {/* ⏎ attaches through the form's submit, not a key row: the keymap gives Enter in a field
          to the field (target.ts: an input is a control), so the `attach` row is drawn as the
          legend and the browser's own submit runs it. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAttach();
        }}
      >
      <input
        className={s.noteText}
        aria-label={`note on section ${section}`}
        placeholder="§ directive detail"
        value={text}
        onChange={(e) => onText(e.currentTarget.value)}
        autoFocus={focus}
        {...{ [FIELD_ATTR]: "note" }}
      />
      </form>
      <div className={s.noteKeys}>
        <Keycaps mode="board.review" field="note" label="note keys" />
      </div>
    </div>
  );
}

export type ArticlePageProps = {
  readonly doc: ReviewDoc;
  readonly plan: EditPlan;
  readonly focus: number;
  readonly editing: number | null;
  readonly onFocus: (i: number) => void;
  readonly onNote: (i: number) => void;
  readonly editor: ReactNode;
};

export function ArticlePage({ doc, plan, focus, editing, onFocus, onNote, editor }: ArticlePageProps) {
  return (
    <article className={s.article} data-component="ArticlePage">
      {doc.illustrative === true && (
        <span className={s.illus}>
          <Chip label="illustrative draft" tone="amber" />
        </span>
      )}
      <h1 className={s.h1}>{doc.title}</h1>
      <p className={s.standfirst}>{doc.standfirst}</p>
      {doc.sections.map((sec, i) => {
        const notes = notesOn(plan, sec.id);
        return (
          <section key={sec.id} className={cx(s.sec, focus === i && s.focus, notes.length > 0 && s.noted)} data-sec={i} onClick={() => onFocus(i)}>
            <div className={s.secTools}>
              <Chip label="note" tone="amber" onPress={() => onNote(i)} name={`edit note on section ${i + 1}`} />
            </div>
            <h3 className={s.h3}>
              <span className={s.secno}>§{i + 1}</span>
              {sec.heading}
              {sec.regenerated === true && (
                <span className={s.regen}>
                  <Chip label={`regenerated · turn ${doc.turn}`} tone="cyan" />
                </span>
              )}
            </h3>
            <p className={s.p}>{sec.text}</p>
            {notes.map((n, j) => (
              <div key={`${n.directive}:${j}`} className={s.noteChip}>
                <Chip label={n.directive} tone="amber" casing="lower" />
                <span>{n.text}</span>
              </div>
            ))}
            {editing === i && editor}
          </section>
        );
      })}
    </article>
  );
}
