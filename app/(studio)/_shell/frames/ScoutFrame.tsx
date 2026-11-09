// Scout before its read (scout/_scout/Scout.tsx under its ScoutHead): the head, the graph's
// toolbar, then the bands beside the node panel. Scout's runs draw the same head over a Board
// sheet (scout/runs/[packet]).
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../scout/_scout/scout.module.css";
import { BoardSheetFrame } from "./BoardFrame.tsx";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function ScoutFrame() {
  return (
    <Frame name="scout" className={s.page}>
      <div className={s.head}>
        <div className={p.tabs}>
          <Ghost fill label="scout head" />
        </div>
      </div>
      <div className={s.scout}>
        <div className={s.top}>
          <Ghost label="scout tools" />
        </div>
        <div className={s.body}>
          <div className={s.bands}>
            <Ghost count={10} label="bands" />
          </div>
          <div className={s.side}>
            <div className={p.pad}>
              <Ghost count={5} label="node" />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function ScoutRunFrame() {
  return (
    <Frame name="scout run" className={s.page}>
      <div className={s.head}>
        <div className={p.tabs}>
          <Ghost fill label="scout head" />
        </div>
      </div>
      <BoardSheetFrame />
    </Frame>
  );
}
