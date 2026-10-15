// The route frame's parts (tokens.css `.panel`, `.side-h`/`.h4`, `.empty`), each in the
// states a route uses: a panel with a toolbar and a count, both heading variants, an empty
// state with and without its one act.

import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";

import { Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

export function StructureSection() {
  return (
    <Section id="structure">
      <Spec names={["Panel"]} source="panel/Panel.tsx" wide>
        <Panel
          title="Events"
          tally={{ value: 1284 }}
          toolbar={
            <>
              <Chip label="operator" tone="amber" />
              <Chip label="agent" tone="violet" />
              <Chip label="machine" tone="cyan" />
            </>
          }
        >
          <div className={k.col}>
            <span className={k.mono}>2026-10-15 09:12 · operator · packet.commit · pkt_audio</span>
            <span className={k.mono}>2026-10-15 09:10 · machine · run.arrive · 2026-08-26-sweep-01</span>
          </div>
        </Panel>
      </Spec>
      <Spec names={["CapsHeading"]} source="heading/CapsHeading.tsx">
        <div className={k.col}>
          <CapsHeading text="weir" tally={{ value: 14, label: "waiting" }} />
          <CapsHeading text="observables" variant="section" level={4} />
        </div>
      </Spec>
      <Spec names={["Empty"]} source="empty/Empty.tsx">
        <div className={k.col}>
          <Empty label="no events match these facets" />
          <Empty label="weir clear" action={{ label: "Open the board", href: "#structure" }} />
        </div>
      </Spec>
    </Section>
  );
}
