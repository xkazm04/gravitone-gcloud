// The Floor before its read (floor/_floor/Floor.tsx): the lanes' grid - column heads, four lanes of
// rail | foundry | weir | shelf - beside the calendar column. The Floor walks every v1 store, so it
// is the slowest section to arrive and the one this frame matters most for.
//
// The lanes keep the default rows: the loaded Floor grows a lane whose shelf holds something
// (floor.ts `laneRows`), which only the read knows, so a lane border may still move on arrival.
import { cx } from "@gt/ui/components/cx.ts";
import cal from "@gt/ui/components/floor/CalendarColumn.module.css";
import { FLOOR_LANES } from "@gt/ui/components/floor/floor.ts";
import lane from "@gt/ui/components/floor/Lane.module.css";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import f from "../../floor/_floor/Floor.module.css";
import { Frame } from "./Frame.tsx";

export function FloorFrame() {
  return (
    <Frame name="floor" className={f.floor}>
      <div className={f.lanes}>
        <div className={f.colheads}>
          <div className={f.corner} />
          <div className={cx(f.colhead, f.cFoundry)} />
          <div className={cx(f.colhead, f.cWeir)} />
          <div className={cx(f.colhead, f.cShelf)} />
        </div>
        {FLOOR_LANES.map((l) => (
          <section key={l.id} className={lane.lane}>
            <div className={lane.rail} />
            <div className={cx(lane.cell, lane.foundry)}>
              <div className={f.foundryCell}>
                <div className={f.track}>
                  <Ghost fill label={`${l.name} composer`} />
                </div>
                <div className={f.track}>
                  <Ghost label={`${l.name} runs`} />
                </div>
              </div>
            </div>
            <div className={cx(lane.cell, lane.weir)}>
              <div className={f.weirCell}>
                <Ghost label={`${l.name} weir`} />
              </div>
            </div>
            <div className={cx(lane.cell, lane.shelf)}>
              <div className={f.track}>
                <Ghost label={`${l.name} shelf`} />
              </div>
            </div>
          </section>
        ))}
      </div>
      <aside className={cal.col}>
        <div className={cal.head} />
        <div className={cal.body}>
          <Ghost count={6} label="calendar" />
        </div>
      </aside>
    </Frame>
  );
}
