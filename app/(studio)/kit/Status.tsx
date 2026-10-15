// THE STATUS TABLE, drawn whole (status/status.ts): every machine, every state, the look it
// maps to and the label it reads as. The prototype's kit drew eight hand-picked `GT.State`
// words; five pages each kept their own copy of the mapping. Drawing the one table from the
// module itself means the sheet cannot show a state the table does not hold, or miss one it
// does - a state added to a domain machine is a compile error in status.ts until mapped, and
// appears here the moment it is.

import { EntryPill, StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { LOOKS, STATUS, UNKNOWN, type Look, type Machine, type StatusEntry } from "@gt/ui/components/status/status.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const MACHINES = Object.keys(STATUS) as Machine[];
const rows = (m: Machine): readonly (readonly [string, StatusEntry])[] => Object.entries(STATUS[m]);
const LOOK_NAMES = Object.keys(LOOKS) as Look[];

export function StatusSection() {
  const total = MACHINES.reduce((n, m) => n + rows(m).length, 0);
  return (
    <Section id="status">
      <Spec names={["STATUS"]} source="status/status.ts" wide>
        <Row>
          <Tally value={MACHINES.length} label="machines" />
          <Tally value={total} label="states" />
          <Tally value={LOOK_NAMES.length} label="looks" />
        </Row>
        <table className={k.table}>
          <thead>
            <tr>
              <th scope="col">machine</th>
              <th scope="col">state → look · label</th>
            </tr>
          </thead>
          <tbody>
            {MACHINES.map((m) => (
              <tr key={m}>
                <th scope="row" className={k.mono}>
                  {m}
                </th>
                <td>
                  <div className={k.row}>
                    {rows(m).map(([state, entry]) => (
                      <span key={state} className={k.row}>
                        <span className={k.mono}>{state}</span>
                        <EntryPill entry={entry} />
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Spec>
      <Spec names={["EntryPill"]} source="status/StatusPill.tsx">
        <div className={k.col}>
          {LOOK_NAMES.map((l) => (
            <Row key={l} label={`${l} · ${LOOKS[l].mark}`}>
              <EntryPill entry={{ look: l, label: l }} />
            </Row>
          ))}
          <Row label="off the table">
            <EntryPill entry={UNKNOWN} />
          </Row>
        </div>
      </Spec>
      <Spec names={["StatusPill"]} source="status/StatusPill.tsx">
        <div className={k.col}>
          <StatusPill machine="run" state="awaiting_gate" />
          <StatusPill machine="job" state="running" />
          <StatusPill machine="slot" state="missed" />
          <StatusPill machine="style" state="candidate" />
          <StatusPill machine="library" state="reference" />
          <StatusPill machine="job" state="paused" />
        </div>
      </Spec>
    </Section>
  );
}
