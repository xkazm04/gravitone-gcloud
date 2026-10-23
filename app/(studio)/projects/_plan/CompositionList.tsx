// THE COMPOSITION LIST (prototype projects.js `renderList`, `ListRow`, `GROUPS`, projects.css
// `.pgroup`, `.prow`): every project in the prototype's groups - at the weir, blocked, running ·
// queued, plans, shipped - each row its recipe's mark, its title, a pip per part, its ETA (or its
// work time, for a plan), what needs the operator, and its cost. "All lanes" leads to Runs.
//
// Shared by Plan and Runs: the same list beside both, so moving between the two tabs keeps the
// operator's place (projects.html drew one `#plist` for both views).
import Link from "next/link";
import { useState } from "react";

import type { ProjectList, ProjectSummary } from "@gt/domain/produce";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { Field } from "@gt/ui/components/field/Field.tsx";
import { FloorGlyph } from "@gt/ui/components/floor/FloorGlyph.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import { costWords, when } from "@gt/ui/components/produce/produce.ts";
import { STATUS } from "@gt/ui/components/status/status.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import s from "./Plan.module.css";
import { GROUPS, matches, posterSrc, runtimeWords } from "./shelf.ts";

export { GROUPS, ordered } from "./shelf.ts";

/** The recipe's mark by its family (projects.js RECIPE_ICON: film video, album audio, explainer article). */
export function recipeMark(recipe: string): "video" | "audio" | "article" | "image" {
  if (recipe.startsWith("album") || recipe.startsWith("track")) return "audio";
  if (recipe.startsWith("explainer") || recipe.startsWith("article")) return "article";
  if (recipe.startsWith("style")) return "image";
  return "video";
}

export const planHref = (id: string): string => `/projects/${encodeURIComponent(id)}`;

function Row({ p, current, nowMs, href }: { readonly p: ProjectSummary; readonly current: boolean; readonly nowMs: number; readonly href: string }) {
  return (
    <a className={s.prow} href={href} aria-current={current ? "page" : undefined} data-project={p.id}>
      <span className={s.pic}>
        {p.poster === null ? (
          <FloorGlyph name={recipeMark(p.recipe)} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a kernel blob through /api/blob; nothing for next/image to optimise
          <img className={s.thumb} src={posterSrc(p.poster)} alt="" />
        )}
      </span>
      <span className={s.pt}>
        <span className={s.ttl}>{p.title}</span>
        <span className={s.meta}>
          <PipRow looks={p.pips.map((x) => STATUS.part[x].look)} label={`${p.pips.length} parts`} />
          {runtimeWords(p) !== null && (
            <span className={s.mono} data-runtime={p.runtimeS === null ? "unknown" : String(p.runtimeS)}>
              {runtimeWords(p)}
            </span>
          )}
          {p.etaAt !== null && <span className={s.mono}>{p.group === "plans" ? `~${when(p.etaAt, nowMs)}` : `eta ${when(p.etaAt, nowMs)}`}</span>}
        </span>
      </span>
      <span className={s.pr}>
        {p.failed > 0 ? <Chip label={String(p.failed)} tone="rose" name={`${p.failed} failed`} /> : p.gates > 0 ? <Chip label={String(p.gates)} tone="amber" name={`${p.gates} at the weir`} /> : null}
        <span className={s.usd}>{costWords({ usd: p.usd })}</span>
      </span>
    </a>
  );
}

export type CompositionListProps = {
  readonly list: ProjectList;
  readonly current: string | null;
  readonly nowMs: number;
  readonly onCompose: () => void;
  readonly floorRuns: number;
  /** Where a row leads: its Plan from Plan, its thread in Runs from Runs (projects.html kept the view). */
  readonly hrefOf?: (id: string) => string;
  /** Projects only v1 names (a publish slot's projectId): no plan here, a thread in Runs. */
  readonly others?: readonly { readonly id: string; readonly meta: string }[];
};

export function CompositionList({ list, current, nowMs, onCompose, floorRuns, hrefOf = planHref, others = [] }: CompositionListProps) {
  const [query, setQuery] = useState("");
  const shown = query.trim() === "" ? list.projects : list.projects.filter((p) => matches(p, query));
  return (
    <aside className={s.plist} data-component="CompositionList">
      <Panel title="Compositions" tally={{ value: list.projects.length }} toolbar={<Button size="sm" tone="cyan" label="+ Compose" onPress={onCompose} shortcut={{ mode: "projects", verb: "compose" }} />}>
        <div className={s.find}>
          <Field label="search projects" value={query} onChange={setQuery} placeholder="title · topic · script" keyfield="projects-search" />
        </div>
        <Link className={s.prow} href="/projects/runs" aria-current={current === null ? "page" : undefined}>
          <span className={s.pic}>
            <Glyph name="grid" />
          </span>
          <span className={s.pt}>
            <span className={s.ttl}>All lanes</span>
            <span className={s.meta}>
              <span className={s.mono}>{floorRuns} floor runs</span>
            </span>
          </span>
        </Link>
        {GROUPS.map((g) => {
          const rows = shown.filter((p) => p.group === g.id);
          if (rows.length === 0) return null;
          return (
            <div key={g.id} role="group" aria-label={g.label}>
              <div className={`${s.pgroup} ${s[g.tone] ?? ""}`}>
                {g.label} <Tally value={rows.length} />
              </div>
              {rows.map((p) => (
                <Row key={p.id} p={p} current={current === p.id} nowMs={nowMs} href={hrefOf(p.id)} />
              ))}
            </div>
          );
        })}
        {query.trim() !== "" && shown.length === 0 && <Empty label="no project matches" />}
        {others.length > 0 && (
          <div role="group" aria-label="v1">
            <div className={s.pgroup}>
              v1 <Tally value={others.length} />
            </div>
            {others.map((o) => (
              <a key={o.id} className={s.prow} href={`/projects/runs?project=${encodeURIComponent(o.id)}`} aria-current={current === o.id ? "page" : undefined}>
                <span className={s.pic}>
                  <Glyph name="doc" />
                </span>
                <span className={s.pt}>
                  <span className={s.ttl}>{o.id}</span>
                  <span className={s.meta}>
                    <span className={s.mono}>{o.meta}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </Panel>
    </aside>
  );
}
