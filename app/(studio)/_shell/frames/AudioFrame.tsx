// The audio desk before its read (audio/page.tsx): the rooms column beside the work (design baseline P3). Which
// section is drawn rides in the address, and a section switch keeps the screen it leaves (a searchParams change
// keeps the segment's boundary), so the frame is only ever the first arrival: the column's glass, empty, where the
// rooms will land, and the work as one region.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../audio/_audio/audio.module.css";
import c from "../ContextColumn.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function AudioFrame() {
  return (
    <Frame name="audio" className={s.desk}>
      <div className={c.column} aria-hidden="true" />
      <div className={`${s.work} ${p.pad} ${p.fill}`}>
        <Ghost fill count={3} label="section" />
      </div>
    </Frame>
  );
}
