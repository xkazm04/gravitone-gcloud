"use client";

// THE HUNT'S MAP - one column per axis the text engine drafted, the axis and its rationale at the
// head (the drafter's words are the work, kept verbatim), a card per leaf under it. v1
// app/playground/hunt/{Board,Inspector}.tsx absorbed onto columns: no canvas, no edges.
//
// A leaf is PICKED by its name (click replaces, ⌘/ctrl toggles, shift ranges in board order -
// ./hunt.ts clickSelect) and a column's pill takes or releases its whole branch. The card shows
// what the leaf asks for (provider, length, techniques, tempo and key, the prompt), its state, and
// - once heard - its take on the wave ground with the one transport's play and the crown. A leaf
// that failed carries the engine's words verbatim; a Suno leaf goes by hand, its prompt copyable
// and its file dropped back on the card (v1 Board's "awaiting the Suno return", L72).
import { useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Wave } from "../wave/Wave.tsx";
import { PlayMark } from "./AudioPreview.tsx";
import { buildTree, headTake, lengthOf, type AuditionTake, type HuntLeafView, type Reach, type Selection } from "./hunt.ts";
import s from "./Hunt.module.css";

export type PickMods = { readonly shift: boolean; readonly toggle: boolean };

export type HuntMapProps = {
  readonly nodes: readonly HuntLeafView[];
  readonly takes: Readonly<Record<string, AuditionTake>>;
  readonly selection: Selection;
  readonly reach: Readonly<Record<string, Reach>>;
  readonly playing: string | null;
  /** Leaves whose crown is in flight. */
  readonly crowning: ReadonlySet<string>;
  readonly onPick: (id: string, mods: PickMods) => void;
  readonly onBranch: (leafIds: readonly string[]) => void;
  readonly onPlay: (take: AuditionTake) => void;
  readonly onCrown: (leaf: HuntLeafView, takeId: string, on: boolean) => void;
  readonly onCopy: (prompt: string) => void;
  /** Leaves whose returned file is uploading. */
  readonly returning: ReadonlySet<string>;
  /** A Suno leaf's file, back from Suno. */
  readonly onReturn: (leaf: HuntLeafView, file: File) => void;
};

/** A native FILE drop (from the desktop) or a pick: the leaf's take, back from Suno. */
function ReturnDrop({ leaf, busy, onFile }: { readonly leaf: HuntLeafView; readonly busy: boolean; readonly onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={cx(s.drop, over && s.dropOver, busy && s.dropBusy)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f !== undefined && !busy) onFile(f);
      }}
    >
      {busy ? "filing…" : "↩ file"}
      <input
        type="file"
        accept="audio/*"
        className={s.dropInput}
        aria-label={`return the Suno file for ${leaf.label}`}
        disabled={busy}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f !== undefined) onFile(f);
        }}
      />
    </label>
  );
}

const STATE_WORD: Readonly<Record<HuntLeafView["state"], { readonly label: string; readonly tone: "neutral" | "cyan" | "violet" | "amber" | "rose" }>> = {
  idea: { label: "idea", tone: "neutral" },
  rendering: { label: "rendering", tone: "violet" },
  rendered: { label: "heard", tone: "cyan" },
  "awaiting-return": { label: "by hand", tone: "amber" },
  failed: { label: "failed", tone: "rose" },
};

function Leaf({ leaf, p }: { readonly leaf: HuntLeafView; readonly p: HuntMapProps }) {
  const picked = p.selection.ids.includes(leaf.id);
  const tid = headTake(leaf);
  const take = tid === undefined ? undefined : p.takes[tid];
  const st = STATE_WORD[leaf.state];
  const hand = p.reach[leaf.provider] === "hand";
  const on = take !== undefined && p.playing === take.id;
  return (
    <div className={cx(s.leaf, s[`leaf_${leaf.state}`], picked && s.picked, leaf.winner && s.won)} data-leaf={leaf.id} role="group" aria-label={leaf.label}>
      <div className={s.leafHead}>
        <button type="button" className={s.pick} aria-pressed={picked} onClick={(e) => p.onPick(leaf.id, { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey })}>
          <span className={cx(s.box, picked && s.boxOn)} aria-hidden="true" />
          <span className={s.leafTitle}>{leaf.label}</span>
        </button>
        {leaf.winner && <Chip label="crowned" tone="emerald" dot />}
      </div>
      <div className={s.leafMeta}>
        <Chip label={st.label} tone={st.tone} />
        <Chip label={leaf.provider} casing="lower" />
        <Chip label="length" value={lengthOf(leaf.durationS)} casing="lower" />
        {leaf.tempoBpm !== null && <Chip label="bpm" value={leaf.tempoBpm} casing="lower" />}
        {leaf.key !== null && <Chip label="key" value={leaf.key} casing="lower" />}
        {leaf.loop === true && <Chip label="loop" casing="lower" />}
        {leaf.technique.map((t) => (
          <Chip key={t} label={t} tone="violet" casing="lower" ghost />
        ))}
      </div>
      {leaf.rationale !== "" && <p className={s.why}>{leaf.rationale}</p>}
      <p className={s.prompt}>{leaf.prompt}</p>
      {take !== undefined && (
        <div className={s.leafActs}>
          {take.src !== null && (
            <button type="button" className={cx(s.play, on && s.playOn)} aria-label={`${on ? "pause" : "play"} ${leaf.label}`} onClick={() => p.onPlay(take)}>
              <PlayMark on={on} className={s.playMark} />
            </button>
          )}
          <span className={s.wave}>
            <Wave peaks={take.peaks} width={200} height={28} tone={leaf.winner ? "emerald" : "cyan"} stretch />
          </span>
          <Chip label={take.lengthS === null ? "–" : lengthOf(take.lengthS)} casing="lower" />
        </div>
      )}
      {take !== undefined && (
        <div className={s.leafActs}>
          <Button label={leaf.winner ? "Uncrown" : "Crown"} size="sm" tone={leaf.winner ? "neutral" : "emerald"} disabled={p.crowning.has(leaf.id) || take.verdict === "rejected"} onPress={() => p.onCrown(leaf, take.id, !leaf.winner)} />
          {take.verdict !== "unjudged" && <Chip label={take.verdict} tone={take.verdict === "kept" ? "emerald" : "rose"} casing="lower" />}
          {take.stage !== null && take.stage !== "pending" && <Chip label={take.stage} casing="lower" />}
        </div>
      )}
      {hand && (
        <div className={s.leafActs}>
          {leaf.state !== "rendered" && <Button label="Copy prompt" size="sm" tone="amber" onPress={() => p.onCopy(leaf.prompt)} />}
          <ReturnDrop leaf={leaf} busy={p.returning.has(leaf.id)} onFile={(f) => p.onReturn(leaf, f)} />
        </div>
      )}
      {leaf.error !== null && <ErrorLine message={leaf.error} />}
    </div>
  );
}

export function HuntMap(p: HuntMapProps) {
  const tree = buildTree(p.nodes);
  return (
    <div className={s.map} role="group" aria-label="hunt map">
      {tree.columns.map((c) => {
        const all = c.leafIds.length > 0 && c.leafIds.every((id) => p.selection.ids.includes(id));
        return (
          <section key={c.id} className={s.col} aria-label={`${c.axis} · ${c.label}`}>
            <header className={s.colHead}>
              <span className={s.colAxis}>{c.axis}</span>
              <span className={s.colLabel}>{c.label}</span>
              {c.rationale !== null && <span className={s.colWhy}>{c.rationale}</span>}
              <span>
                <Chip label={all ? "release" : "take all"} value={c.leafIds.length} pressed={all} onPress={() => p.onBranch(c.leafIds)} name={`${all ? "release" : "take"} all ${c.leafIds.length} leaves of ${c.axis}`} />
              </span>
            </header>
            {c.rows.map((r) =>
              r.kind === "group" ? (
                <div key={r.id} className={cx(s.group, s[`d${Math.min(3, r.depth)}`])}>
                  {r.node.label}
                </div>
              ) : (
                <Leaf key={r.id} leaf={r.node} p={p} />
              ),
            )}
          </section>
        );
      })}
    </div>
  );
}
