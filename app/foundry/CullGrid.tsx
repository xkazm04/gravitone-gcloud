"use client";

// THE MATRIX — one scene at a time, styles down, mechanisms across.
//
// This is the trial-matrix reading the registry asks for: read by ROW (a
// style that holds on every mechanism, or none) and by COLUMN (a mechanism
// that fails every style is a bad lane, not five bad styles) before reading
// totals. The source frame is in view beside or above the grid because every
// judgement is "did the shot survive", and the shot has to be in view to say so.
//
// Keyboard is the point of the surface: a cull of hundreds is arrow, K, X,
// arrow, K, X. Enter opens the comparison; the lightbox owns the keys while
// it is open. Each style row also carries its own K/X, because "this style
// failed this scene" is one decision, not two or six.
//
// THREE ARRANGEMENTS, ONE READING ORDER (2026-10-05, the round-2 UI pass). The
// prototype variants draw this grid three ways — `matrix` pins the source
// beside a column-headed grid, `film` leads with the source as a showcase and
// lets each style's row run large, `sheet` is a dense contact sheet — but every
// one of them is a row per style and a column per mechanism × seed. That is
// what keeps the keys identical across all three: ↓ is always "the next style",
// `columns.length` candidates further on in `order`, whatever the drawing.

import { Maximize2 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useRoving } from "@/components/kit/useRoving";
import type { Candidate, RunManifest, Verdict, Verdicts } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";
import { Art, FlagPill, Label, ScorePill, VerdictButtons, VerdictStamp, verdictRing, type ArtState } from "./ui";

/** Elements the browser ACTIVATES on Enter.
 *
 *  The grid's keys are bound on `window`, which is right for arrows and for
 *  K/X/U: a cull is hundreds of decisions and the hand should not have to keep
 *  the browser's focus anywhere in particular. Enter is the exception, because
 *  it is the only one of them that the focused element already owns.
 *
 *  Nothing in this grid is focusable but the one roving tile, so the browser's
 *  focus is usually on something ELSE while a candidate is "focused" in app
 *  state, and `focused` becomes non-null on the first tile click anyone makes.
 *  Enter then reached this handler, which called `preventDefault()`, and a
 *  `<button>`'s Enter activation is precisely what that suppresses: after one
 *  click on one tile, Enter stopped working on the row K/X buttons, the run
 *  list, the tab strip and Commit, and opened the lightbox instead. Space still
 *  worked, which is the kind of half-working that takes a while to report.
 *
 *  Checked by tag and by role rather than with `closest`, because Enter is
 *  delivered to the focused element itself. */
const ENTER_ACTIVATES = new Set(["BUTTON", "A", "SUMMARY", "SELECT", "TEXTAREA", "INPUT"]);

export function activatesOnEnter(t: { tagName?: string; getAttribute?: (n: string) => string | null } | null): boolean {
  if (!t) return false;
  if (ENTER_ACTIVATES.has(t.tagName ?? "")) return true;
  const role = t.getAttribute?.("role") ?? null;
  return role === "button" || role === "link" || role === "menuitem" || role === "tab";
}

const CRAFT_SUMMARY = ["shot_size", "camera_angle", "composition", "lighting_key", "lighting_direction", "depth_of_field"];

export type CullLayout = "matrix" | "film" | "sheet";

export function CullGrid({
  run,
  verdicts,
  focused,
  readOnly,
  onFocus,
  onVerdict,
  onOpen,
  keysEnabled,
  layout = "matrix",
}: {
  run: RunManifest;
  verdicts: Verdicts;
  focused: string | null;
  /** A committed run: no verdict controls at all, navigation only. */
  readOnly: boolean;
  onFocus: (id: string) => void;
  onVerdict: (ids: string | string[], v: Verdict | null) => void;
  onOpen: (id: string) => void;
  keysEnabled: boolean;
  layout?: CullLayout;
}) {
  const columns = useMemo(
    () => run.plan.mechanisms.flatMap((m) => run.plan.seeds.map((seed) => ({ mechanism: m, seed }))),
    [run.plan.mechanisms, run.plan.seeds],
  );
  const order = useMemo(() => run.candidates.map((c) => c.id), [run.candidates]);
  const byId = useMemo(() => new Map(run.candidates.map((c) => [c.id, c])), [run.candidates]);
  const indexOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  // The candidate the forge is on right now: the first one still pending on a
  // live run. Drawn as "generating" rather than "queued" — the one tile on the
  // page that is actually moving.
  const live = ["created", "annotating", "generating", "grading"].includes(run.status);
  const working = live ? run.candidates.find((c) => c.status === "pending")?.id : undefined;

  // ROVING FOCUS ALONGSIDE THE WINDOW KEYS. The arrows, K/X/U and Enter stay bound on
  // `window` below (the probe holds that contract, and a cull should not need the
  // browser's focus anywhere in particular). What this adds is the tab stop: exactly one
  // tile is focusable, the app's own focused candidate, and when the grid already holds
  // the browser's focus it follows the arrows. `arrows: false` and no `onActivate`, so
  // neither key is handled twice.
  //
  // The tab stop must be a tile that IS drawn: the arrows walk `order`, which holds every
  // candidate of the run, including ones no cell of this plan draws, so the app's focus can
  // rest on a candidate with no tile. Then the first drawn tile keeps the grid reachable.
  const drawn = useMemo(() => {
    const ids = new Set<string>();
    for (const scene of run.scenes)
      for (const sid of run.plan.styles) for (const col of columns) ids.add(`${scene.id}/${sid}--${col.mechanism.id}--s${col.seed}`);
    return ids;
  }, [run.scenes, run.plan.styles, columns]);
  const firstDrawn = order.findIndex((id) => drawn.has(id));
  const roving = useRoving({
    count: order.length,
    active: focused && drawn.has(focused) && indexOf.has(focused) ? indexOf.get(focused)! : Math.max(0, firstDrawn),
    onActive: (i) => order[i] && onFocus(order[i]),
    arrows: false,
  });

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = focused ? order.indexOf(focused) : -1;
      const step = (d: number) => {
        const n = Math.min(order.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
        onFocus(order[n]);
      };
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          step(columns.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          step(-columns.length);
          break;
        case "k":
        case "K":
          if (focused && !readOnly) onVerdict(focused, "keep");
          break;
        case "x":
        case "X":
          if (focused && !readOnly) onVerdict(focused, "reject");
          break;
        case "u":
        case "U":
          if (focused && !readOnly) onVerdict(focused, null);
          break;
        case "Enter":
          // Enter belongs to the focused element when that element activates on
          // it — see `activatesOnEnter`. Taking it here suppressed every button
          // on the page.
          if (activatesOnEnter(t)) return;
          if (focused) {
            e.preventDefault();
            onOpen(focused);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, readOnly, focused, order, columns.length, onFocus, onVerdict, onOpen]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`cand-${cssId(focused)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const colHead = (col: (typeof columns)[number]) => ({
    id: col.mechanism.id,
    sub: `${col.mechanism.label ?? (col.mechanism.reference ? "reference-conditioned" : "words only")}${run.plan.seeds.length > 1 ? ` · seed ${col.seed}` : ""}`,
  });

  return (
    <div
      className={layout === "sheet" ? `grid items-start gap-5 ${run.scenes.length > 1 ? "2xl:grid-cols-2" : ""}` : "flex flex-col gap-8"}
      {...roving.containerProps}
    >
      {run.scenes.map((scene) => {
        const source = <Art src={fileUrl(run.id, scene.source)} alt={scene.note || scene.id} className="aspect-video" />;
        const chips = (
          <div className="flex flex-wrap gap-1.5">
            {CRAFT_SUMMARY.map((f) => {
              const v = scene.annotation?.[f];
              return typeof v === "string" ? (
                <span key={f} className="font-jetbrains inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-label text-white/75">
                  <span className="text-white/40">{f.replace(/_/g, " ")}</span>
                  {v}
                </span>
              ) : null;
            })}
          </div>
        );

        const rows = run.plan.styles.map((sid) => {
          const style = run.styles[sid];
          const rowIds = columns.map((col) => `${scene.id}/${sid}--${col.mechanism.id}--s${col.seed}`);
          const rowLive = rowIds.filter((id) => {
            const c = byId.get(id);
            return c && !c.deleted && c.status !== "pending" && c.status !== "failed";
          });
          const rowVerdicts = rowLive.map((id) => verdicts[id]?.verdict);
          const rowAll = (v: Verdict) => rowLive.length > 0 && rowVerdicts.every((x) => x === v);
          const name = style?.name ?? sid;
          const meta = `${style?.family ?? "—"} · ${style?.origin.kind ?? "—"}${style?.origin.source ? ` (${style.origin.source})` : ""}`;
          const rowKeys =
            !readOnly && rowLive.length > 0 ? (
              <VerdictButtons
                size="sm"
                subject={`the whole ${name} row`}
                value={rowAll("keep") ? "keep" : rowAll("reject") ? "reject" : null}
                onVerdict={(v) => v && onVerdict(rowLive, v)}
              />
            ) : null;
          const kept = rowVerdicts.filter((v) => v === "keep").length;
          const cells = rowIds.map((id, ci) => {
            const c = byId.get(id);
            return (
              <CandidateTile
                key={id}
                run={run.id}
                id={id}
                candidate={c}
                working={working === id}
                label={`${name}, ${c?.mechanism ?? columns[ci].mechanism.id}, seed ${c?.seed ?? columns[ci].seed}`}
                caption={layout === "film" ? colHead(columns[ci]).id : undefined}
                compact={layout === "sheet"}
                verdict={verdicts[id]?.verdict}
                focused={focused === id}
                rovingProps={indexOf.has(id) ? roving.itemProps(indexOf.get(id)!) : undefined}
                readOnly={readOnly}
                onFocus={() => onFocus(id)}
                onOpen={() => onOpen(id)}
                onVerdict={(v) => onVerdict(id, v)}
              />
            );
          });
          return { sid, name, meta, rowKeys, cells, kept, decided: rowVerdicts.filter(Boolean).length, total: rowLive.length };
        });

        const grid = `minmax(0,1fr) `.repeat(columns.length).trim();

        if (layout === "film") {
          return (
            <section key={scene.id} aria-label={`Scene ${scene.id}`} className="flex flex-col gap-6">
              <div className="flex flex-col gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-3 lg:flex-row">
                <div className="w-full shrink-0 lg:w-[48%] lg:max-w-[620px]">{source}</div>
                <div className="flex min-w-0 flex-col justify-center gap-3 lg:pr-4">
                  <span className="flex items-baseline gap-2">
                    <Label>source</Label>
                    <span className="font-jetbrains truncate text-label text-white/35">{scene.frame}</span>
                  </span>
                  <h3 className="font-instrument text-3xl leading-tight text-white">{scene.id}</h3>
                  {scene.note && <p className="font-hanken text-content leading-snug text-slate-400">{scene.note}</p>}
                  {chips}
                  {scene.annotation_from && <span className="font-jetbrains text-label text-white/35">annotation · {scene.annotation_from}</span>}
                </div>
              </div>
              {rows.map((r) => (
                <div key={r.sid} role="group" aria-label={`${r.name} on ${scene.id}`}>
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <h4 className="font-instrument truncate text-2xl text-white">{r.name}</h4>
                      <span className="font-jetbrains truncate text-label text-white/40">{r.meta}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.decided > 0 && (
                        <span className="font-jetbrains text-label text-white/45">
                          <span className="text-emerald-200/90">{r.kept}</span> kept · {r.decided}/{r.total}
                        </span>
                      )}
                      {r.rowKeys}
                    </div>
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: grid }}>
                    {r.cells}
                  </div>
                </div>
              ))}
            </section>
          );
        }

        if (layout === "sheet") {
          return (
            <section key={scene.id} aria-label={`Scene ${scene.id}`} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-white/6 pb-4">
                <div className="w-44 shrink-0">
                  <Art src={fileUrl(run.id, scene.source)} alt={scene.note || scene.id} className="aspect-video" rounded="rounded-lg" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="font-instrument text-2xl text-white">{scene.id}</h3>
                  {scene.note && <span className="font-hanken line-clamp-2 text-content leading-snug text-slate-400">{scene.note}</span>}
                </div>
                <div className="w-full">{chips}</div>
              </div>
              <div className="grid items-center gap-x-3 gap-y-3" style={{ gridTemplateColumns: `minmax(130px,180px) ${grid}` }}>
                <span />
                {columns.map((col) => {
                  const h = colHead(col);
                  return (
                    <div key={`${h.id}-${col.seed}`} className="min-w-0 px-0.5">
                      <div className="font-jetbrains text-label text-white/80">{h.id}</div>
                      <div className="font-jetbrains truncate text-label text-white/35">{h.sub}</div>
                    </div>
                  );
                })}
                {rows.map((r) => (
                  <RowFragment key={r.sid} name={r.name} meta={r.meta} keys={r.rowKeys} compact>
                    {r.cells}
                  </RowFragment>
                ))}
              </div>
            </section>
          );
        }

        // matrix
        return (
          <section key={scene.id} aria-label={`Scene ${scene.id}`} className="grid gap-6 xl:grid-cols-[minmax(300px,380px)_1fr]">
            <aside className="flex flex-col gap-3 self-start xl:sticky xl:top-6">
              {source}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-instrument text-2xl text-white">{scene.id}</h3>
                <Label>source</Label>
              </div>
              {scene.note && <p className="font-hanken text-content leading-snug text-slate-400">{scene.note}</p>}
              {chips}
              {scene.annotation_from && <span className="font-jetbrains text-label text-white/35">annotation · {scene.annotation_from}</span>}
            </aside>
            <div className="grid items-center gap-x-3 gap-y-4" style={{ gridTemplateColumns: `minmax(150px,210px) ${grid}` }}>
              <span />
              {columns.map((col) => {
                const h = colHead(col);
                return (
                  <div key={`${h.id}-${col.seed}`} className="min-w-0 border-b border-white/8 pb-2">
                    <div className="font-jetbrains text-label text-cyan-200/90">{h.id}</div>
                    <div className="font-jetbrains truncate text-label text-white/40">{h.sub}</div>
                  </div>
                );
              })}
              {rows.map((r) => (
                <RowFragment key={r.sid} name={r.name} meta={r.meta} keys={r.rowKeys}>
                  {r.cells}
                </RowFragment>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A row head and its cells, as grid children of the parent grid. */
function RowFragment({ name, meta, keys, compact = false, children }: { name: string; meta: string; keys: React.ReactNode; compact?: boolean; children: React.ReactNode }) {
  return (
    <>
      <div role="rowheader" className="flex min-w-0 flex-col gap-1.5 self-center pr-2">
        <span className={`truncate ${compact ? "font-hanken text-content text-white/90" : "font-instrument text-xl text-white"}`}>{name}</span>
        <span className="font-jetbrains truncate text-label text-white/40">{meta}</span>
        {keys && <div className="mt-1">{keys}</div>}
      </div>
      {children}
    </>
  );
}

export function cssId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function CandidateTile({
  run,
  id,
  candidate,
  working,
  label,
  caption,
  compact,
  verdict,
  focused,
  rovingProps,
  readOnly,
  onFocus,
  onOpen,
  onVerdict,
}: {
  run: string;
  id: string;
  candidate: Candidate | undefined;
  working: boolean;
  label: string;
  /** The mechanism, written on the tile when no column head is drawn. */
  caption?: string;
  compact: boolean;
  verdict: Verdict | undefined;
  focused: boolean;
  rovingProps?: { tabIndex: 0 | -1; "data-roving": number };
  readOnly: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onVerdict: (v: Verdict | null) => void;
}) {
  const ready = candidate && !candidate.deleted && (candidate.status === "graded" || candidate.status === "unmeasured" || candidate.status === "generated");
  const state: ArtState = candidate?.deleted ? "deleted" : candidate?.status === "failed" ? "failed" : ready ? "ready" : working ? "generating" : "queued";
  const v = state === "ready" ? verdict : undefined;
  const g = candidate?.grade;
  const flag = ready && g ? (g.veto?.has_text ? "text" : candidate.status === "unmeasured" ? "unmeasured" : null) : null;
  return (
    <div
      id={candidate ? `cand-${cssId(candidate.id)}` : id}
      {...rovingProps}
      role="group"
      aria-roledescription="candidate"
      aria-label={`${label}${v ? (v === "keep" ? ", kept" : ", rejected") : ""}${state !== "ready" ? `, ${state}` : ""}`}
      onClick={onFocus}
      className={`group relative min-w-0 cursor-pointer rounded-xl transition duration-200 focus-visible:outline-none ${
        focused ? "outline-2 outline-offset-4 outline-cyan-300" : ""
      } ${v === "reject" ? "opacity-60 hover:opacity-90" : ""}`}
    >
      <Art
        src={ready ? fileUrl(run, candidate.file) : undefined}
        alt={label}
        state={state}
        className={`aspect-video transition ${verdictRing(v)} ${focused ? "shadow-[var(--gt-shadow-glow)]" : v ? "" : "group-hover:ring-white/30"}`}
      >
        {ready && (
          // The picture opens the comparison, as the kit tile's <img onClick>
          // did; Enter is the keyboard's way to the same place.
          <span
            aria-hidden
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              onOpen();
            }}
            className="absolute inset-0 cursor-zoom-in"
          />
        )}
        {v && <VerdictStamp verdict={v} className="absolute top-2 left-2" />}
        {state === "failed" && candidate?.error && (
          <span className="font-jetbrains absolute inset-x-2 bottom-2 line-clamp-2 text-center text-label text-rose-200/80">{candidate.error}</span>
        )}
        {caption && state === "ready" && (
          <span className="font-jetbrains pointer-events-none absolute top-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-label text-white/80 backdrop-blur-sm">{caption}</span>
        )}
        {ready && !readOnly && (
          <span
            className={`absolute right-2 bottom-2 transition-opacity duration-150 ${
              focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
          >
            <VerdictButtons
              size="sm"
              value={verdict}
              subject={label}
              onVerdict={(next) => {
                onFocus();
                onVerdict(next);
              }}
            />
          </span>
        )}
        {ready && focused && !caption && (
          <span aria-hidden className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/55 p-1 text-white/80 backdrop-blur-sm">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        )}
      </Art>
      {/* THE SCORES UNDER THE PICTURE, not on it. Laid over the art they
          fought the stamp, the flags and the verdict buttons for the same
          corners of a 260px tile, and covered the part of the frame a craft
          judgement is about. The strip is a size container, so a narrow tile
          drops each pill's meter before it drops a number. */}
      {/* Drawn on every tile, empty when there is nothing to score, so a
          queued tile is the same height as its row. */}
      <div className="@container mt-1.5 flex min-h-7 items-center gap-1 px-0.5">
        {ready && g && (
          <>
            <ScorePill label="craft" value={g.craft?.score} />
            {!compact && <ScorePill label="style" value={g.style?.score} />}
            {flag && <FlagPill kind={flag} />}
          </>
        )}
      </div>
    </div>
  );
}
