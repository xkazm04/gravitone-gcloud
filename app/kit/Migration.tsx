// THE MIGRATION MAP, rendered from migrationMap.ts: modules down, the kit parts each
// will use, the gaps each will hit. Then the gaps, ranked by how many modules hit
// them — the order the kit should grow in.

import { DataTable, Ghost, Kicker, Stats } from "@/components/kit";

import { GAPS, MODULES } from "./migrationMap";

export function Migration() {
  const hits = (id: string) => MODULES.filter((m) => (m.missing as readonly string[]).includes(id));
  const ranked = [...GAPS].sort((a, b) => hits(b.id).length - hits(a.id).length);
  return (
    <div className="kr-page">
      <section className="kr-section" aria-labelledby="kr-mods">
        <Kicker>Modules</Kicker>
        <h2 id="kr-mods">What each will need</h2>
        <Stats
          items={[
            { n: MODULES.length, label: "modules" },
            { n: MODULES.reduce((n, m) => n + m.files, 0), label: "source files" },
            { n: GAPS.length, label: "gaps" },
          ]}
        />
        <DataTable
          head={["Module", "Path", "Files", "Kit parts", "Missing", "Evidence"]}
          rows={MODULES.map((m) => [
            m.module,
            <span key="p" className="kr-path">{m.path}</span>,
            <span key="f" className="k-num">{m.files}</span>,
            <span key="n" className="kr-parts">
              {m.needs.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>,
            <span key="g" className="kr-gaps">
              {m.missing.map((g) => (
                <span key={g} className="kr-gap">{g}</span>
              ))}
            </span>,
            <span key="e" className="k-muted">{m.evidence}</span>,
          ])}
        />
      </section>
      <section className="kr-section" aria-labelledby="kr-gaps">
        <Kicker>Gaps</Kicker>
        <h2 id="kr-gaps">What the kit does not have</h2>
        {ranked.length === 0 ? (
          <Ghost shape="row" label="no gaps" />
        ) : (
        <DataTable
          head={["Gap", "Missing part", "Shape", "First hit", "Modules"]}
          rows={ranked.map((g) => [
            <span key="i" className="kr-gap">{g.id}</span>,
            g.name,
            g.shape,
            <span key="e" className="k-muted">{g.evidence}</span>,
            <span key="m" className="k-num">{hits(g.id).length}</span>,
          ])}
        />
        )}
      </section>
    </div>
  );
}
