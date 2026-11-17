"use client";

// THE IDENTITY BAR (variant "sheet"): the wizard's, region for region - sleeve, title, one meta line, status - in its
// own classes (`wizard.module.css` `.identity`), so the bar is the baseline's box. Nothing else rides here.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { releaseKind, type Release } from "@gt/domain/release";

import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import w from "../../../../../_release/wizard/wizard.module.css";

export function Identity({ r, saving, onLeave }: { readonly r: Release; readonly saving: boolean; readonly onLeave: () => void }) {
  const total = r.tracks.reduce((a, t) => a + t.durationS, 0);
  return (
    <header className={w.identity}>
      {r.sleeve !== null && r.sleeve.href !== null ? <Plate src={r.sleeve.href} alt="" className={w.idArt} width={64} aspect={1} /> : <PlateMissing className={w.idArt} aspect={1} />}
      <div className={w.idText}>
        <span className={w.idTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
        <span className={w.idMeta}>
          {r.artist} · {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} {r.tracks.length === 1 ? "track" : "tracks"} · {clock(total)}
          {r.releaseDate === null ? "" : ` · ${day(r.releaseDate)}`}
        </span>
      </div>
      {saving && <Chip label="saving" dot />}
      <EntryPill entry={STATUS_ENTRY[r.status]} />
      <Button label="All releases" size="sm" onPress={onLeave} />
    </header>
  );
}
