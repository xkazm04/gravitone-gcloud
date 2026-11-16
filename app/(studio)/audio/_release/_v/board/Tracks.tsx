"use client";

// The tracklist of the open release: per track its title, version, ISRC and explicit flag, its order
// and removal; the credits drawer under a track holds its songwriters, credits and lyrics.
import { CREDIT_ROLES, type CreditRole, type ReleaseTrack } from "@gt/domain/release";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { TrackFields } from "../../draft.ts";
import { clock, orNull, sectionOf, trackNo, type SectionProps } from "./board.ts";
import { Cell, ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

const ROLE_OPTS = CREDIT_ROLES.map((r) => ({ value: r, label: r }));

function Credits({ id, n, t, patch }: { readonly id: string; readonly n: number; readonly t: ReleaseTrack; readonly patch: (f: TrackFields) => void }) {
  const writers = t.songwriters;
  const setWriter = (k: number, v: string) => patch({ songwriters: writers.map((w, j) => (j === k ? v : w)) });
  const setCredit = (k: number, name: string, role: CreditRole) => patch({ credits: t.credits.map((c, j) => (j === k ? { name, role } : c)) });
  return (
    <div id={id} className={s.credits}>
      <div className={s.creditCol} data-jump={`writers:${n}`}>
        <span className={s.cellLabel}>songwriters</span>
        {writers.map((w, k) => (
          <div key={k} className={s.creditRow}>
            <Field label={`track ${n} songwriter ${k + 1}`} value={w} onChange={(v) => setWriter(k, v)} />
            <Button label="remove" size="sm" onPress={() => patch({ songwriters: writers.filter((_, j) => j !== k) })} />
          </div>
        ))}
        <div>
          <Button label="add songwriter" size="sm" onPress={() => patch({ songwriters: [...writers, ""] })} />
        </div>
      </div>
      <div className={s.creditCol}>
        <span className={s.cellLabel}>credits</span>
        {t.credits.map((c, k) => (
          <div key={k} className={s.creditRow}>
            <Field label={`track ${n} credit ${k + 1} name`} value={c.name} onChange={(v) => setCredit(k, v, c.role)} />
            <Select label={`track ${n} credit ${k + 1} role`} options={ROLE_OPTS} value={c.role} onChange={(role) => setCredit(k, c.name, role)} />
            <Button label="remove" size="sm" onPress={() => patch({ credits: t.credits.filter((_, j) => j !== k) })} />
          </div>
        ))}
        <div>
          <Button label="add credit" size="sm" onPress={() => patch({ credits: [...t.credits, { name: "", role: "performer" }] })} />
        </div>
      </div>
      <Cell label="lyrics" wide>
        <TextArea label={`track ${n} lyrics`} rows={5} value={t.lyrics ?? ""} onChange={(v) => patch({ lyrics: orNull(v) })} />
      </Cell>
    </div>
  );
}

export function Tracks({ release: r, problems, dispatch, jump, expanded, onExpand, onShelf }: SectionProps & { readonly expanded: number | null; readonly onExpand: (i: number | null) => void; readonly onShelf: () => void }) {
  if (r.tracks.length === 0) {
    return (
      <div className={s.paneEmpty} data-jump="tracks">
        <Empty label="no tracks" action={{ label: "open shelf", tone: "cyan", onPress: onShelf }} />
      </div>
    );
  }
  const here = problems.filter((p) => sectionOf(p) === "tracks");
  return (
    <ol className={s.tracks}>
      {r.tracks.map((t, i) => {
        const n = i + 1;
        const patch = (fields: TrackFields) => dispatch({ type: "patchTrack", id: r.id, index: i, fields });
        const mine = here.filter((p) => trackNo(p) === n);
        const drawer = `trk-${r.id}-${i}`;
        return (
          <li key={t.takeId} className={s.track} data-jump={`title:${n}`}>
            <div className={s.trackRow} role="group" aria-label={`track ${n}, ${t.title}`}>
              <span className={s.trackNo} aria-hidden="true">
                {String(n).padStart(2, "0")}
              </span>
              <Cell label="title">
                <Field label={`track ${n} title`} value={t.title} onChange={(v) => patch({ title: v })} />
              </Cell>
              <Cell label="version">
                <Field label={`track ${n} version`} value={t.version ?? ""} onChange={(v) => patch({ version: orNull(v) })} />
              </Cell>
              <Cell label="ISRC" jump={`isrc:${n}`}>
                <Field label={`track ${n} ISRC`} placeholder="CC-XXX-YY-NNNNN" value={t.isrc ?? ""} onChange={(v) => patch({ isrc: orNull(v) })} />
              </Cell>
              <span className={s.trackTime}>{clock(t.durationS)}</span>
            </div>
            <div className={s.trackActs}>
              {t.audioHref === null && <Chip label="no audio" ghost casing="lower" />}
              <Toggle label="explicit" name={`track ${n} explicit`} on={t.explicit} onToggle={(v) => patch({ explicit: v })} />
              <Toggle label={`credits ${t.songwriters.length + t.credits.length}`} name={`track ${n} credits`} on={expanded === i} onToggle={(v) => onExpand(v ? i : null)} controls={drawer} />
              <span className={s.grow} />
              <Button label="up" size="sm" disabled={i === 0} onPress={() => dispatch({ type: "moveTrack", id: r.id, from: i, to: i - 1 })} />
              <Button label="down" size="sm" disabled={i === r.tracks.length - 1} onPress={() => dispatch({ type: "moveTrack", id: r.id, from: i, to: i + 1 })} />
              <Button label="remove" size="sm" tone="rose" onPress={() => dispatch({ type: "removeTrack", id: r.id, index: i })} />
            </div>
            {mine.length > 0 && (
              <div className={s.lines}>
                {mine.map((p) => (
                  <ProblemLine key={p.code} problem={p} onJump={() => jump(p)} />
                ))}
              </div>
            )}
            {expanded === i && <Credits id={drawer} n={n} t={t} patch={patch} />}
          </li>
        );
      })}
    </ol>
  );
}
