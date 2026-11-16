"use client";

// /scout/ventures (spark concept-casting-stages S6): every venture, and for the one picked its channel card, the productions it
// holds and the lessons the operator accepted from them. The operator can also start one with no video behind it yet.

import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts, type Fact } from "@gt/ui/components/facts/Facts.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import { STAGE_PILL } from "../../productions/_productions/Sections.tsx";
import type { VentureCreateInput, VentureEntry, VenturesPort, VenturesView } from "../_port/contract.ts";
import s from "./ventures.module.css";

const GROUND_WORDS: Readonly<Record<VentureEntry["ground"], string>> = { night: "a night's proposal", channel: "imported channel", proven: "a proven video", operator: "the operator" };

function channelFacts(c: NonNullable<VentureEntry["channel"]>): Fact[] {
  return [
    { term: "group", value: c.group },
    { term: "audience", value: c.audience },
    { term: "promise", value: c.promise },
    { term: "gap", value: c.gap },
    { term: "edge", value: c.edge },
    { term: "medium", value: c.medium },
    { term: "look", value: c.look ?? "no look set on the channel" },
  ];
}

function frameFacts(v: VentureEntry): Fact[] {
  return [
    { term: "tone", value: v.frame.tone },
    { term: "audience", value: v.frame.audience },
    { term: "format", value: v.frame.format },
    { term: "look", value: v.frame.look },
  ];
}

function VentureDetail({ v }: { readonly v: VentureEntry }) {
  return (
    <div className={s.detail} data-venture={v.id}>
      <div className={s.head}>
        <h2 className={s.title}>{v.name}</h2>
        <Chip label="ground" value={GROUND_WORDS[v.ground]} casing="lower" name={`born on ${GROUND_WORDS[v.ground]}`} />
        {v.channelId !== undefined && <Chip label="channel" value={v.channelId} tone="cyan" casing="lower" />}
        {v.retiredAt !== undefined && <Chip label="retired" ghost casing="lower" name={`retired ${v.retiredAt.slice(0, 10)}`} />}
      </div>
      <section className={s.block} aria-label="channel card">
        <CapsHeading text={v.channel === undefined && v.channelProblem === undefined ? "frame" : "channel card"} variant="section" />
        {v.channelProblem !== undefined && <ErrorLine message={v.channelProblem} />}
        {v.channel !== undefined ? <Facts facts={channelFacts(v.channel)} /> : <Facts facts={frameFacts(v)} />}
        {v.channel !== undefined && <span className={s.meta}>read live from channel file {v.channel.id}; nights still read that file</span>}
      </section>
      <section className={s.block} aria-label="productions">
        <CapsHeading text="productions" variant="section" tally={{ value: v.productions.length, label: v.productions.length === 1 ? "production" : "productions" }} />
        {v.productions.length === 0 ? (
          <Empty label="no productions in this venture yet" />
        ) : (
          <ul className={s.rows}>
            {v.productions.map((p) => (
              <li key={p.id} className={s.row} data-production={p.id}>
                <EntryPill entry={STAGE_PILL[p.stage]} />
                <a className={s.itemName} href={`/scout/productions?from=${encodeURIComponent(p.id)}`}>
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={s.block} aria-label="accepted lessons">
        <CapsHeading text="accepted lessons" variant="section" tally={{ value: v.lessons.length, label: v.lessons.length === 1 ? "lesson" : "lessons" }} />
        {v.lessons.length === 0 ? (
          <Empty label="no lessons accepted yet" />
        ) : (
          <div className={s.rows}>
            {v.lessons.map((l) => (
              <div key={l.id} className={s.lesson} data-lesson={l.dimension}>
                <Chip label={l.dimension === "art-style" ? "art style" : l.dimension} tone={l.dimension === "beats" ? "cyan" : l.dimension === "art-style" ? "violet" : "amber"} />
                <p className={s.words}>{l.text}</p>
                <span className={s.meta}>
                  {l.production} · drawn from {l.drawnFrom} {l.drawnFrom === 1 ? "piece" : "pieces"} of its record
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const EMPTY: VentureCreateInput = { name: "", tone: "", audience: "", format: "", look: "" };

function CreateVenture({ port, onView }: { readonly port: VenturesPort; readonly onView: (v: VenturesView, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const complete = Object.values(w).every((x) => x.trim() !== "");
  const create = (): void => {
    setBusy(true);
    setError(undefined);
    void port.create({ name: w.name.trim(), tone: w.tone.trim(), audience: w.audience.trim(), format: w.format.trim(), look: w.look.trim() }).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      onView(r.value, w.name.trim());
      setW(EMPTY);
      setOpen(false);
    });
  };
  return (
    <Fold title="Start a venture" open={open} onToggle={setOpen} level={3}>
      <div className={s.block}>
        {error !== undefined && <ErrorLine message={error} live />}
        <Field label="name" value={w.name} onChange={(name) => setW({ ...w, name })} placeholder="future channel" />
        <Field label="tone" value={w.tone} onChange={(tone) => setW({ ...w, tone })} placeholder="deadpan, dark" />
        <Field label="audience" value={w.audience} onChange={(audience) => setW({ ...w, audience })} placeholder="who it is for" />
        <Field label="format" value={w.format} onChange={(format) => setW({ ...w, format })} placeholder="a 30 s vertical Short" />
        <Field label="look" value={w.look} onChange={(look) => setW({ ...w, look })} placeholder="the look in words" />
        <Button label="Start a venture" size="sm" tone="cyan" disabled={busy || !complete} onPress={create} />
      </div>
    </Fold>
  );
}

export function Ventures({ view: initial, port, from }: { readonly view: VenturesView; readonly port: VenturesPort; readonly from?: string }) {
  const [view, setView] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | undefined>(from ?? initial.ventures[0]?.id);
  const selected = view.ventures.find((v) => v.id === selectedId) ?? view.ventures[0];
  const onCreated = (v: VenturesView, name: string): void => {
    setView(v);
    setSelectedId(v.ventures.find((x) => x.name === name)?.id);
  };
  if (view.ventures.length === 0) {
    return (
      <div className={s.empty} data-state="empty">
        <Empty label="no ventures yet" />
        <CreateVenture port={port} onView={onCreated} />
      </div>
    );
  }
  return (
    <div className={s.page}>
      <div className={s.list}>
        <CapsHeading text="ventures" variant="section" tally={{ value: view.ventures.length, label: "ventures" }} />
        {view.ventures.map((v) => (
          <button key={v.id} type="button" className={s.item} aria-pressed={v.id === selected?.id} onClick={() => setSelectedId(v.id)}>
            <span className={s.itemName}>{v.name}</span>
            <span className={s.meta}>
              {v.channelId === undefined ? GROUND_WORDS[v.ground] : `channel ${v.channelId}`} · {v.productions.length} {v.productions.length === 1 ? "production" : "productions"}
            </span>
          </button>
        ))}
        <CreateVenture port={port} onView={onCreated} />
      </div>
      {selected !== undefined && <VentureDetail v={selected} />}
    </div>
  );
}
