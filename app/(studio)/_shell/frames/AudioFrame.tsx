// The audio desk before its read (audio/page.tsx): the tab bar over the section's body. Which
// section is drawn rides in the address, and a section switch keeps the screen it leaves (a
// searchParams change keeps the segment's boundary), so the body is held as one region.
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import s from "../../audio/_audio/audio.module.css";
import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

export function AudioFrame() {
  return (
    <Frame name="audio" className={s.desk}>
      <div className={s.bar}>
        <div className={p.pad}>
          <Ghost label="audio desk" />
        </div>
      </div>
      <div className={`${p.pad} ${p.fill}`}>
        <Ghost fill count={3} label="section" />
      </div>
    </Frame>
  );
}
