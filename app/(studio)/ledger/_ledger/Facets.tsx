"use client";

// The facet rail (ledger.js `renderFacets`): type by group with its types beneath, lane,
// project, source - OR within a section, AND across (search: faceting-and-filters). Every
// count is the kernel's with that section's own filter left out, so a section always says
// what its next click would find.
//
// Values come from the counts, and a value the filter holds but the counts no longer list
// (zero under the other sections) is drawn anyway at 0, so a pressed filter can always be
// unpressed - an option list built from the matching rows would hide it. Project has no
// kernel facet yet (events-count.ts counts seven columns, project_id is not one): its
// section appears only while a project filter is set, so that filter is never invisible.

import type { FacetCount } from "@gt/kernel/events-count";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { FacetRow } from "@gt/ui/components/facet/FacetRow.tsx";
import { Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";

import type { LedgerFilter } from "./filter.ts";
import type { Facets as Counts } from "./read.ts";
import { toneOf } from "./vocab.ts";
import s from "./ledger.module.css";

type Key = "type" | "lane" | "project" | "src";

/** A facet's values with the filter's own values added at 0, largest first, then by name. */
function valuesOf(c: FacetCount, held: readonly string[]): { value: string; n: number }[] {
  const out = new Map(c.values.map((v) => [v.value, v.n]));
  for (const h of held) if (!out.has(h)) out.set(h, 0);
  return [...out].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

const max = (xs: readonly { n: number }[]): number => Math.max(1, ...xs.map((x) => x.n));

export function Facets({ filter: f, facets: c, onApply }: { readonly filter: LedgerFilter; readonly facets: Counts; readonly onApply: (next: Partial<LedgerFilter>) => void }) {
  const toggle = (key: Key, value: string, on: boolean): void => {
    const now = f[key];
    onApply({ [key]: on ? [...now, value] : now.filter((x) => x !== value) });
  };
  const head = (text: string, key: Key) => (
    <div className={s.secHead}>
      <CapsHeading text={text} />
      {f[key].length > 0 && (
        <button type="button" className={s.clear} onClick={() => onApply({ [key]: [] })}>
          clear
        </button>
      )}
    </div>
  );
  // A type value is held either as a bare group (`verdict`) or a full type (`verdict.keep`).
  const groups = valuesOf(c.typeGroup, f.type.filter((t) => !t.includes(".")));
  const types = valuesOf(c.type, f.type.filter((t) => t.includes(".")));
  const gmax = max(groups);
  const lanes = valuesOf(c.lane, f.lane);
  const sources = valuesOf(c.source, f.src);
  return (
    <aside className={s.facets} id="lg-facets" aria-label="facets">
      <Panel title="facets" {...(f.type.length + f.lane.length + f.project.length + f.src.length > 0 ? { tally: { value: f.type.length + f.lane.length + f.project.length + f.src.length, label: "on" } } : {})}>
      <div className={s.sec}>
        {head("type", "type")}
        {groups.map((g) => {
          const subs = types.filter((t) => t.value === g.value || t.value.startsWith(`${g.value}.`));
          return (
            <div key={g.value}>
              <FacetRow mark="rail" label={g.value} count={g.n} share={g.n / gmax} pressed={f.type.includes(g.value)} onToggle={(on) => toggle("type", g.value, on)} />
              {subs.length > 1 &&
                subs.map((t) => (
                  <FacetRow key={t.value} mark="rail" nested={{ tone: toneOf(t.value) }} label={t.value} count={t.n} pressed={f.type.includes(t.value)} onToggle={(on) => toggle("type", t.value, on)} />
                ))}
            </div>
          );
        })}
      </div>
      {lanes.length > 0 && (
        <div className={s.sec}>
          {head("lane · resource", "lane")}
          {lanes.map((l) => (
            <FacetRow key={l.value} mark="rail" label={l.value} count={l.n} share={l.n / max(lanes)} pressed={f.lane.includes(l.value)} onToggle={(on) => toggle("lane", l.value, on)} />
          ))}
        </div>
      )}
      {f.project.length > 0 && (
        <div className={s.sec}>
          {head("project", "project")}
          {f.project.map((pid) => (
            <FacetRow key={pid} mark="rail" label={pid} count={f.project.length === 1 ? c.total : 0} pressed onToggle={(on) => toggle("project", pid, on)} />
          ))}
        </div>
      )}
      <div className={s.sec}>
        {head("src", "src")}
        {sources.map((v) => (
          <FacetRow key={v.value} mark="rail" label={v.value} count={v.n} share={v.n / max(sources)} pressed={f.src.includes(v.value)} onToggle={(on) => toggle("src", v.value, on)} />
        ))}
      </div>
      <div className={s.keys}>
        <Keycaps mode="ledger" label="ledger keys" />
      </div>
      </Panel>
    </aside>
  );
}
