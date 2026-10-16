"use client";

// THE PRODUCE PARTS (Phase 4, L28): the Floor composer and its estimate and launch control, the
// receipt (fresh, and as a stale confirm answers it - every moved cell marked), the model picker
// and the plan table, Compose drawn in place, the re-route list and a held lane. Literal data
// and a fixed clock (./produceKitData.ts), so the sheet draws the same every time; nothing a
// control does here leaves the specimen.
//
// The style contract measures the composer and the plan's controls on these specimens
// (docs/next/style-contract/roles.floor.json, roles.plan.json, roles.plandraft.json): the
// composers are framed at the prototype's composer column, in its own words.

import { useState } from "react";

import { ComposeDialog } from "@gt/ui/components/produce/ComposeDialog.tsx";
import { Composer, ComposerSelect, Estimate, LaunchButton } from "@gt/ui/components/produce/Composer.tsx";
import { LaneHold } from "@gt/ui/components/produce/LaneHold.tsx";
import { ModelPicker, PlanRow, PlanTable } from "@gt/ui/components/produce/PlanTable.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { RerouteList } from "@gt/ui/components/produce/RerouteList.tsx";
import { receiptChanges } from "@gt/ui/components/produce/produce.ts";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { Frame, inert } from "./ContractHooks.tsx";
import { FRAMES, NOW, PLAN, RECEIPT, REROUTE, STALE } from "./produceKitData.ts";
import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

/** The prototype's composer column at the 1440 capture (floor.css minmax(196px,232px)). */
const COMPOSER_W = 232;

const STYLES = [
  { label: "candidate · lock trial", options: [{ value: "teal-orange-blockbuster", label: "Teal-orange blockbuster" }] },
  { label: "proven · re-sweep", options: [{ value: "ink-graphic-novel", label: "Ink graphic novel" }] },
];
const TOPICS = [{ label: "media-generation", options: [{ value: "generative-provider-routing", label: "Generative provider routing" }] }];

export function ProduceSection() {
  const [text, setText] = useState("");
  const [mech, setMech] = useState(true);
  const [units, setUnits] = useState(24);
  const [ceiling, setCeiling] = useState("");
  const [compose, setCompose] = useState({ styleId: "ink-graphic-novel", takeId: "take-salt-lines", topic: "agent-run-budgeting" });
  const byId = new Map(PLAN.map((p) => [p.id, p]));
  const first = PLAN[0];
  return (
    <Section id="produce">
      <Spec names={["Composer", "ComposerSelect", "Estimate", "LaunchButton"]} source="produce/Composer.tsx · index.html IdeaComposer" wide>
        <Row>
          <Frame role="composer@floor" width={COMPOSER_W}>
            <Composer
              name="Image idea"
              lane="image"
              controls={
                <>
                  <ComposerSelect label="style" value="teal-orange-blockbuster" onChange={inert} groups={STYLES} tail={[{ value: "__sweep", label: "Sweep · all 9 forge styles" }]} />
                  <Toggle label={mech ? "text+ref" : "text"} on name="mechanism" onToggle={() => setMech((m) => !m)} />
                </>
              }
              text={text}
              onText={setText}
              placeholder="Riders crest the ridge at dawn, banners low…"
              estimate={<Estimate receipt={RECEIPT} noun="plate" />}
              onLaunch={inert}
              busy={false}
            />
          </Frame>
          <Frame role="composer-article@floor" width={COMPOSER_W}>
            <Composer
              name="Article idea"
              lane="article"
              controls={<ComposerSelect label="topic" value="generative-provider-routing" onChange={inert} groups={TOPICS} />}
              text=""
              onText={inert}
              placeholder="Angle: the budget is a clock, not a pool…"
              estimate={<Estimate receipt={null} noun="run" />}
              onLaunch={inert}
              busy
            />
          </Frame>
          <Frame role="estimate-error" width={COMPOSER_W}>
            <Estimate receipt={null} noun="clip" error="produce composer receipt: input.subject: Too small: expected string to have >=1 characters" />
          </Frame>
        </Row>
        <Row label="plan">
          <Frame role="launch-plan" width={302}>
            <LaunchButton label="Launch plan" detail="$0 · 46m" size="plan" onPress={inert} shortcut={{ mode: "projects", verb: "launch" }} />
          </Frame>
        </Row>
      </Spec>

      {RECEIPT !== null && STALE !== null && (
        <Spec names={["Receipt", "Unpriced"]} source="produce/Receipt.tsx · new: no prototype counterpart" wide>
          <div className={k.col}>
            <Receipt receipt={RECEIPT} ceiling={ceiling} onCeiling={setCeiling} onConfirm={inert} busy={false} nowMs={NOW} />
            <Receipt receipt={STALE} changes={receiptChanges(RECEIPT, STALE)} ceiling="" onCeiling={inert} onConfirm={inert} busy={false} nowMs={NOW} />
            <Receipt receipt={{ ...RECEIPT, mode: "live", totals: { ...RECEIPT.totals, usd: 69.5, usdRange: [47, 92] } }} ceiling="80" onCeiling={inert} onConfirm={inert} busy={false} error="produce launch run: the render box is unavailable (connect ECONNREFUSED 127.0.0.1:9222)" nowMs={NOW} />
          </div>
        </Spec>
      )}

      <Spec names={["PlanTable", "PlanRow", "ModelPicker"]} source="produce/PlanTable.tsx · projects.js PlanRow" wide>
        <div data-role="plan@plan">
          <PlanTable parts={PLAN.map((p) => (p.id === "p:frames" && "units" in p ? { ...p, units } : p))} selectedId="p:frames" draft nowMs={NOW} onModel={inert} onUnits={(_, n) => setUnits(n)} />
        </div>
        <Row label="launched">
          <table>
            <tbody>{first !== undefined && <PlanRow p={first} byId={byId} draft={false} selected={false} nowMs={NOW} onModel={inert} onUnits={inert} />}</tbody>
          </table>
        </Row>
        <Row label="picker">
          {/* The prototype's picker cell at the 1440 capture (projects.css .c-model, the draft plan). */}
          <Frame role="model-sel@plandraft" width={189}>
            <ModelPicker options={FRAMES} chosen="frames/google/nano" units={24} part="frames" onChange={inert} />
          </Frame>
        </Row>
      </Spec>

      <Spec names={["ComposeDialog"]} source="produce/ComposeDialog.tsx · projects.js renderCompose">
        <ComposeDialog
          open
          specimen
          onClose={inert}
          recipes={[
            { id: "film/short-educational-video", label: "Film · Short educational", sub: "script · frames · motion · score · cut", icon: "video" },
            { id: "album-video", label: "Album video", sub: "track · still · words · render", icon: "audio" },
            { id: "explainer", label: "Explainer", sub: "article · strips · voice · cut", icon: "article" },
            { id: "film/trailer", label: "Film · Trailer", sub: "script · frames · motion · score · cut", icon: "video" },
          ]}
          styles={[{ value: "ink-graphic-novel", label: "Ink graphic novel" }]}
          takes={[{ value: "take-salt-lines", label: "Salt lines" }]}
          topics={[{ value: "agent-run-budgeting", label: "Agent run budgeting" }]}
          value={compose}
          onValue={setCompose}
          onRecipe={inert}
          busy={false}
        />
      </Spec>

      <Spec names={["RerouteList"]} source="produce/RerouteList.tsx · projects.js Inspector .alt">
        <RerouteList options={REROUTE} units={24} onPick={inert} busy={null} />
      </Spec>

      <Spec names={["LaneHold"]} source="produce/LaneHold.tsx · decision 6, v1's sentence">
        <LaneHold lane="box.chrome" job="Hunt · low brass bed" stage="submit · 2 of 4 prompts" since={new Date(NOW - 46 * 60_000).toISOString()} nowMs={NOW} onAck={inert} busy={false} />
      </Spec>
    </Section>
  );
}
