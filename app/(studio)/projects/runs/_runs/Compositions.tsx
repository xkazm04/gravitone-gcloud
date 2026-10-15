// The composition list beside the day-line (projects.js `renderList`, `.prow`). A v1 project
// lives in the browser's IndexedDB (lib/projects.ts), out of the server's reach, so the only
// projects Runs can name are the ones a server-side v1 record names itself (a publish slot's
// `projectId`, a turn's). "All lanes" is always first; a project row lights its thread.
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";

import s from "./Runs.module.css";

type Row = { readonly id: string; readonly jobs: number; readonly slots: number };

export function Compositions({ projects, current, floorRuns, resources, onPick }: { readonly projects: readonly Row[]; readonly current: string | null; readonly floorRuns: number; readonly resources: number; readonly onPick: (id: string | null) => void }) {
  return (
    <aside className={s.plist}>
      <Panel title="Compositions" tally={{ value: projects.length }}>
        <button type="button" className={s.prow} aria-current={current === null ? "page" : undefined} onClick={() => onPick(null)}>
          <span className={s.pic}>
            <Glyph name="grid" />
          </span>
          <span className={s.pt}>
            <span className={s.ttl}>All lanes</span>
            <span className={s.meta}>
              {resources} resources · {floorRuns} floor runs
            </span>
          </span>
        </button>
        {projects.map((p) => (
          <button key={p.id} type="button" className={s.prow} aria-current={current === p.id ? "page" : undefined} onClick={() => onPick(p.id)}>
            <span className={s.pic}>
              <Glyph name="doc" />
            </span>
            <span className={s.pt}>
              <span className={s.ttl}>{p.id}</span>
              <span className={s.meta}>
                {p.jobs} jobs · {p.slots} slots
              </span>
            </span>
          </button>
        ))}
      </Panel>
    </aside>
  );
}
