"use client";

// THE PEOPLE ON EACH TRACK: on the card one line per track - songwriters and credits as chips, the lyrics as a mark,
// the track's problems as its edge; the line opens the track's people in a dialog (songwriters by legal name, credits
// by role, the lyrics), each edit going straight to the session.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { CREDIT_ROLES, type CreditRole, type ReleaseTrack } from "@gt/domain/release";

import type { TrackFields } from "../../../../../../_release/draft.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOnTrack, severityOf, type StepProps } from "../../../../../../_release/wizard/steps.ts";
import { Sheet } from "../Door.tsx";
import s from "./steps.module.css";

const ROLE_OPTIONS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function PeopleEditor({ t, i, patch }: { readonly t: ReleaseTrack; readonly i: number; readonly patch: (f: TrackFields) => void }) {
  const writers = t.songwriters;
  const setCredit = (k: number, f: Partial<{ name: string; role: CreditRole }>) => patch({ credits: t.credits.map((c, j) => (j === k ? { ...c, ...f } : c)) });
  return (
    <div className={s.people}>
      <section className={s.group} aria-label={`track ${i + 1} songwriters`}>
        <span className={s.k}>songwriters · {writers.filter((w) => w.trim() !== "").length}</span>
        <ul className={s.rows}>
          {writers.map((w, k) => (
            <li key={k} className={s.editRow}>
              <Field label={`songwriter ${k + 1}`} value={w} placeholder="Jane Doe" onChange={(v) => patch({ songwriters: writers.map((x, j) => (j === k ? v : x)) })} />
              <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove songwriter ${w.trim() === "" ? k + 1 : w}`} onClick={() => patch({ songwriters: writers.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <Button label="Songwriter" size="sm" glyph="operator" onPress={() => patch({ songwriters: [...writers, ""] })} />
      </section>
      <section className={s.group} aria-label={`track ${i + 1} credits`}>
        <span className={s.k}>credits · {t.credits.length}</span>
        <ul className={s.rows}>
          {t.credits.map((c, k) => (
            <li key={k} className={s.editRow} data-cols="3">
              <Field label={`credit ${k + 1} name`} value={c.name} onChange={(v) => setCredit(k, { name: v })} />
              <Select label={`credit ${k + 1} role`} options={ROLE_OPTIONS} value={c.role} onChange={(v) => setCredit(k, { role: v })} />
              <button type="button" className={s.iconBtn} data-tone="rose" aria-label={`remove credit ${c.name.trim() === "" ? k + 1 : c.name}`} onClick={() => patch({ credits: t.credits.filter((_, j) => j !== k) })}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <Button label="Credit" size="sm" glyph="operator" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
      </section>
      <section className={s.group} data-w="full" aria-label={`track ${i + 1} lyrics`}>
        <span className={s.k}>lyrics</span>
        <TextArea label={`track ${i + 1} lyrics`} value={t.lyrics ?? ""} rows={7} onChange={(v) => patch({ lyrics: orNull(v) })} />
      </section>
    </div>
  );
}

function PeopleLine({ t, i, props }: { readonly t: ReleaseTrack; readonly i: number; readonly props: StepProps }) {
  const { release: r, problems, dispatch } = props;
  const [open, setOpen] = useState(false);
  const sev = severityOf(problemsOnTrack(problems, "details", i));
  const writers = t.songwriters.filter((w) => w.trim() !== "");
  const title = t.title.trim() === "" ? `track ${i + 1}` : t.title;
  return (
    <li className={s.peopleLine} data-issue={sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : undefined}>
      <button type="button" className={s.peopleFace} aria-haspopup="dialog" aria-label={`${title}: ${writers.length} songwriters, ${t.credits.length} credits, ${t.lyrics === null ? "no lyrics" : "lyrics"}. Edit`} onClick={() => setOpen(true)}>
        <span className={s.trackNo} aria-hidden="true">
          {i + 1}
        </span>
        <span className={s.peopleTitle} aria-hidden="true">
          {title}
        </span>
        <span className={s.trackChips} aria-hidden="true">
          {writers.length === 0 ? <Chip label="no songwriter" tone="rose" casing="lower" dot /> : writers.map((w) => <Chip key={w} label={w} casing="lower" tone={/\S\s+\S/.test(w) ? "neutral" : "amber"} />)}
          {t.credits.map((c, k) => (
            <Chip key={`${c.name}:${k}`} label={c.role} value={c.name === "" ? "—" : c.name} casing="lower" />
          ))}
          <Chip label={t.lyrics === null ? "no lyrics" : "lyrics"} casing="lower" ghost={t.lyrics === null} />
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`People · ${i + 1} ${title}`} size="xl">
        <PeopleEditor t={t} i={i} patch={(fields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields })} />
      </Sheet>
    </li>
  );
}

export function PeopleLines(props: StepProps) {
  return (
    <ol className={s.peopleList} aria-label="people on each track">
      {props.release.tracks.map((t, i) => (
        <PeopleLine key={t.takeId} t={t} i={i} props={props} />
      ))}
    </ol>
  );
}
