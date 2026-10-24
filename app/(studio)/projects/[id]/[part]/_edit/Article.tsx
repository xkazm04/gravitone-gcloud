"use client";

// EXPLAINER · ARTICLE (STEPS-DESIGN §2 "explainer parts"): the article this explainer narrates -
// RAIL: where it came from (a finished post adopted, or this part's run and its steps); PRIMARY:
// the article's sections as written; the article gate's Board packet is where it is approved (the
// part tabs' ◆). The words are never edited here. The one edit is ADOPTING a finished post - an
// approved article run or a registry publication - which the server reads and cuts into sections
// (op `article-adopt`, undone like any op); the list of posts comes with the view (`adoptable`),
// because only the server can read the disk they live on.
import { useState } from "react";

import type { AdoptableView, ArticleData, PartView } from "@gt/domain/partView";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps, Send } from "./PartEditor.tsx";
import s from "./Cut.module.css";

const keyOf = (p: Pick<AdoptableView, "source" | "id">): string => `${p.source}:${p.id}`;

export function ArticleEditor({ frame, error, view, send, busy }: EditorProps<PartView<"article">>) {
  const d: ArticleData = view.data;
  const [sel, setSel] = useState<string | null>(null);
  useKeys("part.article", {
    item: ({ index }) => {
      const next = walk(d.sections.map((x) => x.id), sel, index === 0 ? 1 : -1);
      if (next === null) return false;
      setSel(next);
      document.querySelector(`[data-section="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
    },
  });
  const e = d.engine;
  return (
    <PartWorkspace
      {...frame}
      mode="part.article"
      rail={{
        label: "source",
        children: (
          <div className={s.railHead}>
            <div className={cx(s.sect, s.grow)}>
              <Adopt d={d} send={send} busy={busy} />
              {d.from !== undefined && (
                // A slug outruns the rail: the chip carries the source, the id beside it is cut with an ellipsis.
                <div className={s.row} aria-label={`adopted from ${d.from.source} ${d.from.id}`}>
                  <Chip label={d.from.source} tone="cyan" casing="lower" />
                  <span className={cx(s.mono, s.ell, s.grow)} title={d.from.id}>
                    {d.from.id}
                  </span>
                </div>
              )}
              {d.steps.length === 0 && d.from === undefined && <Empty label="no run yet" />}
              {d.steps.map((x) => (
                <div key={x.name} className={s.row}>
                  <span className={s.grow}>{x.name}</span>
                  <Chip label={x.state} tone={x.state === "done" ? "emerald" : x.state === "failed" ? "rose" : "amber"} casing="lower" />
                </div>
              ))}
              {e !== undefined && <Provenance model={e.model} vendor={e.provider} cost={e.usd === null ? (e.mode === "dry" ? "dry" : "unpriced") : `$${e.usd.toFixed(2)}`} />}
            </div>
          </div>
        ),
      }}
      primary={{
        label: "article",
        children: (
          <>
            {error !== null && (
              <div className={s.err}>
                <ErrorLine message={error} live />
              </div>
            )}
            {d.title === null ? (
              <Empty label="no article written" />
            ) : (
              <article aria-label={d.title}>
                <div className={s.bar}>
                  <h2 className={s.sectionHead}>{d.title}</h2>
                  <span className={s.mono}>{`${d.sections.length} sections · ${d.words} words`}</span>
                </div>
                {d.sections.map((x) => (
                  <section key={x.id} className={cx(s.sectionCard)} data-section={x.id} {...(x.id === sel ? { "data-on": "" } : {})}>
                    <h3 className={s.h}>{`${x.heading} · ${x.words} words`}</h3>
                    <p className={s.work}>{x.lead}</p>
                  </section>
                ))}
              </article>
            )}
          </>
        ),
      }}
      inspector={null}
    />
  );
}

/** The finished posts this machine holds, and the adopt that makes one the article. */
function Adopt({ d, send, busy }: { readonly d: ArticleData; readonly send: Send; readonly busy: boolean }) {
  const current = d.from === undefined ? null : keyOf(d.from);
  const [pick, setPick] = useState<string>(() => (current !== null && d.adoptable.some((p) => keyOf(p) === current) ? current : d.adoptable[0] === undefined ? "" : keyOf(d.adoptable[0])));
  if (d.adoptable.length === 0) return <Empty label="no finished posts" />;
  const chosen = d.adoptable.find((p) => keyOf(p) === pick) ?? d.adoptable[0];
  const options = d.adoptable.map((p) => ({ value: keyOf(p), label: `${p.title} · ${p.source} · ${p.sections} sections` }));
  return (
    <>
      <Select label="finished post" options={options} value={chosen === undefined ? "" : keyOf(chosen)} onChange={setPick} />
      <div className={s.row}>
        <Button
          label="adopt"
          size="sm"
          tone="cyan"
          disabled={busy || chosen === undefined}
          onPress={() => {
            if (chosen !== undefined) send({ op: "article-adopt", source: chosen.source, id: chosen.id });
          }}
        />
      </div>
    </>
  );
}
