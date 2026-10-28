// THE LIGHTING STRIP (variant "stage", kind `sections`): the song's parts along the front of the stage.
// Picking one shows who plays there (the band rests whoever sits it out); while the band plays, the
// part under the playhead is lit and the playhead walks the strip. Without a band on screen the strip
// still names the parts and their lengths.
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { LightStrip } from "@gt/ui/components/studio-stage/LightStrip.tsx";
import { playingPer } from "@gt/ui/components/studio-stage/stage.ts";

import type { StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

export function Lights({ node, ctx }: { readonly node: StudioNodeOf<"sections">; readonly ctx: StageCtx }) {
  const { stems, spans, transport, picked, live } = ctx;
  const end = spans?.[spans.length - 1]?.endS ?? null;
  const at = ctx.bandSounding && transport.state === "playing" && end !== null && end > 0 ? Math.min(1, transport.clock / end) : null;
  const rows = stems?.rows;
  const anyEntries = rows?.some((r) => r.enters !== undefined) ?? false;
  const chosen = picked === null ? null : node.rows[picked];
  return (
    <div className={s.lights}>
      <LightStrip sections={node.rows} picked={picked} onPick={ctx.pick} live={at === null ? null : live} at={at} {...(rows !== undefined ? { playing: { per: playingPer(rows, node.rows.length), of: rows.length } } : {})} />
      <p className={s.lightsWords}>
        {chosen !== undefined && chosen !== null
          ? `Showing who plays in ${chosen.name}. Press it again to see everyone.`
          : rows === undefined
            ? "The parts of the song, front of stage."
            : anyEntries
              ? "Press a part of the song to see who plays there."
              : "Everyone plays all the way through."}
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </p>
    </div>
  );
}
