"use client";

// RESEARCH · THE ADS BRIEF AND ITS IDEA WELL (STEPS-DESIGN §2; v1 AdsIdea, BriefCard). PRIMARY:
// the brief's seven fields, each written as an op on blur, then the idea well. RAIL: the ideas
// (angle, title, picked). INSPECTOR: the idea - hook, twist, why it works, the round's truth, the
// screening gates in their own words, the picture claim, the risk. HEADER: "generate ideas" is a
// receipt, and it stays disarmed - naming what it needs - until product, proposition and CTA are
// written (v1's button looked enabled over an empty brief). Picking is an op, and it can be
// changed or undone like any other (v1 could not unpick).
import { useEffect, useRef, useState } from "react";

import type { AdBriefField, PartView, ResearchData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { FIELD_ATTR } from "@gt/ui/keymap/target";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ResearchData, { face: "ads" }>;
const FIELDS: readonly { readonly f: AdBriefField; readonly label: string; readonly wide?: true }[] = [
  { f: "product", label: "product" },
  { f: "audience", label: "audience" },
  { f: "proposition", label: "proposition", wide: true },
  { f: "tone", label: "tone" },
  { f: "cta", label: "call to action" },
  { f: "platform", label: "platform" },
  { f: "mustInclude", label: "must include", wide: true },
];

/** What a draft is written as: the must-include list is comma separated. */
const fieldOf = (f: AdBriefField, draft: string): string | readonly string[] => (f === "mustInclude" ? draft.split(",").map((x) => x.trim()).filter((x) => x !== "") : draft);
const asText = (v: string | readonly string[]): string => (typeof v === "string" ? v : v.join(", "));

function BriefField({ f, label, value, missing, busy, onCommit }: { readonly f: AdBriefField; readonly label: string; readonly value: string | readonly string[]; readonly missing: boolean; readonly busy: boolean; readonly onCommit: (v: string | readonly string[]) => void }) {
  const [draft, setDraft] = useState(asText(value));
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setDraft(asText(value));
  }
  // The island declines a write while another is in flight (PartEditor `write`): a blur that lands
  // inside a round trip is held and sent when the trip ends, not shown as saved and dropped.
  const held = useRef(false);
  const commit = (): void => {
    if (draft === asText(value)) return;
    if (busy) held.current = true;
    else onCommit(fieldOf(f, draft));
  };
  useEffect(() => {
    if (!held.current || busy) return;
    held.current = false;
    if (draft !== asText(value)) onCommit(fieldOf(f, draft));
  }, [busy, f, draft, value, onCommit]);
  return (
    <label className={cx(missing && s.missing)}>
      {label}
      <input className={s.input} aria-label={label} aria-invalid={missing || undefined} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} onBlur={commit} {...{ [FIELD_ATTR]: "part-field" }} />
    </label>
  );
}

export function AdsBriefEditor({ frame, send, busy, error, data: d }: EditorProps<PartView<"research">> & { readonly data: Data }) {
  // Untouched (undefined) follows the data - the first item, or what is picked - so a list that
  // lands after mount (an act's output) has a selection; null is the operator's Esc.
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? d.picked ?? d.ideas[0]?.id ?? null : chosen;
  const idea = d.ideas.find((i) => i.id === sel);
  const pick = (id: string): void => send({ op: "pick-idea", ideaId: id });

  useKeys(
    "part.research",
    {
      item: ({ index }) => {
        const next = walk(d.ideas.map((i) => i.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      open: () => (idea === undefined || busy || idea.id === d.picked ? false : pick(idea.id)),
      deselect: () => setSel(null),
    },
    { facts: idea === undefined ? [] : ["item"] },
  );

  return (
    <PartWorkspace
      {...frame}
      mode="part.research"
      facts={idea === undefined ? [] : ["item"]}
      rail={{
        label: "ideas",
        children:
          d.ideas.length === 0 ? (
            <div className={s.railHead}>
              <Empty label="no ideas" />
            </div>
          ) : (
            <RailList
              label="ideas"
              items={d.ideas}
              idOf={(i) => i.id}
              selected={sel}
              onSelect={setSel}
              row={(i) => (
                <div className={s.rr}>
                  <div className={s.rrTop}>
                    <span>{i.id === d.picked ? "●" : "○"}</span>
                    <span>{i.angle}</span>
                  </div>
                  <div className={cx(s.rrTitle, s.clamp2)}>{i.title}</div>
                </div>
              )}
            />
          ),
      }}
      primary={{
        label: "brief and ideas",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.brief} aria-label="brief" role="group">
              {FIELDS.map((x) => (
                <div key={x.f} className={x.wide === true ? s.wide : undefined}>
                  <BriefField f={x.f} label={x.label} value={d.brief[x.f]} missing={d.missing.includes(x.f)} busy={busy} onCommit={(value) => send({ op: "set-brief", field: x.f, value })} />
                </div>
              ))}
            </div>
            <div className={s.bar}>
              <h2 className={s.h}>ideas</h2>
              {d.briefChanged && <Chip label="brief changed" tone="amber" casing="lower" />}
              {d.engine !== undefined && <Provenance model={d.engine.model} vendor={d.engine.provider} cost={d.engine.usd === null ? (d.engine.unpricedReason ?? "unpriced") : `$${d.engine.usd.toFixed(2)}`} />}
            </div>
            <div className={s.well}>
              {d.ideas.map((i) => (
                <button key={i.id} type="button" className={s.idea} aria-pressed={i.id === d.picked} data-idea={i.id} {...(i.id === sel ? { "data-on": "" } : {})} onClick={() => setSel(i.id)}>
                  <span className={s.blabel}>{i.angle}</span>
                  <span className={s.ititle}>{i.title}</span>
                  <span className={cx(s.work, s.clamp2)}>{i.hook}</span>
                </button>
              ))}
            </div>
          </>
        ),
      }}
      inspector={{
        label: "idea",
        children:
          idea === undefined ? (
            <Empty label="no idea selected" />
          ) : (
            <>
              <div className={s.bar}>
                <Chip label={idea.angle} casing="lower" />
                {idea.id === d.picked && <Chip label="picked" tone="emerald" casing="lower" />}
              </div>
              <div className={s.sect}>
                <p className={s.claim}>{idea.title}</p>
                <dl className={s.kv}>
                  <dt>hook</dt>
                  <dd>{idea.hook}</dd>
                  <dt>twist</dt>
                  <dd>{idea.twist}</dd>
                  <dt>works</dt>
                  <dd>{idea.whyItWorks}</dd>
                  {idea.truth !== undefined && (
                    <>
                      <dt>truth</dt>
                      <dd>{idea.truth}</dd>
                    </>
                  )}
                  {idea.pictureClaim !== undefined && idea.pictureClaim !== null && (
                    <>
                      <dt>claim</dt>
                      <dd>{idea.pictureClaim}</dd>
                    </>
                  )}
                </dl>
              </div>
              {idea.gateNotes.length > 0 && (
                <div className={s.sect}>
                  <h3 className={s.h}>gates</h3>
                  {idea.gateNotes.map((g) => (
                    <p key={g} className={cx(s.mono)}>
                      {g}
                    </p>
                  ))}
                </div>
              )}
              <p className={s.risk}>{`risk — ${idea.risk}`}</p>
              <div className={s.acts}>
                {idea.id === d.picked ? <Chip label="picked" tone="emerald" casing="lower" /> : <Button label="pick" size="sm" tone="emerald" shortcut={{ mode: "part.research", verb: "open" }} disabled={busy} onPress={() => pick(idea.id)} />}
              </div>
            </>
          ),
      }}
    />
  );
}
