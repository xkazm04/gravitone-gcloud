"use client";

// THE PEOPLE ON A TRACK (prototype dock-package, "console"): songwriters by legal name, credits by role, the lyrics -
// one track at a time behind the track selector, each list with its signal and its rules in the store's words.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CREDIT_ROLES, type CreditRole } from "@gt/domain/release";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOnTrack } from "../../../../../../_release/wizard/steps.ts";
import { Rules } from "../Rules.tsx";
import { Signals } from "../Signal.tsx";
import { TrackSelect } from "../TrackSelect.tsx";
import { Module } from "./Cell.tsx";
import type { EditorProps } from "./props.ts";
import s from "../editor.module.css";

const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function Remove({ name, onPress }: { readonly name: string; readonly onPress: () => void }) {
  return (
    <button type="button" className={s.remove} aria-label={`remove ${name}`} onClick={onPress}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function People({ release: r, problems, dispatch, session, track, setTrack, reduce }: EditorProps) {
  const t = r.tracks[track];
  if (t === undefined) return null;
  const n = track + 1;
  const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: track, fields });
  const writers = t.songwriters;
  const setCredit = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: t.credits.map((c, j) => (j === k ? { ...c, ...f } : c)) });
  return (
    <Module label="people" count={`track ${n}`} field="writers">
      <TrackSelect tracks={r.tracks} problems={problems} pending={session.pending} step="details" current={track} onPick={setTrack} reduce={reduce} />
      <Rules problems={problemsOnTrack(problems, "details", track)} label={`track ${n} rules`} reduce={reduce} />
      <div className={s.cols}>
        <div className={s.list} aria-label={`track ${n} songwriters`} role="group">
          <span className={s.k}>songwriters · {writers.filter((w) => w.trim() !== "").length}</span>
          <Signals paths={[`track:${n}.songwriters`]} session={session} reduce={reduce} />
          {writers.map((w, k) => (
            <div key={k} className={s.listRow}>
              <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: writers.map((x, j) => (j === k ? v : x)) })} />
              <Remove name={`songwriter ${w.trim() === "" ? k + 1 : w}`} onPress={() => patch({ songwriters: writers.filter((_, j) => j !== k) })} />
            </div>
          ))}
          <span>
            <Button label="Add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
          </span>
        </div>
        <div className={s.list} aria-label={`track ${n} credits`} role="group">
          <span className={s.k}>credits · {t.credits.length}</span>
          <Signals paths={[`track:${n}.credits`]} session={session} reduce={reduce} />
          {t.credits.map((c, k) => (
            <div key={k} className={s.listRow} data-cols="2">
              <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => setCredit(k, { name: v })} />
              <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => setCredit(k, { role: v })} />
              <Remove name={`credit ${c.name.trim() === "" ? k + 1 : c.name}`} onPress={() => patch({ credits: t.credits.filter((_, j) => j !== k) })} />
            </div>
          ))}
          <span>
            <Button label="Add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
          </span>
        </div>
      </div>
      <div className={s.list} data-field="lyrics">
        <span className={s.k}>lyrics</span>
        <Signals paths={[`track:${n}.lyrics`]} session={session} reduce={reduce} />
        <TextArea label={`track ${n} lyrics`} value={t.lyrics ?? ""} rows={6} onChange={(v) => patch({ lyrics: orNull(v) })} />
      </div>
    </Module>
  );
}
