"use client";

// THE MATRIX — one scene at a time, styles down, mechanisms across.
//
// This is the trial-matrix reading the registry asks for: read by ROW (a
// style that holds on every mechanism, or none) and by COLUMN (a mechanism
// that fails every style is a bad lane, not five bad styles) before reading
// totals. The source frame is pinned beside the grid because every judgement
// is "did the shot survive", and the shot has to be in view to say so.
//
// Keyboard is the point of the surface: a cull of hundreds is arrow, K, X,
// arrow, K, X. Enter opens the comparison; the lightbox owns the keys while
// it is open. Each style row also carries its own K/X, because "this style
// failed this scene" is one decision, not two or six.
//
// Every drawn part is the kit's (components/kit): the matrix and its pinned
// frame, the tile and what a verdict does to it, the row keys, the chips. What is
// left here is this surface's own: which candidate belongs in which cell, and the
// keys.

import { useEffect, useMemo } from "react";

import { Chip, Chips, FlagChip, Matrix, Plate, RowHead, Scene, ScoreChip, Tile, VerdictKeys, useRoving } from "@/components/kit";
import type { Candidate, RunManifest, Verdict, Verdicts } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";

/** Elements the browser ACTIVATES on Enter.
 *
 *  The grid's keys are bound on `window`, which is right for arrows and for
 *  K/X/U: a cull is hundreds of decisions and the hand should not have to keep
 *  the browser's focus anywhere in particular. Enter is the exception, because
 *  it is the only one of them that the focused element already owns.
 *
 *  Nothing in this grid is focusable — a tile is a `<div onClick>` — so the
 *  browser's focus is always on something ELSE while a candidate is "focused"
 *  in app state, and `focused` becomes non-null on the first tile click anyone
 *  makes. Enter then reached this handler, which called `preventDefault()`, and
 *  a `<button>`'s Enter activation is precisely what that suppresses: after one
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

export function CullGrid({
  run,
  verdicts,
  focused,
  readOnly,
  onFocus,
  onVerdict,
  onOpen,
  keysEnabled,
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
}) {
  const columns = useMemo(
    () => run.plan.mechanisms.flatMap((m) => run.plan.seeds.map((seed) => ({ mechanism: m, seed }))),
    [run.plan.mechanisms, run.plan.seeds],
  );
  const order = useMemo(() => run.candidates.map((c) => c.id), [run.candidates]);
  const byId = useMemo(() => new Map(run.candidates.map((c) => [c.id, c])), [run.candidates]);
  const indexOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);

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

  return (
    <div className="flex flex-col gap-10" {...roving.containerProps}>
      {run.scenes.map((scene) => (
        <Scene
          key={scene.id}
          label={`Scene ${scene.id}`}
          aside={
            <>
              <Plate>
                {/* eslint-disable-next-line @next/next/no-img-element -- served off local disk through the file seam */}
                <img src={fileUrl(run.id, scene.source)} alt={scene.note || scene.id} />
              </Plate>
              <div className="k-caps k-lab">source · {scene.id}</div>
              <p>{scene.note}</p>
              <Chips>
                {CRAFT_SUMMARY.map((f) => {
                  const v = scene.annotation?.[f];
                  return typeof v === "string" ? (
                    <Chip key={f} name={f.replace(/_/g, " ")}>
                      {v}
                    </Chip>
                  ) : null;
                })}
              </Chips>
              {scene.annotation_from && <p className="k-muted">annotation from {scene.annotation_from}</p>}
            </>
          }
        >
          <Matrix
            label="Candidates, styles by mechanism"
            columns={columns.map((col) => ({
              id: `${col.mechanism.id}-${col.seed}`,
              head: col.mechanism.id,
              sub: (
                <>
                  {col.mechanism.label ?? (col.mechanism.reference ? "reference-conditioned" : "words only")}
                  {run.plan.seeds.length > 1 ? ` · seed ${col.seed}` : ""}
                </>
              ),
            }))}
            rows={run.plan.styles.map((sid) => {
              const style = run.styles[sid];
              const rowIds = columns.map((col) => `${scene.id}/${sid}--${col.mechanism.id}--s${col.seed}`);
              const rowLive = rowIds.filter((id) => {
                const c = byId.get(id);
                return c && !c.deleted && c.status !== "pending" && c.status !== "failed";
              });
              const rowVerdicts = rowLive.map((id) => verdicts[id]?.verdict);
              const rowAll = (v: Verdict) => rowLive.length > 0 && rowVerdicts.every((x) => x === v);
              return {
                id: sid,
                head: (
                  <RowHead
                    name={style?.name ?? sid}
                    meta={
                      <>
                        {style?.family} · {style?.origin.kind}
                        {style?.origin.source ? ` (${style.origin.source})` : ""}
                      </>
                    }
                  >
                    {!readOnly && rowLive.length > 0 && (
                      <VerdictKeys
                        variant="row"
                        subject={`the whole ${style?.name ?? sid} row`}
                        value={rowAll("keep") ? "keep" : rowAll("reject") ? "reject" : null}
                        onVerdict={(v) => v && onVerdict(rowLive, v)}
                      />
                    )}
                  </RowHead>
                ),
                cells: rowIds.map((id) => {
                  const c = byId.get(id);
                  return (
                    <CandidateTile
                      key={id}
                      run={run.id}
                      id={id}
                      candidate={c}
                      label={`${style?.name ?? sid}, ${c?.mechanism ?? ""}, seed ${c?.seed ?? ""}`}
                      verdict={verdicts[id]?.verdict}
                      focused={focused === id}
                      rovingProps={indexOf.has(id) ? roving.itemProps(indexOf.get(id)!) : undefined}
                      readOnly={readOnly}
                      onFocus={() => onFocus(id)}
                      onOpen={() => onOpen(id)}
                      onVerdict={(v) => onVerdict(id, v)}
                    />
                  );
                }),
              };
            })}
          />
        </Scene>
      ))}
    </div>
  );
}

export function cssId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function CandidateTile({
  run,
  id,
  candidate,
  label,
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
  label: string;
  verdict: Verdict | undefined;
  focused: boolean;
  rovingProps?: { tabIndex: 0 | -1; "data-roving": number };
  readOnly: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onVerdict: (v: Verdict | null) => void;
}) {
  const ready = candidate && !candidate.deleted && (candidate.status === "graded" || candidate.status === "unmeasured" || candidate.status === "generated");
  const state = candidate?.deleted ? "deleted" : candidate?.status === "failed" ? "failed" : ready ? "ready" : "queued";
  return (
    <Tile
      id={candidate ? `cand-${cssId(candidate.id)}` : id}
      label={label}
      src={ready ? fileUrl(run, candidate.file) : undefined}
      verdict={verdict}
      focused={focused}
      rovingProps={rovingProps}
      state={state}
      detail={state === "failed" ? (candidate?.error ?? undefined) : undefined}
      onFocus={onFocus}
      onOpen={onOpen}
      chips={
        candidate?.grade && ready ? (
          <>
            <ScoreChip label="craft" value={candidate.grade.craft?.score} />
            <ScoreChip label="style" value={candidate.grade.style?.score} />
            {candidate.grade.veto?.has_text ? <FlagChip kind="text" /> : candidate.status === "unmeasured" ? <FlagChip kind="unmeasured" /> : null}
          </>
        ) : undefined
      }
      actions={
        ready && !readOnly ? (
          <VerdictKeys
            variant="tile"
            value={verdict}
            subject={label}
            onVerdict={(v) => {
              onFocus();
              onVerdict(v);
            }}
          />
        ) : undefined
      }
    />
  );
}
