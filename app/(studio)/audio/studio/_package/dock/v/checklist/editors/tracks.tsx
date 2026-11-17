"use client";

// The Tracks items' editors, in the dialog (prototype dock-package, round 2, variant "checklist"): one track's own
// name for itself, its measured facts, its place in the order; and the shelf to add from.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { clock, db, orNull } from "../../../../../../_release/wizard/fmt.ts";
import { Shelf } from "../../../../../../_release/wizard/Shelf.tsx";
import { Cell } from "./details.tsx";
import { setTrack, type EditorProps } from "./types.ts";
import e from "./editors.module.css";

export function TrackEditor(p: EditorProps) {
  const { r, read, session } = p;
  const i = p.item.track ?? p.track;
  const t = r.tracks[i];
  if (t === undefined) return null;
  const patch = setTrack(p, i);
  const take = read.shelf.find((x) => x.takeId === t.takeId);
  const n = r.tracks.length;
  const move = (to: number) => session.dispatch({ type: "moveTrack", id: r.id, from: i, to });
  const facts = [
    ["length", clock(t.durationS)],
    ["loudness", take === undefined || take.lufs === null ? "—" : `${db(take.lufs)} LUFS`],
    ["peak", take === undefined || take.truePeakDb === null ? "—" : `${db(take.truePeakDb)} dBTP`],
    ["audio", t.audioHref === null ? "—" : "on file"],
  ] as const;
  return (
    <div className={e.stack}>
      <div className={e.form}>
        <Cell k="title" wide>
          <Field label={`track ${i + 1} title`} value={t.title} onChange={(v) => patch({ title: v })} />
        </Cell>
        <Cell k="version">
          <Field label={`track ${i + 1} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
        </Cell>
        <Cell k="ISRC">
          <Field label={`track ${i + 1} ISRC`} value={t.isrc ?? ""} placeholder="CC-XXX-YY-NNNNN" maxLength={15} onChange={(v) => patch({ isrc: orNull(v) })} />
        </Cell>
        <Cell k="explicit">
          <Toggle label={t.explicit ? "explicit" : "clean"} on={t.explicit} onToggle={(v) => patch({ explicit: v })} name={`track ${i + 1} explicit`} />
        </Cell>
      </div>
      <dl className={e.facts}>
        {facts.map(([k, v]) => (
          <div key={k} className={e.fact}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className={e.acts}>
        <Button label="Move up" size="sm" glyph="up" disabled={i === 0} onPress={() => move(i - 1)} />
        <Button label="Move down" size="sm" glyph="down" disabled={i === n - 1} onPress={() => move(i + 1)} />
        <span className={e.push}>
          <Button
            label="Remove"
            size="sm"
            tone="rose"
            onPress={() => {
              p.close();
              session.dispatch({ type: "removeTrack", id: r.id, index: i });
            }}
          />
        </span>
      </div>
    </div>
  );
}

export function ShelfEditor({ r, read, session }: EditorProps) {
  const on = new Set(r.tracks.map((t) => t.takeId));
  const rest = read.shelf.filter((t) => !on.has(t.takeId));
  return <Shelf takes={rest} label="shelf takes not on this release" mode={{ kind: "add", onAdd: (take) => session.dispatch({ type: "addTrack", id: r.id, take }) }} />;
}
