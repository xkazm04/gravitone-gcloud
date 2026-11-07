"use client";

// THE FIVE TAKES, each in its row as it finishes: pending, done or failed (ComfyUI's sentence verbatim). A done
// take plays inline in its row against the section - A/B at matched level, one row at a time, seekable - and is
// picked from its row. The rights travel on every row, because every take carries the source's melody.
import { useEffect, useState } from "react";

import { COVER_TAKE_COUNT, type CoverTake } from "@gt/domain/cover";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { hearUrl, type Heard } from "./audio.ts";
import type { AB, Side } from "./useAB.ts";
import type { CoverFlow } from "./useCover.ts";
import { clock, fiveTakes, RIGHTS_LABEL, RIGHTS_TONE, seconds, TAKE_TONE, takeUrl } from "./words.ts";
import s from "./cover.module.css";

const SIDES = [
  { value: "a" as const, label: "section" },
  { value: "b" as const, label: "take" },
];

function Player({ name, url, flow, ab }: { readonly name: string; readonly url: string; readonly flow: CoverFlow; readonly ab: AB }) {
  const [heard, setHeard] = useState<Heard | null>(null);
  useEffect(() => {
    let live = true;
    void hearUrl(url).then((a) => {
      if (live && a.ok) setHeard(a.value);
    });
    return () => {
      live = false;
    };
  }, [url]);
  const key = url;
  const here = ab.at === key;
  const at = ab.positionOf(key);
  const len = heard?.lenS ?? flow.span.endS - flow.span.startS;
  return (
    <div className={s.player}>
      <EarButton state={here && ab.playing ? "playing" : "idle"} name={name} onPress={() => ab.toggle(key, url)} />
      <Seg<Side> label={`which side of ${name}`} options={SIDES} value={here ? ab.side : "b"} onChange={(v) => ab.hear(key, url, v)} />
      <div className={s.scrub}>
        <div className={s.mini}>
          <Wave peaks={heard?.peaks.filter((_, i) => i % 4 === 0) ?? []} width={1000} height={22} tone={here && ab.side === "a" ? "amber" : "cyan"} played={len > 0 ? at / len : 0} stretch />
        </div>
        <Fader label={`position in ${name}`} value={Math.min(at, len)} min={0} max={Math.max(len, 1)} step={1} onChange={(v) => ab.seek(key, url, v)} valueText={`${clock(at)} of ${clock(len)}`} />
      </div>
      <span className={s.time}>{`${clock(at)} / ${clock(len)}`}</span>
    </div>
  );
}

function TakeRow({ t, flow, ab }: { readonly t: CoverTake; readonly flow: CoverFlow; readonly ab: AB }) {
  const r = flow.card.record;
  const url = takeUrl(flow.card, t);
  const name = `take ${t.n}`;
  const first = r.takes.find((x) => x.state === "pending")?.n === t.n;
  const winner = r.winnerSeed !== undefined && r.winnerSeed === t.seed && t.seed >= 0;
  const canPick = t.state === "done" && url !== undefined && (r.state === "judging" || r.state === "picked" || r.state === "failed");
  return (
    <li className={s.take} data-live={url !== undefined && ab.at === url ? "" : undefined} data-winner={winner ? "" : undefined} aria-label={name}>
      <div className={s.takeHead}>
        <span className={s.n}>{t.n}</span>
        <Chip label={t.state} tone={TAKE_TONE[t.state]} dot casing="lower" />
        {winner && <Chip label="winner" tone="emerald" />}
        <Chip label={RIGHTS_LABEL[r.rights]} tone={RIGHTS_TONE[r.rights]} casing="lower" name={`rights ${RIGHTS_LABEL[r.rights]}`} />
        {t.seed >= 0 && <span className={s.count}>{`seed ${t.seed}`}</span>}
        {t.renderS !== undefined && <span className={s.count}>{seconds(t.renderS)}</span>}
      </div>
      {t.state === "done" && url !== undefined ? (
        <div className={s.takeBody}>
          <Player name={name} url={url} flow={flow} ab={ab} />
          {canPick && !winner && <Button label={flow.picking === t.seed ? "Picking" : "Pick"} size="sm" tone="emerald" disabled={flow.picking !== null} onPress={() => flow.pick(t.seed)} />}
        </div>
      ) : (
        t.state === "pending" && <span className={s.wait}>{r.state === "draft" ? "—" : r.state === "failed" ? "not rendered" : r.state === "rendering" && first ? "rendering" : "queued"}</span>
      )}
      {t.state === "failed" && t.error !== undefined && (
        <span className={s.err}>
          <ErrorLine message={t.error} />
        </span>
      )}
      {url !== undefined && ab.at === url && ab.failed !== null && (
        <span className={s.err}>
          <ErrorLine message={ab.failed} live />
        </span>
      )}
    </li>
  );
}

export function TakesPart({ flow, ab }: { readonly flow: CoverFlow; readonly ab: AB }) {
  const takes = fiveTakes(flow.card.record.takes, COVER_TAKE_COUNT);
  return (
    <div className={s.fields}>
      <ol className={s.takes}>
        {takes.map((t) => (
          <TakeRow key={t.n} t={t} flow={flow} ab={ab} />
        ))}
      </ol>
      {flow.pickError !== null && <ErrorLine message={flow.pickError} live />}
    </div>
  );
}

export const doneCount = (takes: readonly CoverTake[]): number => takes.filter((t) => t.state === "done").length;
