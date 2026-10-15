"use client";

// THE CONTROLS, live (kit.js "Controls"). These take callbacks, so this is the sheet's one
// client island: each specimen holds its own state and does what it shows - a toggle
// toggles, a fold folds, a facet counts - because a control drawn in a state it cannot
// leave is a picture of a control.
//
// Not drawn from kit.js: the forced `hover-demo` and `focus-demo` buttons. They painted a
// state onto a button through a class the kit page owned; @gt/ui's Button takes no class
// (call-site-ownership), so hover and focus are shown by pointing and tabbing.

import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { TONES } from "@gt/ui/components/chip/tone.ts";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { FacetRow } from "@gt/ui/components/facet/FacetRow.tsx";
import { Field, Search, Select } from "@gt/ui/components/field/Field.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { useShell } from "../_shell/Providers.tsx";
import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const WINDOWS = [
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" },
  { value: "3d", label: "3d" },
  { value: "week", label: "week" },
] as const;

const MODELS = [
  { value: "flux", label: "Flux 2 dev fp8 · GPU box — 1h 04m · $0" },
  { value: "nano", label: "Nano Banana · Google — 14m · $1.60" },
] as const;

const KINDS = [
  { label: "music", count: 412, share: 0.62 },
  { label: "sfx", count: 188, share: 0.28 },
  { label: "voice", count: 64, share: 0.1 },
] as const;

export function ControlSections() {
  const { toast } = useShell();
  const [pressed, setPressed] = useState(1);
  const [toggles, setToggles] = useState<Readonly<Record<string, boolean>>>({ music: true, sfx: false, "text+ref": true });
  const [win, setWin] = useState<(typeof WINDOWS)[number]["value"]>("24h");
  const [title, setTitle] = useState("Untitled film");
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<(typeof MODELS)[number]["value"]>("flux");
  const [facets, setFacets] = useState<ReadonlySet<string>>(new Set(["music"]));
  const [folded, setFolded] = useState(true);

  return (
    <>
      <Section id="controls">
        <Spec names={["Button"]} source="button/Button.tsx" wide>
          <Row label="tone">
            {TONES.map((t) => (
              <Button key={t} label={t} tone={t} />
            ))}
          </Row>
          <Row label="size · sm">
            {TONES.map((t) => (
              <Button key={t} label={t} tone={t} size="sm" />
            ))}
          </Row>
          <Row label="with">
            <Button label="Approve → slot" tone="emerald" shortcut={{ mode: "board.review", verb: "approve" }} />
            <Button label="Reject" tone="rose" shortcut={{ mode: "board.review", verb: "reject" }} />
            <Button label="Commit packet" tone="amber" badge={{ label: "undecided", value: 7, tone: "amber" }} shortcut={{ mode: "board.cull", verb: "commit" }} />
            <Button label="ledger" glyph="ledger" href="#controls" />
            <Button label="Toast" tone="cyan" onPress={() => toast("Forge · 2026-08-26-sweep-01 committed · 8 kept")} />
          </Row>
          <Row label="disabled">
            <Button label="Launch" tone="cyan" disabled />
            <Button label="Commit packet" badge={{ label: "undecided", value: 7 }} disabled />
          </Row>
        </Spec>
        <Spec names={["Chip"]} source="chip/Chip.tsx · button">
          <Row>
            {["image", "article", "audio", "video"].map((l, i) => (
              <Chip key={l} label={l} onPress={() => setPressed(i)} pressed={pressed === i} />
            ))}
          </Row>
        </Spec>
        <Spec names={["Toast"]} source="toast/Toast.tsx">
          <Row>
            <Button label="Show a receipt" size="sm" onPress={() => toast("Launched · Forge · Teal-Orange Blockbuster · queue #2")} />
          </Row>
        </Spec>
      </Section>

      <Section id="inputs">
        <Spec names={["Toggle"]} source="toggle/Toggle.tsx">
          <Row>
            {Object.entries(toggles).map(([l, on]) => (
              <Toggle key={l} label={l} on={on} onToggle={(next) => setToggles((t) => ({ ...t, [l]: next }))} />
            ))}
          </Row>
        </Spec>
        <Spec names={["Seg"]} source="seg/Seg.tsx">
          <Seg label="time window" options={WINDOWS} value={win} onChange={setWin} />
        </Spec>
        <Spec names={["Field", "Search", "Select"]} source="field/Field.tsx">
          <div className={k.col}>
            <Search label="search the library" mode="library" value={query} onChange={setQuery} placeholder="mood:tense · kind:audio" />
            <Field label="title" value={title} onChange={setTitle} keyfield="title" />
            <Select label="model" options={MODELS} value={model} onChange={setModel} />
          </div>
        </Spec>
        <Spec names={["FacetRow"]} source="facet/FacetRow.tsx">
          <div className={k.col}>
            {KINDS.map((f) => (
              <FacetRow
                key={f.label}
                label={f.label}
                count={f.count}
                mark="check"
                pressed={facets.has(f.label)}
                onToggle={(next) =>
                  setFacets((s) => {
                    const n = new Set(s);
                    if (next) n.add(f.label);
                    else n.delete(f.label);
                    return n;
                  })
                }
              />
            ))}
            {KINDS.map((f) => (
              <FacetRow key={`rail-${f.label}`} label={f.label} count={f.count} share={f.share} mark="rail" pressed={false} onToggle={() => undefined} />
            ))}
          </div>
        </Spec>
        <Spec names={["Fold"]} source="fold/Fold.tsx">
          <Fold title="kind" open={folded} onToggle={setFolded} active={facets.size} total={KINDS.length}>
            <div className={k.col}>
              {KINDS.map((f) => (
                <span key={f.label} className={k.mono}>
                  {f.label}
                </span>
              ))}
            </div>
          </Fold>
        </Spec>
        <Spec names={["TabRail"]} source="tabrail/TabRail.tsx" wide>
          <TabRail
            label="project views"
            mode="projects"
            current="plan"
            tabs={[
              { id: "plan", label: "Plan", href: "#inputs", verb: "plan" },
              { id: "runs", label: "Runs", href: "#inputs", verb: "runs", tally: { value: 3, label: "running" } },
              { id: "compose", label: "Compose", href: "#inputs", verb: "compose", disabled: true },
            ]}
          />
        </Spec>
        <Spec names={["Crumbs"]} source="crumbs/Crumbs.tsx" wide>
          <Crumbs
            trail={[
              { label: "Floor", href: "#inputs" },
              { label: "Board", onPress: () => toast("Board") },
              { label: "Image", href: "#inputs" },
            ]}
            here="Forge · 2026-08-26-sweep-01"
          />
        </Spec>
      </Section>
    </>
  );
}
