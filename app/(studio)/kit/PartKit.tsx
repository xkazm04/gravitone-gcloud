"use client";

// THE PART WORKSPACE (Phase 4 wave C, L38; STEPS-DESIGN §1): the frame every part editor draws -
// header with the verdict chip, the act bar and undo; the item rail (windowed); the primary; the
// inspector; the part tabs and an upstream break at the foot - drawn here over literal data. The
// prototype has no step editor, so there is no winner page for the frame itself: the style
// contract (docs/next/style-contract/roles.part.json) holds the part tabs to the Plan prototype's
// tab rail, the one object the two share. Nothing a control does here leaves the specimen.

import { useState } from "react";

import type { PartTab, PartVerdict } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { PartTabs } from "@gt/ui/components/part/PartTabs.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { VerdictChip } from "@gt/ui/components/part/VerdictChip.tsx";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const tab = (key: string, label: string, kind: PartTab["kind"], verdict: PartTab["verdict"], editor = verdict !== null): PartTab => ({ partId: `kit:${key}`, key, kind, label, verdict, editor });
const TABS: readonly PartTab[] = [
  tab("research", "research", "research", "ready"),
  tab("script", "script", "script", "working"),
  tab("frames", "frames", "frames", null, false),
  tab("gate:frames", "◆ frames", "gate", null, false),
  tab("motion", "motion", "motion", null, false),
  tab("cut", "cut", "cut", null, false),
];
const VERDICTS: readonly PartVerdict[] = [
  { state: "empty", codes: [{ code: "no-notebook", text: "no notebook" }] },
  { state: "working", codes: [{ code: "scope-diverged", text: "3 cards moved since the scope was confirmed" }] },
  { state: "ready", codes: [{ code: "scope-confirmed", text: "scope confirmed" }] },
  { state: "blocked", codes: [{ code: "gate-violation", text: "2 gate violation(s) in Why Bitcoin's Price Won't Rise" }, { code: "over-clock", text: "5:00 against a 2:00 clock" }] },
];
const ITEMS = Array.from({ length: 40 }, (_, i) => ({ id: `f-${i + 1}`, title: `Card ${i + 1} — a claim the scope keeps or cuts` }));
const PLAN_TABS: readonly PartTab[] = [tab("plan", "Plan", "research", "ready"), tab("runs", "Runs", "script", "working")];

export function PartSection() {
  const [sel, setSel] = useState<string | null>("f-3");
  return (
    <Section id="part">
      <Spec names={["PartWorkspace", "RailList"]} source="part/PartWorkspace.tsx · new: STEPS-DESIGN §1" wide>
        <div className={k.workspace}>
          <PartWorkspace
            trail={[{ label: "Projects", href: "#part" }, { label: "Why the Bitcoin price does not rise", href: "#part" }]}
            here="research"
            verdict={VERDICTS[1] ?? { state: "empty", codes: [] }}
            acts={
              <>
                <Button label="confirm scope" size="sm" tone="emerald" tally={{ value: 32, of: 39, label: "kept" }} onPress={inert} />
                <Button label="run research" size="sm" tone="cyan" onPress={inert} />
              </>
            }
            undo={{ last: "descope f-nov-crash", busy: false, onUndo: inert }}
            rail={{ label: "cards", children: <RailList label="kit cards" items={ITEMS} idOf={(x) => x.id} selected={sel} onSelect={setSel} row={(x) => <span>{x.title}</span>} /> }}
            primary={{ label: "board", children: <span>{sel ?? "—"}</span> }}
            inspector={{ label: "card", children: <span>{ITEMS.find((x) => x.id === sel)?.title ?? "—"}</span> }}
            tabs={TABS}
            current="research"
            href={() => "#part"}
            upstream={[]}
            mode="part.research"
            facts={["card", "item"]}
          />
        </div>
        <Row label="upstream">
          <div className={k.workspaceShort}>
            <PartWorkspace
              trail={[{ label: "Projects", href: "#part" }]}
              here="script"
              verdict={VERDICTS[0] ?? { state: "empty", codes: [] }}
              acts={<Chip label="compose candidates" value="needs a confirmed scope" tone="amber" casing="lower" />}
              undo={{ last: null, busy: false, onUndo: inert }}
              rail={{ label: "candidates", children: null }}
              primary={{ label: "document", children: null }}
              inspector={null}
              tabs={TABS}
              current="script"
              href={() => "#part"}
              upstream={["research"]}
              mode="part.script"
            />
          </div>
        </Row>
      </Spec>
      <Spec names={["VerdictChip"]} source="part/VerdictChip.tsx · part.ts VERDICT_LOOK">
        <div className={k.col}>
          {VERDICTS.map((v) => (
            <VerdictChip key={v.state} verdict={v} />
          ))}
        </div>
      </Spec>
      <Spec names={["PartTabs"]} source="part/PartTabs.tsx · projects.css .tabrail">
        <PartTabs tabs={TABS} current="script" href={() => "#part"} />
        <Row label="contract">
          <div data-role="parttabs@part">
            <PartTabs tabs={PLAN_TABS} current="plan" href={() => "#part"} keys={false} />
          </div>
        </Row>
      </Spec>
    </Section>
  );
}
