"use client";

// The sleeve, from one of its three sources: generated (a prompt drafted from the release, a
// provider, four takes - not wired in S1, so no result is drawn), an upload (its true size read
// from the file in the browser; RGB assumed for jpg and png) or a still from a music video the
// release's tracks already have. The sleeve's own problems sit under it.
import { useState, type ChangeEvent, type Dispatch } from "react";

import type { Release, Sleeve, SleeveSource } from "@gt/domain/release";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import type { MvLook } from "../../_port/port.ts";
import type { DraftEvent } from "../../draft.ts";
import { worst } from "./fmt.ts";
import r from "./rail.module.css";

const SOURCE_OPTIONS: readonly { value: SleeveSource; label: string }[] = [
  { value: "generated", label: "generate" },
  { value: "upload", label: "upload" },
  { value: "mv-look", label: "MV look" },
];
type Provider = "codex" | "leonardo";
const PROVIDER_OPTIONS: readonly { value: Provider; label: string }[] = [
  { value: "codex", label: "Codex · $0" },
  { value: "leonardo", label: "Leonardo · receipt" },
];

const draftPrompt = (r: Release): string => {
  const genre = [r.genre.primary, r.genre.secondary].filter((g) => g !== null).join(" / ");
  const title = r.title.trim() === "" ? "" : ` for "${r.title}"`;
  return `Square album cover${title} by ${r.artist}${genre === "" ? "" : `, ${genre}`}. No text, no logos.`;
};

/** An image's true size, read in the browser before the sleeve is set. */
function measure(href: string, done: (w: number, h: number) => void, fail: () => void): void {
  const img = new Image();
  img.onload = () => done(img.naturalWidth, img.naturalHeight);
  img.onerror = fail;
  img.src = href;
}

export type SleeveBlockProps = {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly looks: readonly MvLook[];
  readonly dispatch: Dispatch<DraftEvent>;
};

export function SleeveBlock({ release, problems, looks, dispatch }: SleeveBlockProps) {
  const sl = release.sleeve;
  const [source, setSource] = useState<SleeveSource>(sl?.source ?? "generated");
  // The prompt follows the release until someone edits it.
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? draftPrompt(release);
  const [provider, setProvider] = useState<Provider>("codex");
  const [error, setError] = useState<string | null>(null);
  const set = (sleeve: Sleeve | null) => dispatch({ type: "sleeve", id: release.id, sleeve });

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (f === undefined) return;
    const href = URL.createObjectURL(f);
    setError(null);
    measure(
      href,
      (w, h) => set({ source: "upload", href, widthPx: w, heightPx: h, rgb: f.type === "image/jpeg" || f.type === "image/png" }),
      () => {
        URL.revokeObjectURL(href);
        setError(`${f.name}: not readable as an image`);
      },
    );
  };
  const takeLook = (look: MvLook) => {
    setError(null);
    measure(
      look.href,
      (w, h) => set({ source: "mv-look", href: look.href, widthPx: w, heightPx: h, rgb: true }),
      () => setError(`${look.href}: not loaded`),
    );
  };

  return (
    <section id="desk-sleeve" tabIndex={-1} className={r.block} aria-label="sleeve" data-mark={worst(problems)}>
      <CapsHeading text="sleeve" level={3} />
      <div className={r.sleeveTop}>
        {sl?.href ? <Plate src={sl.href} alt={`${release.title} sleeve`} className={r.sleeveArt} /> : <PlateMissing className={r.sleeveArt} label="no sleeve" />}
        <div className={r.sleeveFacts}>
          {sl === null ? (
            <Chip label="none" tone="rose" dot />
          ) : (
            <>
              <Chip label="px" value={`${sl.widthPx}×${sl.heightPx}`} casing="lower" />
              <Chip label={sl.rgb ? "RGB" : "not RGB"} tone={sl.rgb ? "neutral" : "rose"} />
              <Chip label={SOURCE_OPTIONS.find((o) => o.value === sl.source)?.label ?? sl.source} casing="lower" />
              <Button label="Clear" size="sm" onPress={() => set(null)} />
            </>
          )}
        </div>
      </div>
      {problems.length > 0 && (
        <ul className={r.inline}>
          {problems.map((p) => (
            <li key={p.code} className={r.inlineRow} data-sev={p.severity}>
              <Glyph name="warn" className={r.sevGlyph} />
              {PROBLEM_TEXT[p.code]}
            </li>
          ))}
        </ul>
      )}

      <Seg<SleeveSource> label="sleeve source" options={SOURCE_OPTIONS} value={source} onChange={setSource} />
      {source === "generated" && (
        <div className={r.stack}>
          <TextArea label="sleeve prompt" value={prompt} rows={3} onChange={setEdited} />
          <div className={r.rowWrap}>
            <Seg<Provider> label="sleeve provider" options={PROVIDER_OPTIONS} value={provider} onChange={setProvider} />
            <Button label="4 takes" disabled badge={{ label: "not wired", tone: "neutral" }} />
          </div>
        </div>
      )}
      {source === "upload" && (
        <label className={r.file}>
          <input className={r.fileInput} type="file" accept="image/png,image/jpeg" aria-label="upload sleeve" onChange={upload} />
          <span aria-hidden="true">Choose image</span>
          <span className={r.fileHint} aria-hidden="true">
            jpg · png
          </span>
        </label>
      )}
      {source === "mv-look" &&
        (looks.length === 0 ? (
          <Chip label="no MV looks" ghost casing="lower" />
        ) : (
          <ul className={r.looks}>
            {looks.map((l) => (
              <li key={l.takeId}>
                <button type="button" className={r.look} aria-pressed={sl?.href === l.href} aria-label={`sleeve from ${l.title}`} onClick={() => takeLook(l)}>
                  <Plate src={l.href} alt="" className={r.lookArt} lazy />
                  <span className={r.lookTitle} aria-hidden="true">
                    {l.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {error !== null && <ErrorLine message={error} live />}
    </section>
  );
}
