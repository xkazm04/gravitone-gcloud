"use client";

// A MODEL ITEM'S OWN BLOCKS in the detail (spark game-3d-assets WP3): what the glb measured (its
// triangles against its class's budget, bones, clips, images, extent), what each gate said - the
// fails and warns verbatim, a gate that did not measure reads `unmeasured` - what the variant could
// not fix, and the act that hands it to a game project. The viewer itself is the preview
// (./DetailView.tsx), mounted only here and in the Board's zoom.

import { useState } from "react";

import { MODEL_EXPORT_PROJECTS, type MeshFacts, type ModelExportProject, type ModelExtras } from "@gt/domain/library";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { DetailSection } from "@gt/ui/components/library/DetailPanel.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";

import s from "./library.module.css";

const VERDICT_TONE = { pass: "emerald", warn: "amber", fail: "rose", unmeasured: "neutral" } as const;
const PROJECT_LABEL: { readonly [P in ModelExportProject]: string } = { pof: "PoF", bp: "bp" };
const fmt = (n: number): string => n.toLocaleString("en-US");

export function ModelFacts({ model, mesh }: { readonly model: ModelExtras; readonly mesh: MeshFacts | undefined }) {
  return (
    <>
      <DetailSection title="Mesh">
        <div className={s.ev}>
          <Chip label={model.class} casing="lower" />
          <Chip label={model.technique} casing="lower" />
          {mesh !== undefined && <Chip label="tris" value={`${fmt(mesh.tris)} / ${fmt(model.budgetTris)}`} tone={mesh.tris > model.budgetTris ? "amber" : "neutral"} casing="lower" />}
          {mesh === undefined && <Chip label="budget" value={fmt(model.budgetTris)} casing="lower" />}
          {mesh !== undefined && <Chip label="verts" value={fmt(mesh.verts)} casing="lower" />}
          {mesh !== undefined && mesh.bones > 0 && <Chip label="bones" value={mesh.bones} casing="lower" />}
          {model.rig !== undefined && <Chip label={model.rig} tone="cyan" casing="lower" />}
          {mesh !== undefined && mesh.clips > 0 && <Chip label="clips" value={mesh.clips} casing="lower" />}
          {mesh !== undefined && <Chip label="images" value={mesh.images} casing="lower" />}
          {mesh?.bboxM !== undefined && <Chip label="size" value={`${mesh.bboxM.map((v) => v.toFixed(2)).join(" × ")} m`} casing="lower" />}
        </div>
      </DetailSection>
      {model.approach !== undefined && (
        <DetailSection title="Approach">
          <p className={s.recipe}>{model.approach}</p>
        </DetailSection>
      )}
      {model.gates.length > 0 && (
        <DetailSection title="Gates">
          <table className={s.evt}>
            <tbody>
              {model.gates.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td>
                    <Chip label={g.verdict} tone={VERDICT_TONE[g.verdict]} casing="lower" {...(g.verdict === "unmeasured" ? { ghost: true } : {})} />
                  </td>
                  <td className={s.m}>{g.score ?? "—"}</td>
                  <td className={s.m}>{[...g.fails, ...g.warns].join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailSection>
      )}
      {model.limitations.length > 0 && (
        <DetailSection title="Limitations">
          <ul className={s.limits}>
            {model.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}

/** The export act's row: which project, and the press. */
export function ExportRow({ busy, onExport }: { readonly busy: boolean; readonly onExport: (project: ModelExportProject) => void }) {
  const [project, setProject] = useState<ModelExportProject>("pof");
  return (
    <div className={s.actRow}>
      <span className={s.useSel}>
        <Select label="Game project" value={project} onChange={setProject} options={MODEL_EXPORT_PROJECTS.map((p) => ({ value: p, label: PROJECT_LABEL[p] }))} />
      </span>
      <Button label="Export" tone="cyan" disabled={busy} onPress={() => onExport(project)} />
    </div>
  );
}
