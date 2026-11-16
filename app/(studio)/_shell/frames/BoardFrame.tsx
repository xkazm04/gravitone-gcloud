// A packet on the Board before its read, loaded as a page (board/_board/Board.tsx `kind="full"`):
// the level sheet drawn in flow - its bar, then the packet rail beside the desk. The sheet over the
// Floor (@sheet/(.)board) has no frame: it rises once, with its packet.
import { cx } from "@gt/ui/components/cx.ts";
import desk from "@gt/ui/components/desk/Desk.module.css";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import sheet from "@gt/ui/components/sheet/LevelSheet.module.css";

import { Frame } from "./Frame.tsx";
import p from "./frames.module.css";

const SHEET = cx(sheet.sheet, sheet.full, sheet.open);

export function BoardFrame() {
  return (
    <Frame name="board" className={SHEET}>
      <SheetBody />
    </Frame>
  );
}

/** The sheet without the Frame root: Scout's runs draw their head above it, in their own Frame. */
export function BoardSheetFrame() {
  return (
    <div className={SHEET}>
      <SheetBody />
    </div>
  );
}

function SheetBody() {
  return (
    <>
      <div className={sheet.bar}>
        <Ghost label="packet" />
      </div>
      <div className={sheet.body}>
        <div className={desk.board}>
          <div className={desk.rail}>
            <Ghost count={8} label="packets" />
          </div>
          <div className={desk.desk}>
            <div className={`${p.pad} ${p.fill}`}>
              <Ghost fill label="desk" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
