"use client";

// THE IDENTITY BAR (variant "focus"): the sleeve, the title, one meta line and the status - in the baseline's own
// frame classes so its box cannot drift. A write on its way is a small mark beside the status; leaving for every
// release is one glyph door at the end.
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";

import { clock, day, KIND_LABEL } from "../../../../_release/wizard/fmt.ts";
import { STATUS_ENTRY } from "../../../../_release/wizard/status.ts";
import w from "../../../../_release/wizard/wizard.module.css";
import s from "./focus.module.css";

export function Identity({ r, saving, onLeave }: { readonly r: Release; readonly saving: boolean; readonly onLeave: () => void }) {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  const meta = [r.artist, KIND_LABEL[releaseKind(r.tracks)], `${r.tracks.length} ${r.tracks.length === 1 ? "track" : "tracks"}`, clock(total), r.releaseDate === null ? null : day(r.releaseDate)];
  return (
    <header className={w.identity}>
      {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={w.idArt} width={64} aspect={1} /> : <PlateMissing className={w.idArt} aspect={1} />}
      <div className={w.idText}>
        <span className={w.idTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
        <span className={w.idMeta}>{meta.filter((x) => x !== null).join(" · ")}</span>
      </div>
      {saving && (
        <span className={s.saving} role="status">
          <span className={s.savingDot} aria-hidden="true" />
          saving
        </span>
      )}
      <EntryPill entry={STATUS_ENTRY[r.status]} />
      <button type="button" className={s.leave} onClick={onLeave} aria-label="all releases">
        <Glyph name="grid" />
      </button>
    </header>
  );
}
