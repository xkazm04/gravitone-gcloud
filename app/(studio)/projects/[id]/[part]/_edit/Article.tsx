"use client";

// EXPLAINER · ARTICLE (STEPS-DESIGN §2 "explainer parts"): the article producer's run read back -
// RAIL: its steps; PRIMARY: the article's sections as written; the article gate's Board packet is
// where it is approved (the part tabs' ◆). Nothing in the article is edited here: the run writes
// it and the packet judges it.
import { useState } from "react";

import type { ArticleData, PartView } from "@gt/domain/partView";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { PartWorkspace } from "@gt/ui/components/part/PartWorkspace.tsx";
import { walk } from "@gt/ui/components/part/part.ts";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { EditorProps } from "./PartEditor.tsx";
import s from "./Cut.module.css";

export function ArticleEditor({ frame, error, view }: EditorProps<PartView<"article">>) {
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
        label: "run",
        children: (
          <div className={s.railHead}>
            {d.steps.length === 0 ? (
              <Empty label="no run yet" />
            ) : (
              <div className={s.sect}>
                {d.steps.map((x) => (
                  <div key={x.name} className={s.row}>
                    <span className={s.grow}>{x.name}</span>
                    <Chip label={x.state} tone={x.state === "done" ? "emerald" : x.state === "failed" ? "rose" : "amber"} casing="lower" />
                  </div>
                ))}
                {e !== undefined && <Provenance model={e.model} vendor={e.provider} cost={e.usd === null ? (e.mode === "dry" ? "dry" : "unpriced") : `$${e.usd.toFixed(2)}`} />}
              </div>
            )}
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
                  <span className={s.mono}>{`${d.words} words`}</span>
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
