"use client";

// A Suno prompt card (spark suno-advisor): what the person pastes BY HAND into suno.com/create - the
// studio never drives Suno. The head names the version, its model and whether it is instrumental, with
// Copy all and Open Suno; a version with a parent carries its lineage under the head. Then the three
// sliders as the prompt set them (a local override changes what this card shows, nothing else, and
// never writes anywhere), and style / lyrics / exclude as mono blocks with their counts against
// SUNO_LIMITS and a Copy each.
//
// Exclude from taste: the person's confirmed `dislike` lines join the exclude text AT COPY TIME, each as
// a chip that can be taken out of (and put back into) this copy only - the profile is untouched.
//
// The clipboard is the caller's (`copy`): a page has one copy act that answers either way (outside a
// secure context there is no clipboard), and the kit holds no second one.
import { useState, type ReactNode } from "react";

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { SUNO_SETTINGS, type StudioTasteLine, type SunoSetting } from "@gt/domain/audio.suno";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Fader } from "../fader/Fader.tsx";
import { Lineage } from "./Lineage.tsx";
import { copyAllText, countOf, mergedExclude, NEW_TAB_FEATURES, SUNO_CREATE_URL, tasteExcludes, type CopyField } from "./suno.ts";
import s from "./SunoPromptCard.module.css";

export type SunoPromptCardProps = {
  readonly node: StudioNodeOf<"suno_prompt">;
  /** The confirmed taste profile; its dislikes join the exclude text at copy time. */
  readonly taste: readonly StudioTasteLine[];
  /** Put text on the clipboard; resolve with the refusal in words, or null when it went. */
  readonly copy: (text: string) => Promise<string | null>;
  /** Open suno.com/create; default a new tab with no opener and no referrer. */
  readonly onOpen?: () => void;
};

const SETTING_WORDS: Readonly<Record<SunoSetting, string>> = { weirdness: "weirdness", styleInfluence: "style influence", variety: "variety" };

const openSuno = (): void => {
  window.open(SUNO_CREATE_URL, "_blank", NEW_TAB_FEATURES);
};

type Copied = { readonly what: CopyField | "all"; readonly error: string | null };

function Block({ field, label, text, copied, onCopy, children }: { readonly field: CopyField; readonly label: string; readonly text: string; readonly copied: Copied | null; readonly onCopy: () => void; readonly children?: ReactNode }) {
  const c = countOf(text, field);
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <span className={s.label}>{label}</span>
        <span className={c.over ? s.over : s.count}>
          <span aria-hidden="true">{`${c.n}/${c.limit}`}</span>
          <SrOnly text={`${c.n} of ${c.limit} characters${c.over ? ", over the limit" : ""}`} />
        </span>
        <span className={s.grow} />
        {copied?.what === field && copied.error === null && <Chip label="copied" tone="emerald" casing="lower" />}
        <Button label={`Copy ${label.toLowerCase()}`} size="sm" onPress={onCopy} />
      </div>
      {text !== "" && <pre className={s.text}>{text}</pre>}
      {children}
    </div>
  );
}

export function SunoPromptCard({ node, taste, copy, onOpen = openSuno }: SunoPromptCardProps) {
  const [override, setOverride] = useState<Partial<Record<SunoSetting, number>>>({});
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<Copied | null>(null);

  const chips = tasteExcludes(taste, node.exclude);
  const exclude = mergedExclude(node.exclude, chips.filter((c) => !out.has(c)));
  const lyrics = node.lyrics ?? "";
  const changed = Object.keys(override).length > 0;

  const put = (what: Copied["what"], text: string): void => {
    void copy(text).then((error) => setCopied({ what, error }));
  };
  const toggleChip = (line: string): void =>
    setOut((was) => {
      const next = new Set(was);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  return (
    <article className={s.card} aria-label={`Suno prompt ${node.name ?? node.promptId}`}>
      <header className={s.head}>
        <h3 className={s.name}>{node.name ?? node.promptId}</h3>
        <Chip label="model" value={node.model} casing="lower" />
        {node.instrumental && <Chip label="instrumental" tone="violet" casing="lower" />}
        {node.parent !== undefined && <Chip label="from" value={node.parent} ghost casing="lower" />}
        <span className={s.grow} />
        {copied?.what === "all" && copied.error === null && <Chip label="copied" tone="emerald" casing="lower" />}
        <Button label="Copy all" tone="cyan" size="sm" onPress={() => put("all", copyAllText({ style: node.style, lyrics, exclude }))} />
        <Button label="Open Suno" size="sm" glyphAfter="chevR" onPress={onOpen} />
      </header>
      {node.parent !== undefined && <Lineage changes={node.changes ?? []} {...(node.because !== undefined ? { because: node.because } : {})} />}
      <div className={s.settings} role="group" aria-label="sliders">
        {SUNO_SETTINGS.map((k) => {
          const set = node.settings[k];
          if (set === undefined) return <Chip key={k} label={SETTING_WORDS[k]} value="not set" ghost casing="lower" />;
          const v = override[k] ?? set;
          return (
            <span key={k} className={s.setting}>
              <span className={s.label}>{SETTING_WORDS[k]}</span>
              <Fader label={SETTING_WORDS[k]} value={v} min={0} max={100} step={1} valueText={v === set ? `${v}` : `${v}, prompt says ${set}`} onChange={(n) => setOverride((o) => ({ ...o, [k]: n }))} />
              <span className={v === set ? s.num : s.moved}>{v}</span>
            </span>
          );
        })}
        {changed && <Button label="as written" size="sm" onPress={() => setOverride({})} />}
      </div>
      <Block field="style" label="Style" text={node.style} copied={copied} onCopy={() => put("style", node.style)} />
      {lyrics !== "" ? <Block field="lyrics" label="Lyrics" text={lyrics} copied={copied} onCopy={() => put("lyrics", lyrics)} /> : null}
      {(exclude !== "" || chips.length > 0) && (
        <Block field="exclude" label="Exclude" text={exclude} copied={copied} onCopy={() => put("exclude", exclude)}>
          {chips.length > 0 && (
            <div className={s.chips} role="group" aria-label="from your taste">
              {chips.map((c) => (
                <Chip key={c} label={c} tone={out.has(c) ? "neutral" : "rose"} ghost={out.has(c)} casing="lower" pressed={!out.has(c)} name={`${c}, ${out.has(c) ? "left out of this copy" : "in this copy"}`} onPress={() => toggleChip(c)} />
              ))}
            </div>
          )}
        </Block>
      )}
      {copied !== null && copied.error !== null && <ErrorLine message={copied.error} live />}
    </article>
  );
}
