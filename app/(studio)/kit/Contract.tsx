"use client";

// THE STYLE CONTRACT'S SPECIMENS (plan §6 Phase 1 exit; docs/next/style-contract). Every role
// docs/next/style-contract/roles.<page>.json names is drawn here once per page that draws it,
// in that page's own words, under a `data-role` hook the checker measures. The words matter
// because the instrument measures rendered WIDTH as well as type and surface: a chip compared
// against a chip with other text would fail on its text, not on its design, and a contract that
// fails for the wrong reason teaches everyone to skim it. So the strings below are the
// prototype pages' strings, verbatim (Floor, Board sheet, Plan, Runs, Library, Ledger).
//
// FRAMES. A Panel, a FacetRow, a Search, a section heading and an error line take the width of
// the column the page put them in; the prototype's own kit drew those at their page's measure
// with inline widths (kit.js: `pile style="width:150px"`, `.mday` 220x150). The same here:
// FRAME holds each page's column width at the 1440 capture, with the rule that produced it,
// so the measure is data the specimen is OF, never a design value. That makes WIDTH a
// tautology for exactly those roles - the page that composes them (Phase 2 Ledger and Runs,
// Phase 3 Floor, Phase 5 Library) holds it against the real route; here the contract holds
// their type, colour, border, radius and padding.
//
// Two roles are measured on the Signal section's own specimens instead (roles.*.json says
// where): the ghost chip and the model SourceTag already stand there in the prototype's words,
// and a second copy here would only be a second entry in the legibility baseline.
//
// One client island because Seg, Toggle and FacetRow take callbacks; the specimens hold no
// state worth keeping, so each handler is inert except the toast's, which is the act the
// Ledger's copy button performs (the toast only exists after one).

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ChannelBadge } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { usd } from "@gt/ui/components/eventrow/usd.ts";
import { Crumbs } from "@gt/ui/components/crumbs/Crumbs.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { FacetRow } from "@gt/ui/components/facet/FacetRow.tsx";
import { Search } from "@gt/ui/components/field/Field.tsx";
import { Hint } from "@gt/ui/components/hint/Hint.tsx";
import { Keycap } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { StackBar } from "@gt/ui/components/stackbar/StackBar.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import { useShell } from "../_shell/Providers.tsx";
import { FRAME, Frame, Hook, NavRow, inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

export function ContractSection() {
  const { toast } = useShell();
  return (
    <Section id="contract">
      <Spec names={["StudioHeader"]} source="_shell · nav on each page" wide>
        {/* A picture of the header's nav, one row per page: hidden from assistive tech, which
            hears the real header once. The items are not links - nothing here is a door. */}
        <div className={k.col} aria-hidden="true">
          {["floor", "board", "projects", "runs", "library", "ledger"].map((p) => (
            <Row key={p} label={p}>
              <NavRow current={p} />
            </Row>
          ))}
        </div>
      </Spec>

      <Spec names={["Chip"]} source="header · floor · board · plan · runs" wide>
        <Row label="header">
          <Hook role="chip">
            <Chip label="spend 24h" value={usd(0)} />
          </Hook>
        </Row>
        <Row label="floor">
          <Hook role="chip-cyan@floor">
            <Chip label="runs ›" tone="cyan" href="#contract" name="runs across every resource" />
          </Hook>
        </Row>
        <Row label="board">
          <Hook role="chip-violet">
            <Chip label="dojo judge AUC 0.69" tone="violet" />
          </Hook>
          <Hook role="chip-emerald">
            <Chip label="oracle pass" tone="emerald" dot />
          </Hook>
          <Hook role="chip-rose@board">
            <Chip label="craft AUC 0.29 · inverted · hidden" tone="rose" />
          </Hook>
          <Hook role="chip-amber@board">
            <Chip label="style_score 0.58 · chance · hidden" tone="amber" />
          </Hook>
        </Row>
        <Row label="plan">
          <Hook role="chip-lower">
            <Chip label="Film" casing="lower" />
          </Hook>
        </Row>
        <Row label="runs">
          <Hook role="chip-cyan@runs">
            <Chip label="6" value="running" tone="cyan" />
          </Hook>
          <Hook role="chip-amber@runs">
            <Chip label="3" value="at the weir" tone="amber" />
          </Hook>
          <Hook role="chip-rose@runs">
            <Chip label="1" value="failed" tone="rose" />
          </Hook>
        </Row>
      </Spec>

      <Spec names={["Tally", "Keycap", "SourceTag", "LedgerLink", "ChannelBadge"]} source="header · floor · plan · library · ledger" wide>
        <Row label="tally">
          <Hook role="tally">
            <Tally value={20} />
          </Hook>
          <Hook role="tally-label@library">
            <Tally value="5,000" label="items" />
          </Hook>
          <Hook role="tally-of">
            <Tally value={688} of={688} label="events" />
          </Hook>
        </Row>
        <Row label="in a caps head">
          {/* floor.css .colhead is the panel head's type (700 12px/1 mono, .12em caps), and a
              Tally inside one inherits its tracking - the Floor's column heads draw it so. */}
          <Frame role="tally-label@floor" width={FRAME.floorColumn}>
            <Panel title="Foundry" tally={{ value: 5, label: "running" }}>
              {null}
            </Panel>
          </Frame>
        </Row>
        <Row label="keycap">
          <Hook role="keycap">
            <Keycap mode="board.cull" verb="commit" />
          </Hook>
        </Row>
        <Row label="source">
          <Hook role="source-ill">
            <SourceTag kind="illustrative" />
          </Hook>
          <Hook role="source-real@ledger">
            <SourceTag kind="real" />
          </Hook>
        </Row>
        <Row label="ledger · channel">
          <Hook role="ledger-link">
            <LedgerLink href="#contract" subject="seed-glass-harbor-trailer" />
          </Hook>
          <Hook role="channel">
            <ChannelBadge channel="youtube" />
          </Hook>
        </Row>
        <Row label="type · meta">
          <Hook role="mono-meta">
            <span className={k.mono}>text CLI · research turn</span>
          </Hook>
        </Row>
      </Spec>

      <Spec names={["EntryPill", "PipRow", "StackBar"]} source="floor · runs · library" wide>
        <Row label="status">
          <Hook role="status-await@floor">
            <EntryPill entry={{ look: "awaiting", label: "at weir" }} />
          </Hook>
          <Hook role="status-run">
            <EntryPill entry={{ look: "running", label: "running" }} />
          </Hook>
          <Hook role="status-idle@floor">
            <EntryPill entry={{ look: "idle", label: "cancelled" }} />
          </Hook>
          <Hook role="status-idle@plan">
            <EntryPill entry={{ look: "idle", label: "queued" }} />
          </Hook>
          <Hook role="status-fail@runs">
            <EntryPill entry={{ look: "failed", label: "failed" }} />
          </Hook>
          <Hook role="status-done@library">
            <EntryPill entry={{ look: "done", label: "ratified" }} />
          </Hook>
          <Hook role="status-ref">
            <EntryPill entry={{ look: "reference", label: "reference" }} />
          </Hook>
          <Hook role="status-cand">
            <EntryPill entry={{ look: "candidate", label: "candidate" }} />
          </Hook>
        </Row>
        <Row label="pips">
          <Hook role="piprow" type="ui">
            <PipRow looks={["done", "done", "failed", "idle", "idle", "idle"]} label="2 done, 1 blocked, 3 waiting" />
          </Hook>
          <Hook role="piprow-await" type="ui">
            <PipRow looks={["awaiting", "idle"]} label="1 at weir, 1 waiting" />
          </Hook>
        </Row>
        <Row label="stack">
          <Frame role="stackbar" width={FRAME.pileBar}>
            <StackBar kept={0} rejected={0} undecided={20} label="Forge · 2026-08-26-sweep-01" />
          </Frame>
        </Row>
      </Spec>

      <Spec names={["Button", "Toggle", "Seg", "TabRail", "Hint"]} source="board · plan · runs · library · ledger" wide>
        <Row label="button">
          <Hook role="button">
            <Button label="Floor" onPress={inert} />
          </Hook>
          <Hook role="button-emerald">
            <Button label="Approve → slot" tone="emerald" shortcut={{ mode: "board.review", verb: "approve" }} onPress={inert} />
          </Hook>
          <Hook role="button-rose">
            <Button label="Reject" tone="rose" shortcut={{ mode: "board.review", verb: "reject" }} onPress={inert} />
          </Hook>
          <Hook role="button-sm@runs">
            <Button label="NOW 09:12" size="sm" onPress={inert} />
          </Hook>
          <Hook role="toast-trigger">
            <Button label="copy" size="sm" onPress={() => toast("event ev_000688 copied")} />
          </Hook>
        </Row>
        <Row label="plan">
          <Frame role="button-cyan@plan" width={FRAME.planSummary}>
            <Button label="Open in Runs" tone="cyan" href="#contract" shortcut={{ mode: "projects", verb: "runs" }} />
          </Frame>
        </Row>
        <Row label="toggle">
          <Hook role="toggle-on@floor">
            <Toggle label="text+ref" on onToggle={inert} />
          </Hook>
          <Hook role="toggle-off@floor">
            <Toggle label="sfx" on={false} onToggle={inert} />
          </Hook>
          <Hook role="toggle-off@ledger">
            <Toggle label="{ } jsonl" on={false} onToggle={inert} />
          </Hook>
        </Row>
        <Row label="seg">
          <Hook role="seg@runs">
            <Seg
              label="zoom"
              options={[
                { value: "12h", label: "12h" },
                { value: "24h", label: "24h" },
                { value: "3d", label: "3d" },
                { value: "week", label: "week" },
              ]}
              value="24h"
              onChange={inert}
            />
          </Hook>
          <Hook role="seg@ledger">
            <Seg
              label="actor"
              options={[
                { value: "all", label: "All 688" },
                { value: "operator", label: "Operator 303" },
                { value: "agent", label: "Agent 131" },
                { value: "machine", label: "Machine 254" },
              ]}
              value="all"
              onChange={inert}
            />
          </Hook>
        </Row>
        <Row label="tabs · hint">
          <Hook role="tabrail">
            <TabRail
              label="view"
              mode="projects"
              current="plan"
              tabs={[
                { id: "plan", label: "Plan", href: "#contract", verb: "plan" },
                { id: "runs", label: "Runs", href: "#contract", verb: "runs" },
              ]}
            />
          </Hook>
          <Hook role="hint">
            <Hint text="real 342 · scaled 5,000 · every item labelled" name="corpus" />
          </Hook>
        </Row>
      </Spec>

      <Spec names={["Crumbs", "ErrorLine"]} source="board · floor" wide>
        <Hook role="crumbs">
          <Crumbs
            trail={[
              { label: "Floor", onPress: inert },
              { label: "Board", onPress: inert },
              { label: "Image", onPress: inert },
            ]}
            here="Forge · 2026-08-26-sweep-01"
          />
        </Hook>
        <Frame role="error" width={FRAME.calendarError}>
          <ErrorLine message="this channel is not wired" />
        </Frame>
      </Spec>

      <Spec names={["CapsHeading"]} source="board · plan · ledger" wide>
        <Frame role="heading-side@review" width={FRAME.reviewSide}>
          <CapsHeading text="style · Library" />
        </Frame>
        <Frame role="heading-sect@plan" width={FRAME.planMain}>
          <CapsHeading text="style · Library" variant="section" level={4} />
        </Frame>
        <Frame role="heading-side@plan" width={FRAME.planSummary}>
          <CapsHeading text="per resource" tally={{ value: 4 }} />
        </Frame>
        <Frame role="heading-sect@ledger" width={FRAME.ledgerDetail}>
          <CapsHeading text="related" tally={{ value: 8 }} variant="section" level={4} />
        </Frame>
        <Frame role="heading-side@ledger" width={FRAME.ledgerTime}>
          <CapsHeading text="time · utc" />
        </Frame>
      </Spec>

      <Spec names={["Panel", "Search", "FacetRow"]} source="plan · library · ledger" wide>
        <div className={k.row}>
          <Frame role="panel@plan" width={FRAME.planList}>
            <Panel title="Compositions" tally={{ value: 8 }}>
              <span className={k.mono}>Glass Harbor — trailer</span>
            </Panel>
          </Frame>
          <Frame role="panel@library" width={FRAME.libraryNav}>
            <Panel title="Library" tally={{ value: "5,000" }}>
              <Frame role="facet-check" width={FRAME.libraryRow}>
                <FacetRow label="needs attention" count={14} mark="check" pressed={false} onToggle={inert} />
              </Frame>
            </Panel>
          </Frame>
          <Frame role="panel@ledger" width={FRAME.ledgerFacets}>
            <Panel title="facets">
              <Frame role="facet-rail" width={FRAME.ledgerRow}>
                <FacetRow label="capture" count={27} share={0.11} mark="rail" pressed={false} onToggle={inert} />
              </Frame>
            </Panel>
          </Frame>
        </div>
        <Frame role="search@library" width={FRAME.librarySearch}>
          <Search label="search the library" mode="library" value="" onChange={inert} placeholder="search · mood:tense · style:painted-3d" />
        </Frame>
        <Frame role="search@ledger" width={FRAME.ledgerSearch}>
          <Search label="search events" mode="ledger" value="" onChange={inert} placeholder="id · text · actor:agent type:job.fail" />
        </Frame>
      </Spec>
    </Section>
  );
}
