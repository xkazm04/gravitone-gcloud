"use client";

// One item in the detail panel (library.js `body`, `preview`, `lineage`): preview, title, the
// chips that say what it is, its vocabulary as doors, its lineage, the kind's own extras, and the
// acts. Composed from @gt/ui's library parts; the audio parts are the audio lane's (L52), so a take
// reads the same here as where it was made. Nothing here narrates: each block is a caps heading
// over the work's own words and numbers.

import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { DetailChips, DetailFacets, DetailPreview, DetailSection, DetailTitle } from "@gt/ui/components/library/DetailPanel.tsx";
import { kindShort, type KindId } from "@gt/ui/components/library/LibraryGlyph.tsx";
import { Lineage } from "@gt/ui/components/library/Lineage.tsx";
import { ATTENTION_LABEL } from "@gt/ui/components/library/LibraryTile.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StackBar } from "@gt/ui/components/stackbar/StackBar.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { AudioMeasures } from "@gt/ui/components/audio/AudioMeasures.tsx";
import { AudioPreview } from "@gt/ui/components/audio/AudioPreview.tsx";
import { AudioPrompt } from "@gt/ui/components/audio/AudioPrompt.tsx";
import { ModelViewer } from "@gt/ui/components/model/ModelViewer.tsx";
import type { ModelExportProject } from "@gt/domain/library";

import type { ShownDetail } from "../_port/contract.ts";
import { ledgerFor } from "../../_shell/links.ts";
import { ExportRow, ModelFacts } from "./ModelDetail.tsx";
import s from "./library.module.css";

export type DetailViewProps = {
  readonly d: ShownDetail;
  readonly busy: boolean;
  readonly onFacet: (group: string, value: string, goto?: Exclude<KindId, "all">) => void;
  readonly onItem: (id: string) => void;
  readonly onPin: (on: boolean) => void;
  readonly onUse: (projectId: string) => void;
  readonly onExport: (project: ModelExportProject) => void;
};

function Extras({ d }: { readonly d: ShownDetail }) {
  const k = d.card.kind;
  const x = d.extras;
  if (k === "audio" && x.audio !== undefined) {
    return (
      <>
        <DetailSection title="Prompt">
          <AudioPrompt prompt={x.audio.prompt} reasons={x.audio.reasons} {...(x.audio.negative === undefined ? {} : { negative: x.audio.negative })} />
        </DetailSection>
        <DetailSection title="Measured">
          <AudioMeasures facts={x.audio.facts} />
        </DetailSection>
      </>
    );
  }
  if (k === "style") {
    const ev = x.evidence ?? [];
    const keep = ev.filter((e) => e.verdict === "keep").length;
    return (
      <>
        {ev.length > 0 && (
          <DetailSection title="Evidence">
            <div className={s.ev}>
              <Tally value={keep} label="keep" />
              <Tally value={ev.length - keep} label="reject" />
              <Tally value={new Set(ev.map((e) => e.scene)).size} label="scenes" />
              <span className={s.evBar}>
                <StackBar kept={keep} rejected={ev.length - keep} undecided={0} label={d.card.title} />
              </span>
            </div>
            <table className={s.evt}>
              <tbody>
                {ev.slice(0, 8).map((e, i) => (
                  <tr key={i}>
                    <td>{e.scene}</td>
                    <td className={s.m}>{e.mechanism ?? "—"}</td>
                    <td className={s.m}>{e.run.replace(/^\d{4}-\d{2}-\d{2}-/, "")}</td>
                    <td className={e.verdict === "keep" ? s.vKeep : s.vReject}>{e.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DetailSection>
        )}
        {x.prompt !== undefined && (
          <DetailSection title="Recipe">
            <p className={s.recipe}>{x.prompt}</p>
            {x.negative !== undefined && (
              <p className={s.neg}>
                <b>−</b> {x.negative}
              </p>
            )}
          </DetailSection>
        )}
      </>
    );
  }
  if (k === "video" && x.captions !== undefined) {
    return (
      <DetailSection title="Captions">
        <Tally value={x.captions} label="cues" />
      </DetailSection>
    );
  }
  if (k === "model" && x.model !== undefined) return <ModelFacts model={x.model} mesh={d.media?.mesh} />;
  if (k === "doc" && x.run !== undefined) {
    return (
      <DetailSection title="Article run">
        <div className={s.ev}>
          <Chip label={x.run.id} casing="lower" />
          {x.run.stage !== undefined && <Chip label={x.run.stage} tone="amber" casing="lower" />}
        </div>
      </DetailSection>
    );
  }
  const m = d.media;
  if ((k === "image" || k === "plate" || k === "motion" || k === "video") && m !== null && m.decodable) {
    return (
      <DetailSection title="File">
        <div className={s.ev}>
          {m.w !== null && m.h !== null && <Chip label={`${m.w}×${m.h}`} casing="lower" />}
          <Chip label={m.mime} casing="lower" />
          {m.durationS !== null && <Chip label={`${m.durationS} s`} casing="lower" />}
          {m.meanLuma !== null && <Chip label="luma" value={m.meanLuma} casing="lower" tone={m.nearBlack ? "amber" : "neutral"} />}
        </div>
      </DetailSection>
    );
  }
  return null;
}

export function DetailView({ d, busy, onFacet, onItem, onPin, onUse, onExport }: DetailViewProps) {
  const c = d.card;
  const [project, setProject] = useState(d.projects[0]?.value ?? "");
  const audio = c.kind === "audio" ? d.extras.audio : undefined;
  return (
    <>
      {audio !== undefined ? (
        <AudioPreview src={audio.src} peaks={audio.peaks} title={c.title} durationS={audio.facts.measured?.durationS ?? audio.facts.asked.durationS} />
      ) : d.model !== undefined ? (
        <ModelViewer
          key={d.model.src}
          src={d.model.src}
          title={c.title}
          {...(d.model.poster === undefined ? {} : { poster: d.model.poster })}
          {...(d.media?.mesh === undefined ? {} : { tris: d.media.mesh.tris, bones: d.media.mesh.bones })}
        />
      ) : (
        <DetailPreview face={d.preview.face} title={c.title} {...(d.preview.video === undefined ? {} : { video: d.preview.video })} />
      )}
      {d.media !== null && d.media.error !== null && (
        <div className={s.mediaErr}>
          <ErrorLine message={d.media.error} />
        </div>
      )}
      <DetailTitle title={c.title} id={c.id} date={c.date} />
      <DetailChips>
        <Chip label={kindShort(c.kind)} />
        <StatusPill machine="library" state={c.state} />
        <SourceTag kind={c.source} />
        <Chip label={d.origin} casing="lower" />
        {c.kind === "image" && <Chip label="private · not output" ghost casing="lower" />}
        {c.locked === true && <Chip label="locked" tone="emerald" />}
        {d.pinned && <Chip label="pinned" tone="cyan" />}
        {c.attention !== undefined && <Chip label={ATTENTION_LABEL[c.attention]} tone="rose" casing="lower" />}
      </DetailChips>
      {d.lines.length > 0 && (
        <DetailSection title="Facets">
          <DetailFacets lines={d.lines} onPress={(g, v) => onFacet(g, v)} />
        </DetailSection>
      )}
      <DetailSection title="Lineage">
        <Lineage nodes={d.lineage} onItem={onItem} onFacet={onFacet} />
      </DetailSection>
      <Extras d={d} />
      <DetailSection title="Acts">
        <div className={s.acts}>
          <div className={s.actRow}>
            <Button label={d.pinned ? "Unpin" : "Pin to collection"} disabled={busy} onPress={() => onPin(!d.pinned)} />
            {d.atelier !== undefined && <Button label="Open style" href={d.atelier} glyphAfter="chevR" />}
            {d.schedule !== undefined && <Button label="Schedule" tone="cyan" href={d.schedule} glyphAfter="chevR" />}
            <LedgerLink href={ledgerFor(c.id)} subject={c.title} />
          </div>
          {d.acts.includes("use-in-project") && d.projects.length > 0 && (
            <div className={s.actRow}>
              <span className={s.useSel}>
                <Select label="Project" value={project} onChange={setProject} options={d.projects} />
              </span>
              <Button label="Use in project" tone="cyan" disabled={busy || project === ""} onPress={() => onUse(project)} />
            </div>
          )}
          {d.acts.includes("export") && <ExportRow busy={busy} onExport={onExport} />}
        </div>
      </DetailSection>
    </>
  );
}
