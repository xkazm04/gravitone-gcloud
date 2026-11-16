"use client";

// Step 4, the sleeve: the picture, large, with its true size and the store's rules beside it, and
// its three sources - generate (S1 drafts the prompt and prices the call; the call itself is not
// wired), upload (the file's own pixels, measured here), or a still from a music video the track has.
import { useState } from "react";

import { PRICES } from "@/lib/imaging/pricing";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Hint } from "@gt/ui/components/hint/Hint.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { SLEEVE_PX, type Release, type Sleeve, type SleeveSource } from "@gt/domain/release";

import { Problems } from "./Problems.tsx";
import { problemsOf, type StepProps } from "./steps.ts";
import s from "./sleeve.module.css";

const SOURCE_LABEL: Readonly<Record<SleeveSource, string>> = { generated: "generate", upload: "upload", "mv-look": "MV look" };
type Provider = "codex" | "leonardo";
const usdOf = (provider: string): number | undefined => PRICES.find((p) => p.provider === provider)?.usdPerImage;
const FLARE = usdOf("leonardo-flare");
const TAKES = 4;

/** The pixels a picture really has, read off the decoded image - never the file's claim. */
function measure(href: string, done: (w: number, h: number) => void, fail: (why: string) => void): void {
  const img = new Image();
  img.onload = () => done(img.naturalWidth, img.naturalHeight);
  img.onerror = () => fail(`${href}: the image did not decode`);
  img.src = href;
}

const draftPrompt = (r: Release): string =>
  [`Square album cover for "${r.title}" by ${r.artist}`, r.genre.primary === null ? null : `${r.genre.primary}${r.genre.secondary === null ? "" : ` / ${r.genre.secondary}`} mood`, "no text, no logos, no frame"]
    .filter((x): x is string => x !== null)
    .join(", ");

function Generate({ release }: { readonly release: Release }) {
  const [prompt, setPrompt] = useState(() => draftPrompt(release));
  const [provider, setProvider] = useState<Provider>("codex");
  const each = provider === "codex" ? 0 : FLARE;
  return (
    <div className={s.panel}>
      <TextArea label="sleeve prompt" value={prompt} rows={5} onChange={setPrompt} />
      <div className={s.row}>
        <Seg
          label="image provider"
          options={[
            { value: "codex", label: "Codex $0" },
            { value: "leonardo", label: FLARE === undefined ? "Leonardo · unpriced" : `Leonardo $${FLARE.toFixed(4)}` },
          ]}
          value={provider}
          onChange={setProvider}
        />
        {provider === "leonardo" && <Hint name="Leonardo price basis" text="GPT Image 2.5 Flare, 6 credits at 1024×1024, as measured" />}
      </div>
      <div className={s.row}>
        <Button label={`${TAKES} takes`} disabled badge={each === undefined ? undefined : { label: "total", value: `$${(each * TAKES).toFixed(2)}` }} />
        <Chip label="not wired in S1" tone="amber" ghost />
      </div>
    </div>
  );
}

function Upload({ onSleeve }: { readonly onSleeve: (sl: Sleeve) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={s.panel}>
      <label className={s.file}>
        <input
          type="file"
          accept="image/jpeg,image/png"
          className={s.fileInput}
          aria-label="sleeve image file"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file === undefined) return;
            const href = URL.createObjectURL(file);
            setError(null);
            measure(
              href,
              (w, h) => onSleeve({ source: "upload", href, widthPx: w, heightPx: h, rgb: /^image\/(jpeg|png)$/.test(file.type) }),
              () => {
                URL.revokeObjectURL(href);
                setError(`${file.name}: the image did not decode`);
              },
            );
          }}
        />
        <span aria-hidden="true">Choose a JPG or PNG</span>
      </label>
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}

function MvLooks({ props, onSleeve }: { readonly props: StepProps; readonly onSleeve: (sl: Sleeve) => void }) {
  const [error, setError] = useState<string | null>(null);
  const current = props.release.sleeve?.href ?? null;
  if (props.read.mvLooks.length === 0) return <Chip label="no music-video stills" ghost />;
  return (
    <div className={s.panel}>
      <ul className={s.looks} aria-label="music-video stills">
        {props.read.mvLooks.map((m) => (
          <li key={m.href}>
            <button
              type="button"
              className={s.look}
              aria-pressed={m.href === current}
              aria-label={`use the still from ${m.title}`}
              onClick={() => {
                setError(null);
                measure(m.href, (w, h) => onSleeve({ source: "mv-look", href: m.href, widthPx: w, heightPx: h, rgb: true }), setError);
              }}
            >
              <Plate src={m.href} alt="" className={s.lookImg} width={160} aspect={1} lazy />
              <span className={s.lookTitle}>{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}

export function StepSleeve(props: StepProps) {
  const { release: r, problems, dispatch } = props;
  const sl = r.sleeve;
  const [source, setSource] = useState<SleeveSource>(sl?.source ?? (props.read.mvLooks.length > 0 ? "mv-look" : "upload"));
  const onSleeve = (next: Sleeve | null) => dispatch({ type: "sleeve", id: r.id, sleeve: next });
  const square = sl === null || sl.widthPx === sl.heightPx;
  return (
    <div className={s.sleeve}>
      <figure className={s.stage} data-square={square ? "" : undefined}>
        {sl !== null && sl.href !== null ? (
          <Plate src={sl.href} alt={`sleeve of ${r.title}`} className={s.art} aspect={sl.widthPx > 0 && sl.heightPx > 0 ? sl.widthPx / sl.heightPx : 1} />
        ) : (
          <PlateMissing label="no sleeve" className={s.missing} aspect={1} />
        )}
        {sl !== null && (
          <figcaption className={s.caption}>
            <span className={s.dims}>
              {sl.widthPx} × {sl.heightPx} px
            </span>
            <Chip label={sl.rgb ? "RGB" : "not RGB"} tone={sl.rgb ? "emerald" : "rose"} />
            <Chip label={SOURCE_LABEL[sl.source]} casing="lower" />
          </figcaption>
        )}
      </figure>
      <div className={s.side}>
        <Problems problems={problemsOf(problems, "sleeve")} label="sleeve problems" />
        <section aria-label="store rules">
          <CapsHeading text="Stores ask for" variant="section" />
          <Facts
            facts={[
              { term: "shape", value: "square" },
              { term: "size", value: `${SLEEVE_PX} × ${SLEEVE_PX} px` },
              { term: "colour", value: "RGB" },
            ]}
          />
        </section>
        <section aria-label="sleeve source">
          <CapsHeading text="Source" variant="section" />
          <Seg label="sleeve source" options={(["mv-look", "upload", "generated"] as const).map((v) => ({ value: v, label: SOURCE_LABEL[v] }))} value={source} onChange={setSource} />
          {source === "generated" && <Generate release={r} />}
          {source === "upload" && <Upload onSleeve={onSleeve} />}
          {source === "mv-look" && <MvLooks props={props} onSleeve={onSleeve} />}
        </section>
        {sl !== null && <Button label="Remove sleeve" size="sm" tone="rose" onPress={() => onSleeve(null)} />}
      </div>
    </div>
  );
}
