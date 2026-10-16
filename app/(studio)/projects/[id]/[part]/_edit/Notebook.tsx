"use client";

// RESEARCH · THE NOTEBOOK AS A SCOPE BOARD (STEPS-DESIGN §2; v1 ResearchTriageBoard, ScopeBar,
// CardTile, FollowUpQueue, ScopeGate). PRIMARY: the dimension columns of cards, each column
// windowed. RAIL: the dimensions with KEPT n/n, then the follow-up queue (real turns now; their
// effects are decided per effect and land through `reviseNotebook`). INSPECTOR: the card - its
// claim, confidence, links and wound. HEADER: "confirm scope" is an op, beside the run acts.
//
// Every count is the server's (`scopeSummary`); the tallies replace v1's "32 of 39 cards will go
// to the Script step" and the ScopeBar sentences - the state is drawn, not narrated.
import { useMemo, useState } from "react";

import type { NotebookBoard, PartView, ResearchCard, ResearchData } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { RailList } from "@gt/ui/components/part/RailList.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { FIELD_ATTR } from "@gt/ui/keymap/target";
import { cx } from "@gt/ui/components/cx.ts";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Editors.module.css";

type Data = Extract<ResearchData, { face: "notebook" }>;

function CardRow({ c }: { readonly c: ResearchCard }) {
  return (
    <div className={cx(s.card, c.scope !== "in" && s.out)} data-card={c.id} data-scope={c.scope}>
      <div className={s.cardTop}>
        <span className={s.ell}>{c.id}</span>
        <span className={s.tag}>{c.kind}</span>
        {c.loadBearing && <span className={cx(s.tag, s.lb)}>load-bearing</span>}
        {c.leap !== undefined && <span className={cx(s.tag, s.leap)}>{c.leap}</span>}
        {c.wound !== undefined && <span className={cx(s.tag, s.wound)}>{c.wound.severity}</span>}
        {c.moved && <span className={cx(s.tag, s.moved)}>moved</span>}
        <span className={s.flags} aria-hidden="true">
          {c.liked && <span className={s.on}>♥</span>}
          {c.deepen && <span className={s.on}>⤓</span>}
          <span>{c.scope === "in" ? "●" : "○"}</span>
        </span>
      </div>
      <div className={cx(s.rrTitle, s.clamp2)}>{c.title}</div>
    </div>
  );
}

function Inspector({ c, cards, send, onSelect }: { readonly c: ResearchCard; readonly cards: ReadonlyMap<string, ResearchCard>; readonly send: EditorProps<unknown>["send"]; readonly onSelect: (id: string) => void }) {
  const link = (ids: readonly string[], label: string) =>
    ids.length === 0 ? null : (
      <div className={s.sect}>
        <h3 className={s.h}>{label}</h3>
        <div className={s.chips}>
          {ids.map((id) => (
            <Chip key={id} label={id} casing="lower" tone={c.wound?.missing.includes(id) === true ? "rose" : cards.get(id)?.scope === "in" ? "neutral" : "amber"} onPress={() => onSelect(id)} />
          ))}
        </div>
      </div>
    );
  return (
    <>
      <div className={s.bar}>
        <Chip label={c.kind} casing="lower" />
        {c.confidence !== undefined && <Chip label="confidence" value={c.confidence} casing="lower" tone={c.confidence === "low" ? "amber" : "neutral"} />}
        <Chip label={c.scope === "in" ? "in scope" : c.scope === "descoped" ? "descoped" : "not taken"} casing="lower" tone={c.scope === "in" ? "emerald" : "amber"} />
      </div>
      <div className={s.sect}>
        <p className={s.claim}>{c.title}</p>
        {c.detail !== undefined && <p className={s.work}>{c.detail}</p>}
        {c.falsifiableBy !== undefined && <p className={s.work}>{c.falsifiableBy}</p>}
        {c.required && c.requiredWhy !== undefined && <p className={s.risk}>{c.requiredWhy}</p>}
        {c.wound !== undefined && <p className={s.risk}>{`${c.wound.severity} — ${c.wound.missing.join(", ")} out`}</p>}
      </div>
      <dl className={s.kv}>
        <dt>id</dt>
        <dd>{c.id}</dd>
        {c.source !== undefined && (
          <>
            <dt>source</dt>
            <dd>{c.source}</dd>
          </>
        )}
        {c.asOf !== undefined && (
          <>
            <dt>as of</dt>
            <dd>{c.asOf}</dd>
          </>
        )}
      </dl>
      {link(c.dependsOn, "depends on")}
      {link(c.contests, "contests")}
      {link(c.qualifies, "qualifies")}
      <div className={s.acts}>
        {c.required && c.scope === "in" ? <Chip label="required" tone="violet" casing="lower" /> : <Button label={c.scope === "in" ? "descope" : "restore"} size="sm" tone={c.scope === "in" ? "rose" : "emerald"} shortcut={{ mode: "part.research", verb: "descope" }} onPress={() => send({ op: c.scope === "in" ? "descope" : "restore", cardId: c.id })} />}
        <Button label={c.liked ? "unlike" : "like"} size="sm" shortcut={{ mode: "part.research", verb: "like" }} onPress={() => send({ op: "like", cardId: c.id, on: !c.liked })} />
        <Button label={c.deepen ? "undeepen" : "deepen"} size="sm" shortcut={{ mode: "part.research", verb: "deepen" }} onPress={() => send({ op: "deepen", cardId: c.id, on: !c.deepen })} />
        <Button label="follow up" size="sm" tone="cyan" onPress={() => send({ op: "queue-follow-up", prompt: "", cardId: c.id })} />
      </div>
    </>
  );
}

function FollowUps({ d, send }: { readonly d: NotebookBoard; readonly send: EditorProps<unknown>["send"] }) {
  const [q, setQ] = useState("");
  const queue = (): void => {
    if (q.trim() === "") return;
    send({ op: "queue-follow-up", prompt: q.trim() });
    setQ("");
  };
  return (
    <div className={s.railSect} aria-label="follow-ups" role="region">
      <h3 className={s.h}>follow-ups</h3>
      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          queue();
        }}
      >
        <input className={cx(s.input, s.grow)} aria-label="question" value={q} onChange={(e) => setQ(e.currentTarget.value)} {...{ [FIELD_ATTR]: "follow-up" }} />
        <Button label="queue" size="sm" submit />
      </form>
      {d.followUps.map((f) => (
        <div key={f.id} className={s.fu} data-follow-up={f.id}>
          <div className={s.row}>
            <Chip label={f.status} casing="lower" tone={f.status === "returned" ? "emerald" : f.status === "unanswered" ? "rose" : "neutral"} />
            <span className={cx(s.mono, s.ell, s.grow)}>{f.cardId ?? "question"}</span>
            {f.status === "queued" && <Button label="drop" size="sm" onPress={() => send({ op: "drop-follow-up", id: f.id })} />}
          </div>
          <p className={cx(s.work, s.clamp2)}>{f.prompt}</p>
          {f.result !== undefined && (
            <>
              <Chip label={f.result.verdict} casing="lower" tone={f.result.verdict === "weakened" ? "amber" : "cyan"} />
              {f.result.effects.map((e) => (
                <div key={e.index} className={s.effect}>
                  <span>{`${e.kind} ${e.target}`}</span>
                  <Chip label={e.landing} casing="lower" tone={e.landing === "landed" ? "emerald" : e.landing === "pending" ? "amber" : "neutral"} />
                  {e.landing === "pending" && (
                    <>
                      <Button label="apply" size="sm" tone="emerald" onPress={() => send({ op: "decide-effect", followUpId: f.id, index: e.index, decision: "applied" })} />
                      <Button label="reject" size="sm" tone="rose" onPress={() => send({ op: "decide-effect", followUpId: f.id, index: e.index, decision: "rejected" })} />
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function NotebookEditor({ view, frame, send, busy, error, data: d }: EditorProps<PartView<"research">> & { readonly data: Data }) {
  const columns = useMemo(() => d.dimensions.map((dim) => ({ ...dim, cards: d.cards.filter((c) => c.dimension === dim.id) })), [d]);
  const byId = useMemo(() => new Map(d.cards.map((c) => [c.id, c])), [d]);
  // Untouched (undefined) follows the data - the first item, or what is picked - so a list that
  // lands after mount (an act's output) has a selection; null is the operator's Esc.
  const [chosen, setSel] = useState<string | null | undefined>(undefined);
  const sel = chosen === undefined ? d.cards[0]?.id ?? null : chosen;
  const [colSel, setColSel] = useState<string | null>(columns[0]?.id ?? null);
  const card = sel === null ? undefined : byId.get(sel);
  const col = card?.dimension ?? colSel;
  const inCol = columns.find((c) => c.id === col)?.cards ?? [];
  const select = (id: string): void => {
    setSel(id);
    const c = byId.get(id);
    if (c !== undefined) setColSel(c.dimension);
  };
  useKeys(
    "part.research",
    {
      item: ({ index }) => {
        const next = walk(inCol.map((c) => c.id), sel, index === 0 ? 1 : -1);
        if (next === null) return false;
        setSel(next);
      },
      column: ({ index }) => {
        const next = walk(columns.map((c) => c.id), col, index === 0 ? -1 : 1);
        if (next === null) return false;
        setColSel(next);
        setSel(columns.find((c) => c.id === next)?.cards[0]?.id ?? null);
      },
      descope: () => (card === undefined || busy ? false : send({ op: card.scope === "in" ? "descope" : "restore", cardId: card.id })),
      like: () => (card === undefined || busy ? false : send({ op: "like", cardId: card.id, on: !card.liked })),
      deepen: () => (card === undefined || busy ? false : send({ op: "deepen", cardId: card.id, on: !card.deepen })),
      open: () => {
        const el = document.querySelector<HTMLElement>("[data-region=inspector]");
        if (el === null) return false;
        el.focus();
      },
      deselect: () => setSel(null),
    },
    { facts: card === undefined ? [] : ["card", "item"] },
  );

  const t = d.tally;
  const canConfirm = d.source !== null && t.requiredGone.length === 0 && (!d.scope.confirmed || d.scope.moved > 0 || d.scope.orphan !== undefined);
  const acts = (
    <>
      {canConfirm && <Button label="confirm scope" size="sm" tone="emerald" tally={{ value: t.kept, of: t.total, label: "kept" }} onPress={() => send({ op: "confirm-scope" })} />}
      {frame.acts}
    </>
  );
  return (
    <PartWorkspace
      {...frame}
      acts={acts}
      mode="part.research"
      facts={card === undefined ? [] : ["card", "item"]}
      rail={{
        label: "dimensions",
        children: (
          <>
            <div className={s.railHead}>
              <h3 className={s.h}>dimensions</h3>
              <Tally value={t.kept} of={t.total} label="kept" />
            </div>
            <div className={s.dims}>
              {columns.map((c) => (
                <button key={c.id} type="button" className={s.dim} aria-current={c.id === col ? true : undefined} onClick={() => (setColSel(c.id), setSel(c.cards[0]?.id ?? null))}>
                  <span className={s.ell}>{c.label}</span>
                  <Tally value={c.kept} of={c.total} />
                </button>
              ))}
            </div>
            <FollowUps d={d} send={send} />
          </>
        ),
      }}
      primary={{
        label: "scope board",
        children: (
          <div className={s.primaryFill}>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            <div className={s.bar}>
              <div className={s.scopebar} aria-label="scope">
                <span className={s.tallyCell}>in scope <Tally value={t.kept} of={t.total} /></span>
                <span className={s.tallyCell}>descoped <Tally value={t.descoped} /></span>
                <span className={s.tallyCell}>not taken <Tally value={t.notTaken} /></span>
                <span className={s.tallyCell}>liked <Tally value={t.liked} /></span>
                <span className={s.tallyCell}>deepen <Tally value={t.deepen} /></span>
                <span className={s.tallyCell}>wounded <Tally value={t.wounded} /></span>
              </div>
              {d.scope.moved > 0 && <Chip label="moved" value={d.scope.moved} tone="amber" />}
              {d.scope.orphan !== undefined && <Chip label="orphaned scope" value={d.scope.orphan.decisions} tone="amber" />}
              {view.data.offers.length > 1 && <Button label="beats" size="sm" onPress={() => send({ op: "set-face", face: "beats" })} />}
            </div>
            {d.source === null ? (
              <div className={s.empty}>
                <Empty label="no notebook" />
              </div>
            ) : (
              <div className={s.board}>
                {columns.map((c) => (
                  <section key={c.id} className={s.col} aria-label={c.label} {...(c.id === col ? { "data-on": "" } : {})}>
                    <div className={s.colHead}>
                      <span className={s.ell}>{c.label}</span>
                      <Tally value={c.kept} of={c.total} label="kept" />
                    </div>
                    <div className={s.colBody}>
                      <RailList label={c.label} items={c.cards} idOf={(x) => x.id} selected={sel !== null && byId.get(sel)?.dimension === c.id ? sel : null} onSelect={select} row={(x) => <CardRow c={x} />} tall />
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        ),
      }}
      inspector={{
        label: "card",
        children: (
          <div tabIndex={-1} data-region="inspector">
            {card === undefined ? <Empty label="no card selected" /> : <Inspector c={card} cards={byId} send={send} onSelect={select} />}
          </div>
        ),
      }}
    />
  );
}
