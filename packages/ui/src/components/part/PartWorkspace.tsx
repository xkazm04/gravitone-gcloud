// THE PART WORKSPACE (STEPS-DESIGN §1): one frame for every part editor. Header - crumbs, the
// verdict chip, the receipt bar (the part's generating acts; the commit-type act lives here,
// never at the foot of a long list) and undo. Body - the item rail, ONE primary surface, the
// inspector. Foot - the part tabs from the recipe and, when an upstream part is not ready, the
// upstream break naming it. A FIXED viewport: the rails and the primary scroll inside their
// regions, the page never does (v1's research was 7000 px with its commit act at the bottom).
//
// No region takes prose: rail, primary and inspector are the editor's surfaces, the act bar takes
// buttons, and the only sentence the frame itself draws is the work's (the verdict's reason, the
// break's detail). The legend is Keycaps over the keymap rows for the editor's mode and `part`.
import type { ReactNode } from "react";

import type { PartTab, PartVerdict } from "@gt/domain/partView";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Crumbs, type Crumb } from "../crumbs/Crumbs.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Keycaps } from "../keycaps/Keycaps.tsx";
import { UpstreamBreak } from "../upstream/UpstreamBreak.tsx";
import { PartTabs } from "./PartTabs.tsx";
import { VerdictChip } from "./VerdictChip.tsx";
import s from "./Part.module.css";

export type Region = { readonly label: string; readonly children: ReactNode };

export type PartWorkspaceProps = {
  readonly trail: readonly Crumb[];
  readonly here: string;
  readonly verdict: PartVerdict;
  /** The receipt bar: the part's act buttons. */
  readonly acts: ReactNode;
  /** The last op still in effect, or null when there is nothing to undo. */
  readonly undo: { readonly last: string | null; readonly busy: boolean; readonly onUndo: () => void };
  readonly rail: Region;
  readonly primary: Region;
  readonly inspector: Region | null;
  readonly tabs: readonly PartTab[];
  readonly current: string;
  readonly href: (key: string) => string;
  /** Upstream parts that are not ready, in recipe order (their labels). */
  readonly upstream: readonly string[];
  /** The editor's keymap mode (`part.research`); the frame's own `part` rows are drawn beside it. */
  readonly mode: string;
  readonly facts?: readonly string[];
  /** Jobs this part launched that have not ended: the act, and since when in the caller's clock. */
  readonly running?: readonly PartRun[];
  /** The walk's next door, once this part is ready (`nextTab`); absent or null draws nothing. */
  readonly next?: { readonly label: string; readonly href: string } | null;
  /** The part's newest job, failed or interrupted: the store's sentence in full and its door on
   *  Runs, where the retry is. Absent or null draws nothing. */
  readonly failed?: PartJobFailure | null;
};

export type PartJobFailure = { readonly jobId: string; readonly state: string; readonly error?: string; readonly href: string };

export type PartRun = { readonly id: string; readonly label: string; readonly since: string; readonly stage?: string };

export function PartWorkspace(p: PartWorkspaceProps) {
  const facts = new Set(p.facts ?? []);
  const running = p.running ?? [];
  return (
    <div className={s.ws} data-component="PartWorkspace">
      <header className={s.head}>
        <div className={s.crumbs}>
          <Crumbs trail={p.trail} here={p.here} />
        </div>
        <VerdictChip verdict={p.verdict} />
        <div className={s.acts} role="group" aria-label="acts">
          {p.acts}
        </div>
        {/* A job in flight is a state, not a control: a live region, so a job that lands (and
            leaves it) is heard as well as seen. Nothing running draws nothing. */}
        <div className={s.running} role="status" aria-label="running">
          {running.map((r) => (
            <Chip key={r.id} label={r.label} value={[r.stage, `since ${r.since}`].filter((x) => x !== undefined).join(" · ")} tone="cyan" dot casing="lower" />
          ))}
        </div>
        {p.next != null && <Button label={`next · ${p.next.label}`} size="sm" glyphAfter="chevR" href={p.next.href} />}
        {/* Nothing to undo draws no control (the legend still names ⌫): a disarmed button is
            illegible by design and says less than its absence. */}
        {p.undo.last !== null && <Button label={`undo ${p.undo.last}`} size="sm" shortcut={{ mode: "part", verb: "undo" }} onPress={p.undo.onUndo} />}
        {/* A real error explains itself in full (ErrorLine, never shortened); the retry is Runs'
            act, so this is a door to the job there, not a second retry. A failure with no
            sentence on its record is drawn as its state. */}
        {p.failed != null && (
          <div className={s.failed} data-job={p.failed.jobId}>
            {p.failed.error === undefined ? <Chip label={p.failed.state} tone="rose" casing="lower" /> : <ErrorLine message={p.failed.error} />}
            <Button label="runs" size="sm" glyphAfter="chevR" href={p.failed.href} />
          </div>
        )}
      </header>
      <div className={p.inspector === null ? `${s.body} ${s.solo}` : s.body}>
        <section className={s.rail} aria-label={p.rail.label}>
          {p.rail.children}
        </section>
        <section className={s.primary} aria-label={p.primary.label}>
          {p.primary.children}
        </section>
        {p.inspector !== null && (
          <aside className={s.inspector} aria-label={p.inspector.label}>
            {p.inspector.children}
          </aside>
        )}
      </div>
      <footer className={s.foot}>
        <PartTabs tabs={p.tabs} current={p.current} href={p.href} />
        {p.upstream.length > 0 && (
          <div className={s.break}>
            <UpstreamBreak steps={[...p.upstream, p.here]} brokeAt={0} detail={`${p.upstream.join(" · ")} not ready`} />
          </div>
        )}
        <div className={s.keys}>
          <Keycaps mode={p.mode} label="keys" facts={facts} />
          <Keycaps mode="part" label="part keys" facts={facts} />
        </div>
      </footer>
    </div>
  );
}
