"use client";

// THE IMPORT SCREEN (Phase 4 wave D, L42) - a receipt, then a confirm (COMMON decision 3; registry
// import-normalization/review-before-commit: "inspect -> select -> resolve -> confirm", nothing
// persists before the confirm, unimportable entities stay visible with their reasons).
//
// THE FIRST DOOR IS THIS BROWSER. The page is the same origin as v1's studio, so its IndexedDB
// (`gravitone-studio`) is readable here with no export step: every account in it is read through
// v1's own `exportAccount` and checked through v1's own `inspectArchive` - a truncated or corrupt
// database export is refused with v1's code before a byte is uploaded - and each archive goes to
// POST /api/import for the preview. THE SECOND DOOR is a `.gravitone` file from another machine.
// The confirm sends the same bytes with the preview's token; a stale token answers the fresh
// preview, which replaces the old one on screen.
//
// THE SHELF COMES TOO (Phase 5, L55): the account's themes land as Styles and its shelf assets as
// Library items, counted beside the projects; one the store refuses is listed with the door's
// words. v1's rows are never written: this import is their last reader.

import { useEffect, useRef, useState } from "react";
import { unknown } from "zod/mini";

import { parseJsonAt } from "@gt/domain/door";
import { errorMessage } from "@gt/domain/errors";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import type { Tone } from "@gt/ui/components/chip/tone.ts";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { ImportOutcome, ShelfOutcome } from "@/lib/import/commit";
import type { ProjectPreview } from "@/lib/import/project";
import type { Preview } from "@/lib/import/serve";
import type { ItemPreview, ThemePreview } from "@/lib/import/shelf";
import { ArchiveRefused, exportAccount, inspectArchive } from "@/lib/studioArchive";
import { BY_UID, PROJECTS_STORE, openDb } from "@/lib/studioDb";

import s from "./Import.module.css";

type Source = { readonly name: string; readonly bytes: Blob; readonly preview: Preview };
type Phase =
  | { readonly kind: "reading" }
  | { readonly kind: "refused"; readonly name: string; readonly code: string; readonly message: string }
  | { readonly kind: "preview"; readonly sources: readonly Source[] }
  | { readonly kind: "committing"; readonly sources: readonly Source[] }
  | { readonly kind: "done"; readonly outcomes: readonly ImportOutcome[]; readonly styles: readonly ShelfOutcome[]; readonly items: readonly ShelfOutcome[] }
  | { readonly kind: "error"; readonly message: string };

type Envelope = { readonly error?: string; readonly code?: string; readonly detail?: string };

/** Every account this browser's v1 database holds projects for (a keys-only walk of `by-uid`). */
async function accounts(): Promise<string[]> {
  const db = await openDb();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const out: string[] = [];
      const req = db.transaction(PROJECTS_STORE, "readonly").objectStore(PROJECTS_STORE).index(BY_UID).openKeyCursor(null, "nextunique");
      req.onsuccess = () => {
        const c = req.result;
        if (c === null) return resolve(out);
        out.push(String(c.key));
        c.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("read failed"));
    });
  } finally {
    db.close();
  }
}

/** The route's answer; a network failure is answered as a 503 in the route's own envelope. */
async function post(path: string, body: Blob): Promise<{ readonly status: number; readonly json: unknown }> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", body, headers: { "content-type": "application/octet-stream" } });
  } catch (e) {
    return { status: 503, json: { error: `the import could not be reached: ${errorMessage(e)}`, code: "unavailable" } };
  }
  const text = await r.text();
  const parsed = parseJsonAt("import answer", unknown(), text);
  return { status: r.status, json: parsed.ok ? parsed.value : { error: text.slice(0, 300) || `the import answered ${r.status}`, code: "internal" } };
}

const envelopeOf = (x: unknown): Envelope => (typeof x === "object" && x !== null ? (x as Envelope) : {});
const mb = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const OUTCOME_TONE: Readonly<Record<ProjectPreview["outcome"] | ImportOutcome["outcome"], Tone>> = { import: "cyan", imported: "emerald", skip: "neutral", skipped: "neutral", refuse: "rose", refused: "rose" };

/** A source's preview, or the refusal that stops it - v1's verdict first, then the server's. */
async function previewOf(name: string, bytes: Blob): Promise<Source | Extract<Phase, { kind: "refused" | "error" }>> {
  try {
    // A file v1 would refuse never leaves the browser.
    await inspectArchive(bytes);
  } catch (e) {
    return e instanceof ArchiveRefused ? { kind: "refused", name, code: e.code, message: e.message } : { kind: "error", message: errorMessage(e) };
  }
  const r = await post("/api/import?act=preview", bytes);
  if (r.status === 200) return { name, bytes, preview: r.json as Preview };
  const e = envelopeOf(r.json);
  return { kind: "refused", name, code: e.detail ?? e.code ?? String(r.status), message: e.error ?? `the import answered ${r.status}` };
}

const isSource = (x: Source | Phase): x is Source => "preview" in x && !("kind" in x);

/** The first door: every v1 account in this browser, exported and previewed one by one. */
async function readThisBrowser(): Promise<Phase> {
  let uids: string[];
  try {
    uids = await accounts();
  } catch (e) {
    return { kind: "error", message: errorMessage(e) };
  }
  const sources: Source[] = [];
  for (const uid of uids) {
    let bytes: Blob;
    try {
      bytes = await new Response(exportAccount(uid)).blob();
    } catch (e) {
      return { kind: "error", message: errorMessage(e) };
    }
    const one = await previewOf(uid, bytes);
    if (!isSource(one)) return one;
    sources.push(one);
  }
  return { kind: "preview", sources };
}

export function ImportView() {
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void readThisBrowser().then((next) => {
      if (live) setPhase(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const readFile = async (f: File) => {
    setPhase({ kind: "reading" });
    const one = await previewOf(f.name, f);
    setPhase(isSource(one) ? { kind: "preview", sources: [one] } : one);
  };

  const confirm = async (sources: readonly Source[]) => {
    setPhase({ kind: "committing", sources });
    const outcomes: ImportOutcome[] = [];
    const styles: ShelfOutcome[] = [];
    const items: ShelfOutcome[] = [];
    const fresh: Source[] = [];
    for (const src of sources) {
      const r = await post(`/api/import?act=commit&token=${src.preview.token}`, src.bytes);
      if (r.status === 409) {
        const f = (r.json as { fresh?: { fresh: readonly ProjectPreview[]; themes: readonly ThemePreview[]; items: readonly ItemPreview[]; token: string } }).fresh;
        if (f !== undefined) fresh.push({ ...src, preview: { ...src.preview, projects: f.fresh, themes: f.themes, items: f.items, token: f.token } });
        continue;
      }
      if (r.status !== 200) return setPhase({ kind: "error", message: envelopeOf(r.json).error ?? `the import answered ${r.status}` });
      const done = r.json as { outcomes: readonly ImportOutcome[]; styles: readonly ShelfOutcome[]; items: readonly ShelfOutcome[] };
      outcomes.push(...done.outcomes);
      styles.push(...done.styles);
      items.push(...done.items);
    }
    setPhase(fresh.length > 0 ? { kind: "preview", sources: fresh } : { kind: "done", outcomes, styles, items });
  };

  const sources = phase.kind === "preview" || phase.kind === "committing" ? phase.sources : [];
  const going = sources.flatMap((x) => x.preview.projects).filter((p) => p.outcome === "import");
  const bytes = going.reduce((n, p) => n + p.bytes, 0);
  const shelfGoing = sources.reduce((n, x) => n + x.preview.themes.filter((t) => t.outcome === "import").length + x.preview.items.filter((i) => i.outcome === "import").length, 0);

  return (
    <main className={s.page} data-component="Import" data-phase={phase.kind}>
      <header className={s.top}>
        <h1 className={s.title}>Import</h1>
        <div className={s.doors}>
          <Button label="This browser" size="sm" onPress={() => {
              setPhase({ kind: "reading" });
              void readThisBrowser().then(setPhase);
            }} disabled={phase.kind === "reading" || phase.kind === "committing"} />
          <Button label="Open a .gravitone" size="sm" onPress={() => file.current?.click()} disabled={phase.kind === "committing"} />
          <input
            ref={file}
            className={s.file}
            type="file"
            accept=".gravitone,application/gzip,application/x-ndjson"
            aria-label="archive file"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f !== undefined) void readFile(f);
            }}
          />
        </div>
      </header>

      {phase.kind === "reading" && <p className={s.quiet} role="status">reading…</p>}
      {phase.kind === "refused" && (
        <section className={s.refused} aria-label="refused">
          <Chip label="refused" value={phase.code} tone="rose" />
          <span className={s.mono}>{phase.name}</span>
          <ErrorLine message={phase.message} live />
        </section>
      )}
      {phase.kind === "error" && <ErrorLine message={phase.message} live />}
      {phase.kind === "preview" && sources.length === 0 && <p className={s.quiet}>no v1 projects in this browser</p>}

      {sources.length > 0 && (
        <>
          {sources.map((src) => (
            <section key={src.name} className={s.source} aria-label={src.name}>
              <h2 className={s.sourceHead}>
                <span className={s.mono}>{src.name}</span>
                <Tally value={src.preview.projects.length} label="projects" />
                <Tally value={mb(src.preview.bytes)} label="archive" />
              </h2>
              {src.preview.projects.length === 0 && <p className={s.quiet}>no projects</p>}
              <ul className={s.rows}>
                {src.preview.projects.map((p) => (
                  <ProjectRow key={p.v1Id} p={p} />
                ))}
              </ul>
              {src.preview.losses.length > 0 && <Losses losses={src.preview.losses} />}
              <Shelf themes={src.preview.themes} items={src.preview.items} />
            </section>
          ))}
          <footer className={s.confirm}>
            <Tally value={going.length} label="to import" />
            <Tally value={going.reduce((n, p) => n + p.held, 0)} label="records" />
            {bytes > 0 && <Tally value={mb(bytes)} label="blobs" />}
            {shelfGoing > 0 && <Tally value={shelfGoing} label="shelf" />}
            <Button label={phase.kind === "committing" ? "Importing…" : `Import ${going.length + shelfGoing}`} tone="emerald" disabled={going.length + shelfGoing === 0 || phase.kind === "committing"} onPress={() => void confirm(sources)} />
          </footer>
        </>
      )}

      {phase.kind === "done" && (phase.styles.length > 0 || phase.items.length > 0) && (
        <section className={s.tallies} aria-label="shelf outcomes">
          <Tally value={phase.styles.filter((x) => x.outcome === "imported").length} of={phase.styles.length} label="styles" />
          <Tally value={phase.items.filter((x) => x.outcome === "imported").length} of={phase.items.length} label="library items" />
          <Button label="Library" size="sm" href="/library" glyphAfter="chevR" />
        </section>
      )}
      {phase.kind === "done" && (
        <ul className={s.rows} aria-label="outcomes">
          {phase.outcomes.map((o) => (
            <li key={o.v1Id} className={s.row} data-outcome={o.outcome}>
              <span className={s.name}>{o.title}</span>
              <Chip label={o.outcome} tone={OUTCOME_TONE[o.outcome]} />
              {o.reason !== undefined && <span className={s.reason}>{o.reason}</span>}
              {o.outcome !== "refused" && <Button label="Plan" size="sm" href={`/projects/${encodeURIComponent(o.id)}`} glyphAfter="chevR" />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ProjectRow({ p }: { readonly p: ProjectPreview }) {
  return (
    <li className={s.row} data-outcome={p.outcome}>
      <span className={s.name}>{p.title}</span>
      <Chip label={p.recipe || "—"} casing="lower" />
      <Chip label={p.outcome} tone={OUTCOME_TONE[p.outcome]} />
      {p.outcome === "import" ? (
        <span className={s.tallies}>
          <Tally value={p.parts} label="parts" />
          <Tally value={p.done.length} of={p.parts} label="done" />
          {p.ratified.length > 0 && <Tally value={p.ratified.length} label="signed off" />}
          <Tally value={p.held} label="records" />
          {p.blobs > 0 && <Tally value={mb(p.bytes)} label={`${p.blobs} blobs`} />}
          {!p.launched && <Chip label="draft" ghost />}
        </span>
      ) : (
        <span className={s.reason}>{p.reason}</span>
      )}
      {p.outcome === "import" && p.losses.length > 0 && <Losses losses={p.losses} />}
    </li>
  );
}

/** The account's themes and shelf assets: counts, and each one the store refuses with its reason. */
function Shelf({ themes, items }: { readonly themes: readonly ThemePreview[]; readonly items: readonly ItemPreview[] }) {
  if (themes.length + items.length === 0) return null;
  const going = (xs: readonly { readonly outcome: string }[]) => xs.filter((x) => x.outcome === "import").length;
  const named = themes.filter((t) => t.named && t.outcome === "import").length;
  const refused = [...themes.map((t) => ({ key: `t:${t.v1Id}`, name: t.name, reason: t.reason, outcome: t.outcome })), ...items.map((i) => ({ key: `a:${i.v1Id}`, name: i.title, reason: i.reason, outcome: i.outcome }))].filter((x) => x.outcome === "refuse");
  return (
    <section aria-label="shelf">
      <span className={s.tallies}>
        <Tally value={going(themes)} of={themes.length} label="styles" />
        {named > 0 && <Tally value={named} label="named" />}
        <Tally value={going(items)} of={items.length} label="library items" />
      </span>
      {refused.length > 0 && (
        <ul className={s.losses} aria-label="refused">
          {refused.map((r) => (
            <li key={r.key} className={s.loss} data-shelf="refuse">
              <span className={s.mono}>{r.name}</span>
              <Chip label="refused" tone="rose" casing="lower" />
              <span className={s.reason}>{r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Losses({ losses }: { readonly losses: ProjectPreview["losses"] }) {
  return (
    <ul className={s.losses} aria-label="losses">
      {losses.map((l) => (
        <li key={`${l.entity}:${l.reason}`} className={s.loss}>
          <span className={s.mono}>{l.entity}</span>
          <Chip label={l.grade} tone={l.grade === "dropped" ? "rose" : l.grade === "data-only" ? "violet" : "amber"} casing="lower" />
          <span className={s.reason}>{l.reason}</span>
        </li>
      ))}
    </ul>
  );
}
