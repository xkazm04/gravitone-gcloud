// The style's own words and records, as the document draws them and the Library's detail panel
// can reuse: the palette doing its jobs, the evidence a cull left, the exemplar plates.
//
//   Palette   v1 parts.tsx `PaletteDots`: the ROLE is what the swatch labels, because the role
//             is the part that keeps a style consistent ("an unassigned palette drifts").
//   Evidence  the prototype's library detail `.evt` table and its keep/reject/scenes tallies;
//             an agent's keep is shown and marked, never counted (v1 store.ts: "`proven` is a
//             human's claim"). Rows past the first page wait behind a count, not a scroll.
//   Plates    v1 StylesShelf's document strip; an abandoned replica says so - it is material,
//             never proof the recipe produces the style.
import type { BlobRef } from "@gt/domain/blob";
import type { StyleEvidenceRow, StyleExemplarView, StyleView } from "@gt/domain/styleView";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Plate } from "../desk/Plate.tsx";
import { StackBar } from "../stackbar/StackBar.tsx";
import { Tally } from "../tally/Tally.tsx";
import s from "./Style.module.css";

/** @gt/ui reaches the catalogue only through the domain's types (next-structure: ui imports domain). */
type PaletteColor = NonNullable<StyleView["palette"]>[number];

export function Palette({ palette }: { readonly palette: readonly PaletteColor[] }) {
  return (
    <ul className={s.palette} aria-label="palette" data-component="Palette">
      {palette.map((c) => (
        <li key={c.role} className={s.swatchRow}>
          {/* The colour is the record's own value, drawn as data - not a design value. */}
          <span className={s.swatch} style={{ background: c.hex }} aria-hidden="true" />
          <span className={s.role}>{c.role}</span>
          <span className={s.cname}>{c.name}</span>
          <code className={s.hex}>{c.hex}</code>
        </li>
      ))}
    </ul>
  );
}

const SHOWN = 8;

export function EvidenceTable({ rows, all = false }: { readonly rows: readonly StyleEvidenceRow[]; readonly all?: boolean }) {
  // `counts` is the view's own reading (an operator's keep); an agent's keep stays in the table,
  // marked, and in neither tally - nor is it a reject.
  const keep = rows.filter((r) => r.counts).length;
  const reject = rows.filter((r) => r.verdict === "reject").length;
  const scenes = new Set(rows.map((r) => `${r.run}/${r.scene}`)).size;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div className={s.evidence} data-component="EvidenceTable">
      <div className={s.evRow}>
        <Tally value={keep} label="keep" />
        <Tally value={reject} label="reject" />
        <Tally value={scenes} label="cells" />
        <StackBar kept={keep} rejected={reject} undecided={0} label="evidence" />
      </div>
      {shown.length > 0 && (
        <table className={s.evt}>
          <thead>
            <tr>
              <th scope="col">scene</th>
              <th scope="col">mechanism</th>
              <th scope="col">run</th>
              <th scope="col">verdict</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.run}/${r.scene}/${r.mechanism}/${r.at}`} data-counts={r.counts ? "" : undefined}>
                <td>{r.scene}</td>
                <td className={s.m}>{r.mechanism}</td>
                <td className={s.m}>{r.run.replace(/^\d{4}-\d{2}-\d{2}-/, "")}</td>
                <td className={cx(r.verdict === "keep" ? s.vKeep : s.vReject)}>
                  {r.verdict}
                  {r.by === "agent" && <Chip label="agent" casing="lower" ghost name="an agent's verdict: shown, not counted" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shown.length < rows.length && <Tally value={rows.length - shown.length} label="more rows" />}
    </div>
  );
}

export function PlateStrip({ exemplars, srcOf }: { readonly exemplars: readonly StyleExemplarView[]; readonly srcOf: (ref: BlobRef) => string }) {
  return (
    <ul className={s.strip} aria-label="exemplars" data-component="PlateStrip">
      {exemplars.map((x) => (
        <li key={`${x.run}/${x.media.sha256}`} className={cx(s.stripItem, x.abandoned && s.abandoned)}>
          <Plate className={s.plate} src={srcOf(x.media)} alt={`${x.role} from ${x.run}`} lazy />
          <span className={s.chips}>
            <Chip label={x.role} casing="lower" />
            {x.abandoned && <Chip label={x.settled ?? "abandoned"} tone="amber" casing="lower" ghost />}
          </span>
        </li>
      ))}
    </ul>
  );
}
