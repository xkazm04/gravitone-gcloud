"use client";

// The sleeve and its three sources. Generate drafts a prompt from the record and names its provider
// and price; its run is not wired in S1, so it makes nothing. Upload and MV look measure the picture
// the browser actually holds (natural width and height) - a look is the still a track's video
// already has.
import { useState } from "react";

import { SLEEVE_PX, type Release, type Sleeve, type SleeveSource } from "@gt/domain/release";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { sectionOf, type SectionProps } from "./board.ts";
import { SleeveFace } from "./Card.tsx";
import { Cell, ProblemLine } from "./Sheet.tsx";
import s from "./sheet.module.css";

type Source = "generate" | "upload" | "mv-look";
type Provider = "codex" | "leonardo";
const SOURCE_OPTS: readonly { readonly value: Source; readonly label: string }[] = [
  { value: "generate", label: "generate" },
  { value: "upload", label: "upload" },
  { value: "mv-look", label: "MV look" },
];
const PROVIDER_OPTS: readonly { readonly value: Provider; readonly label: string }[] = [
  { value: "codex", label: "Codex · $0" },
  { value: "leonardo", label: "Leonardo · priced by receipt" },
];
const SOURCE_NAME: Readonly<Record<SleeveSource, string>> = { generated: "generated", upload: "upload", "mv-look": "MV look" };

const draftPrompt = (r: Release): string =>
  [`Square album cover for "${r.title || "untitled"}" by ${r.artist || "the artist"}`, r.genre.primary, r.genre.secondary].filter((x) => x !== null && x !== "").join(", ") + ". No text, no logos.";

/** The picture's own pixels, as the browser decodes them. */
function measure(href: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`${href}: the picture did not decode`));
    img.src = href;
  });
}

export function SleeveSection({ release: r, problems, read, dispatch }: SectionProps) {
  const [source, setSource] = useState<Source>(r.sleeve?.source === "upload" ? "upload" : r.sleeve?.source === "mv-look" ? "mv-look" : "generate");
  const [prompt, setPrompt] = useState(() => draftPrompt(r));
  const [provider, setProvider] = useState<Provider>("codex");
  const [error, setError] = useState<string | null>(null);
  const here = problems.filter((x) => sectionOf(x) === "sleeve");
  const set = (sleeve: Sleeve | null) => dispatch({ type: "sleeve", id: r.id, sleeve });

  const take = (href: string, src: SleeveSource, rgb: boolean) => {
    setError(null);
    measure(href).then(
      ({ w, h }) => set({ source: src, href, widthPx: w, heightPx: h, rgb }),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <div className={s.sleevePane} data-jump="sleeve">
      <div className={s.sleeveBig}>
        <SleeveFace release={r} size="sheet" disc={false} />
        {r.sleeve !== null ? (
          <Facts
            facts={[
              { term: "source", value: SOURCE_NAME[r.sleeve.source] },
              { term: "size", value: `${r.sleeve.widthPx} × ${r.sleeve.heightPx} px` },
              { term: "target", value: `${SLEEVE_PX} × ${SLEEVE_PX} px` },
              { term: "colour", value: r.sleeve.rgb ? "RGB" : "not RGB" },
            ]}
          />
        ) : (
          <Chip label="no sleeve" tone="rose" />
        )}
        {r.sleeve !== null && <Button label="remove sleeve" size="sm" tone="rose" onPress={() => set(null)} />}
        {here.length > 0 && (
          <div className={s.lines}>
            {here.map((x) => (
              <ProblemLine key={x.code} problem={x} />
            ))}
          </div>
        )}
      </div>
      <div className={s.sleeveSrc}>
        <Seg<Source> label="sleeve source" options={SOURCE_OPTS} value={source} onChange={setSource} />
        {source === "generate" && (
          <div className={s.stack}>
            <Cell label="prompt" wide>
              <TextArea label="sleeve prompt" rows={4} value={prompt} onChange={setPrompt} />
            </Cell>
            <div className={s.rowWrap}>
              <Button label="redraft" size="sm" onPress={() => setPrompt(draftPrompt(r))} />
              <Seg<Provider> label="sleeve provider" options={PROVIDER_OPTS} value={provider} onChange={setProvider} />
            </div>
            <div className={s.rowWrap}>
              <Button label="4 takes" tone="cyan" disabled badge={{ label: "not wired", tone: "neutral" }} />
            </div>
          </div>
        )}
        {source === "upload" && (
          <div className={s.stack}>
            <label className={s.file}>
              <span className={s.fileBtn} aria-hidden="true">
                choose image
              </span>
              <input
                className={s.fileInput}
                type="file"
                accept="image/jpeg,image/png"
                aria-label="sleeve image, JPG or PNG"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f === undefined) return;
                  take(URL.createObjectURL(f), "upload", f.type === "image/jpeg" || f.type === "image/png");
                }}
              />
            </label>
            <Chip label="JPG · PNG" casing="lower" ghost />
          </div>
        )}
        {source === "mv-look" &&
          (read.mvLooks.length === 0 ? (
            <Empty label="no music-video stills" />
          ) : (
            <ul className={s.looks}>
              {read.mvLooks.map((l) => (
                <li key={l.takeId}>
                  <button type="button" className={s.look} aria-pressed={r.sleeve?.href === l.href} onClick={() => take(l.href, "mv-look", true)}>
                    <Plate src={l.href} alt="" className={s.lookImg} aspect={1} lazy />
                    <span className={s.lookTitle}>{l.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {error !== null && <ErrorLine message={error} live />}
      </div>
    </div>
  );
}
