// The Ledger before its read (ledger/_ledger/Ledger.tsx): toolbar, time strip, then
// facets | events | detail - the route's own grid, so its drawers fold at the same widths.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import ts from "@gt/ui/components/timestrip/TimeStrip.module.css";

import l from "../../ledger/_ledger/ledger.module.css";
import { Frame } from "./Frame.tsx";

export function LedgerFrame() {
  return (
    <Frame name="ledger" className={l.lg}>
      <div className={l.top}>
        <div className={l.search}>
          <Ghost label="filters" />
        </div>
      </div>
      <div className={ts.strip}>
        <div className={ts.side} />
        <div className={ts.main}>
          <div className={ts.bars}>
            <Ghost fill label="events per day" />
          </div>
          <div className={ts.axis} />
        </div>
      </div>
      <div className={l.body}>
        <aside className={l.facets}>
          <div className={l.sec}>
            <Ghost count={8} label="facets" />
          </div>
        </aside>
        <section className={l.center}>
          <div className={l.cols} />
          <div className={l.scroll}>
            <div className={l.sec}>
              <Ghost count={14} label="events" />
            </div>
          </div>
        </section>
        <aside className={l.detail}>
          <div className={l.dtHead} />
          <div className={l.dt}>
            <Ghost count={4} label="event detail" />
          </div>
        </aside>
      </div>
    </Frame>
  );
}
