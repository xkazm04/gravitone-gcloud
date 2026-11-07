"use client";

// AFTER THE PICK: the winner's mp3 to take to Suno - for a song declared third-party and uncleared, the download
// states its consequence once before the file is handed over (a destructive-confirm style exemption: the
// sentence is the work's) - then the remix brought back by hand with its style, the two style prompts saved,
// and the chain the cover now is: source section, winner, remix, each playable.
import { useState } from "react";

import { COVER_STYLE_MAX } from "@gt/domain/cover";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { useEar } from "@gt/ui/components/audio/useEar.ts";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";

import type { CoverFlow } from "./useCover.ts";
import { exportWarning } from "./words.ts";
import s from "./cover.module.css";

const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "cover";

export function WinnerPart({ flow }: { readonly flow: CoverFlow }) {
  const r = flow.card.record;
  const url = flow.card.winnerUrl;
  const [asked, setAsked] = useState(false);
  if (url === undefined) return <Chip label="no winner" casing="lower" ghost />;
  const warning = exportWarning(r.rights);
  const take = r.takes.find((t) => t.seed === r.winnerSeed);
  const file = `${slug(r.title)}-cover-take${take?.n ?? ""}.mp3`;
  const link = (
    <a className={s.dl} href={url} download={file}>
      Download mp3
    </a>
  );
  return (
    <div className={s.fields}>
      <div className={s.row}>
        <Chip label="winner" value={take === undefined ? String(r.winnerSeed) : `take ${take.n}`} tone="emerald" />
        <span className={s.count}>{file}</span>
      </div>
      {warning === undefined ? (
        <div className={s.row}>{link}</div>
      ) : asked ? (
        <div className={s.consequence} role="group" aria-label="download consequence">
          <p>{warning}</p>
          <div className={s.row}>
            {link}
            <Button label="Back" size="sm" onPress={() => setAsked(false)} />
          </div>
        </div>
      ) : (
        <div className={s.row}>
          <Button label="Download mp3" tone="amber" onPress={() => setAsked(true)} />
        </div>
      )}
    </div>
  );
}

export function RemixPart({ flow }: { readonly flow: CoverFlow }) {
  const r = flow.card.record;
  const [file, setFile] = useState<File | null>(null);
  const [remixStyle, setRemixStyle] = useState(r.remix?.style ?? "");
  const [sourceStyle, setSourceStyle] = useState(r.sourceStyle ?? "");
  if (r.state !== "picked") return <Chip label="after the pick" casing="lower" ghost />;
  return (
    <div className={s.fields}>
      <div className={s.row}>
        <label className={s.choose}>
          <input className={s.file} type="file" accept="audio/*" aria-label="remix file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
          {r.remix === undefined ? "Choose remix" : "Replace remix"}
        </label>
        {file !== null && <Chip label={file.name} casing="lower" />}
        {file === null && r.remix !== undefined && <Chip label={r.remix.name} casing="lower" tone="emerald" />}
      </div>
      <span className={s.label}>remix style</span>
      <TextArea label="remix style" value={remixStyle} onChange={setRemixStyle} maxLength={COVER_STYLE_MAX} rows={2} disabled={flow.remixBusy} />
      <div className={s.row}>
        <Button label={flow.remixBusy ? "Uploading" : "Upload remix"} tone="cyan" size="sm" disabled={file === null || flow.remixBusy} onPress={() => file !== null && flow.sendRemix(file, remixStyle)} />
      </div>
      {flow.remixError !== null && <ErrorLine message={flow.remixError} live />}
      <span className={s.label}>source style</span>
      <TextArea label="source style" value={sourceStyle} onChange={setSourceStyle} maxLength={COVER_STYLE_MAX} rows={2} disabled={flow.stylesBusy} />
      <div className={s.row}>
        <Button label={flow.stylesBusy ? "Saving" : "Save styles"} size="sm" disabled={flow.stylesBusy} onPress={() => flow.saveStyles(sourceStyle, remixStyle)} />
        {flow.stylesSaved && <Chip label="saved" tone="emerald" casing="lower" />}
      </div>
      {flow.stylesError !== null && <ErrorLine message={flow.stylesError} live />}
    </div>
  );
}

export function ChainPart({ flow, quiet }: { readonly flow: CoverFlow; readonly quiet: () => void }) {
  const c = flow.card;
  const r = c.record;
  const ear = useEar();
  if (r.remix === undefined || c.remixUrl === undefined) return null;
  const winner = r.takes.find((t) => t.seed === r.winnerSeed);
  const links = [
    { name: "source", url: c.sourceUrl, fact: r.source.name, style: r.sourceStyle },
    { name: "winner", url: c.winnerUrl, fact: winner === undefined ? "winner" : `take ${winner.n} · seed ${winner.seed}`, style: r.style },
    { name: "remix", url: c.remixUrl, fact: r.remix.name, style: r.remix.style },
  ];
  return (
    <div className={s.fields}>
      <ol className={s.chainList} aria-label="chain">
        {links.map((l) => (
          <li key={l.name} className={s.link}>
            {l.url === undefined ? <span /> : <EarButton state={ear.stateOf(l.url)} name={l.name} onPress={() => {
                  if (l.url === undefined) return;
                  quiet();
                  ear.toggle(l.url);
                }} />}
            <span className={s.row}>
              <span className={s.label}>{l.name}</span>
              <span className={s.mono}>{l.fact}</span>
            </span>
            {l.style !== undefined && l.style !== "" && <span className={s.linkStyle}>{l.style}</span>}
          </li>
        ))}
      </ol>
      {ear.failed !== null && <ErrorLine message={ear.failed} live />}
    </div>
  );
}
