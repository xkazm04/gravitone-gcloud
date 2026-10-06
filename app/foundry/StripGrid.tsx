"use client";

// THE STRIPS GRID — code-rendered strips, two bands (edu, stat), one card per
// authored strip, triaged by the Cull's keys.
//
// A BLIND FIRST READ. A card shows its approach NUMBER ("S07") and nothing
// that names the approach until a verdict is cast; name, medium and motion
// grammar are revealed on decision (docs/code-rendered-strips-plan.md, "The
// /foundry surface"). What the card does show before then is the evidence that
// is not the approach's identity: the four pre-gates, the fix rounds, the
// Leonardo asset's provenance. Gate failures are badged, never hidden — the
// operator overrules the gate, not the other way round.
//
// ORDER WITHIN A BAND: the brief's positive control first, then each original
// with its replica right after it, so "can the author repeat this?" is read
// side by side. Controls and replicas are drawn distinct (a dashed amber frame,
// a cyan rail) but stay in the band — they are judged by the same eye.
//
// A CARD THAT DID NOT RENDER shows its status and its error verbatim, never a
// player with nothing to play. Only a rendered card takes a verdict (the store
// refuses the rest).
//
// KEYS, bound on `window` like CullGrid's and refused by the same guard
// (./keyGuard.ts): ←/→ walk the order, ↑/↓ move to the card drawn above or
// below (measured from the layout, because the bands' column counts differ and
// change with the viewport), K keep, X reject, U clear, Enter opens the
// lightbox, 1–8 toggle the reason chips in STRIP_CHIPS order on a decided card.

import { Maximize2 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useRoving } from "@/components/kit/useRoving";
import Clip from "@/components/ui/Clip";
import { CHIP_CLASS, PipRow, Provenance, TALLY_TONE, Tally, type PipState } from "@/components/ui/signal";
import { JUDGEABLE } from "@/lib/foundry/strips/triage";
import { STRIP_CHIPS, type Approach, type StripCard, type StripChip, type StripGates, type StripLane, type StripRun, type StripVerdict, type StripVerdicts } from "@/lib/foundry/strips/types";

import { activatesOnEnter, cssId } from "./CullGrid";
import { fileUrl } from "./foundryClient";
import { refusedKey } from "./keyGuard";
import { CARD_STATUS_WORD } from "./parts";
import { Art, VerdictButtons, VerdictStamp, verdictRing } from "./ui";

export type StripVerdictValue = "keep" | "reject";

const LANES: StripLane[] = ["edu", "stat"];
const GATE_ORDER: (keyof StripGates)[] = ["seek", "legibility", "motion", "length"];

/** Controls first, then each original followed by its replicas; an orphan
 *  replica (its original not in this band) last. */
export function bandOrder(cards: StripCard[]): StripCard[] {
  const base = cards.filter((c) => !c.replicaOf);
  const replicas = cards.filter((c) => c.replicaOf);
  base.sort((a, b) => (a.approach === "CTRL") !== (b.approach === "CTRL") ? (a.approach === "CTRL" ? -1 : 1) : a.approach.localeCompare(b.approach, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const out: StripCard[] = [];
  for (const c of base) out.push(c, ...replicas.filter((r) => r.replicaOf === c.id));
  const placed = new Set(out.map((c) => c.id));
  return out.concat(replicas.filter((r) => !placed.has(r.id)));
}

/** The whole run in triage order: the edu band, then the stat band. */
export function stripOrder(run: StripRun): StripCard[] {
  return LANES.flatMap((l) => bandOrder(run.cards.filter((c) => c.lane === l)));
}

export const judgeable = (c: StripCard | undefined) => Boolean(c && JUDGEABLE.includes(c.status));
export const isControl = (c: StripCard) => c.approach === "CTRL";
export const approachOf = (run: StripRun, c: StripCard): Approach | undefined => run.approaches.find((a) => a.id === c.approach);

/** The card's number — what a blind read sees. */
export function cardNumber(c: StripCard): string {
  return isControl(c) ? "CTRL" : c.approach;
}

/** Run-relative URL of a card file, or undefined when the card has none. */
export function cardFileUrl(runId: string, c: StripCard, k: keyof StripCard["files"]): string | undefined {
  const rel = c.files[k];
  return rel ? fileUrl(runId, `${c.id}/${rel}`, "strips") : undefined;
}

export function gatePips(g: StripGates | undefined): { states: PipState[]; label: string; failed: (keyof StripGates)[] } {
  if (!g) return { states: GATE_ORDER.map(() => "hollow"), label: "gates not run", failed: [] };
  const failed = GATE_ORDER.filter((k) => g[k] && !g[k].ok);
  const states = GATE_ORDER.map((k): PipState => (!g[k] ? "hollow" : g[k].ok ? "filled" : "rose"));
  const label = `gates: ${GATE_ORDER.map((k) => `${k} ${!g[k] ? "not run" : g[k].ok ? "passed" : "failed"}`).join(", ")}`;
  return { states, label, failed };
}

/** The element arrow ↑/↓ lands on: the nearest card drawn below/above. */
function verticalNeighbour(order: string[], from: string, dir: 1 | -1): string | undefined {
  const at = document.getElementById(`strip-${cssId(from)}`)?.getBoundingClientRect();
  if (!at) return undefined;
  const cx = at.left + at.width / 2;
  let best: { id: string; dy: number; dx: number } | undefined;
  for (const id of order) {
    if (id === from) continue;
    const r = document.getElementById(`strip-${cssId(id)}`)?.getBoundingClientRect();
    if (!r) continue;
    const dy = dir === 1 ? r.top - (at.bottom - 4) : at.top + 4 - r.bottom;
    if (dy < 0) continue;
    const dx = Math.abs(r.left + r.width / 2 - cx);
    if (!best || dy < best.dy - 4 || (Math.abs(dy - best.dy) <= 4 && dx < best.dx)) best = { id, dy, dx };
  }
  return best?.id;
}

export function StripGrid({
  run,
  verdicts,
  focused,
  readOnly,
  onFocus,
  onVerdict,
  onToggleChip,
  onOpen,
  keysEnabled,
}: {
  run: StripRun;
  verdicts: StripVerdicts;
  focused: string | null;
  readOnly: boolean;
  onFocus: (id: string) => void;
  onVerdict: (id: string, v: StripVerdictValue | null) => void;
  onToggleChip: (id: string, chip: StripChip) => void;
  onOpen: (id: string) => void;
  keysEnabled: boolean;
}) {
  const bands = useMemo(() => LANES.map((lane) => ({ lane, cards: bandOrder(run.cards.filter((c) => c.lane === lane)) })).filter((b) => b.cards.length > 0), [run.cards]);
  const order = useMemo(() => bands.flatMap((b) => b.cards.map((c) => c.id)), [bands]);
  const byId = useMemo(() => new Map(run.cards.map((c) => [c.id, c])), [run.cards]);
  const indexOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);

  const roving = useRoving({
    count: order.length,
    active: focused && indexOf.has(focused) ? indexOf.get(focused)! : 0,
    onActive: (i) => order[i] && onFocus(order[i]),
    arrows: false,
  });

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (refusedKey(e)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const i = focused ? order.indexOf(focused) : -1;
      const step = (d: number) => {
        const n = Math.min(order.length - 1, Math.max(0, (i < 0 ? 0 : i) + d));
        if (order[n]) onFocus(order[n]);
      };
      const card = focused ? byId.get(focused) : undefined;
      const canJudge = Boolean(focused && !readOnly && judgeable(card));
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          step(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          return;
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          if (!focused) return step(0);
          const to = verticalNeighbour(order, focused, e.key === "ArrowDown" ? 1 : -1);
          if (to) onFocus(to);
          return;
        }
        case "k":
        case "K":
          if (canJudge) onVerdict(focused!, "keep");
          return;
        case "x":
        case "X":
          if (canJudge) onVerdict(focused!, "reject");
          return;
        case "u":
        case "U":
          if (canJudge) onVerdict(focused!, null);
          return;
        case "Enter":
          if (activatesOnEnter(t)) return;
          if (focused) {
            e.preventDefault();
            onOpen(focused);
          }
          return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= STRIP_CHIPS.length && canJudge && verdicts[focused!]) onToggleChip(focused!, STRIP_CHIPS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, readOnly, focused, order, byId, verdicts, onFocus, onVerdict, onToggleChip, onOpen]);

  useEffect(() => {
    if (!focused) return;
    document.getElementById(`strip-${cssId(focused)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  return (
    <div className="flex flex-col gap-6" {...roving.containerProps}>
      {bands.map(({ lane, cards }) => {
        const rendered = cards.filter(judgeable);
        const decided = rendered.filter((c) => verdicts[c.id]);
        const kept = decided.filter((c) => verdicts[c.id].verdict === "keep").length;
        const cases = [...new Set(cards.map((c) => c.case))];
        return (
          <section key={lane} aria-label={`${lane} band`} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/6 pb-3">
              <h2 className="font-instrument text-2xl text-white">{lane}</h2>
              <span className="font-jetbrains text-label text-white/40">
                {run.width[lane]}×{run.height[lane]} · {cases.join(" · ")}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                <Tally label="decided" value={decided.length} of={rendered.length} />
                <Tally label="kept" value={kept} tone={kept ? "emerald" : "neutral"} />
                {rendered.length < cards.length && <Tally label="failed" value={cards.length - rendered.length} tone="rose" />}
              </span>
            </div>
            <div className={`grid items-start gap-4 ${lane === "edu" ? "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(190px,1fr))]"}`}>
              {cards.map((c) => (
                <StripTile
                  key={c.id}
                  run={run}
                  card={c}
                  verdict={verdicts[c.id]}
                  focused={focused === c.id}
                  rovingProps={indexOf.has(c.id) ? roving.itemProps(indexOf.get(c.id)!) : undefined}
                  readOnly={readOnly}
                  onFocus={() => onFocus(c.id)}
                  onOpen={() => onOpen(c.id)}
                  onVerdict={(v) => onVerdict(c.id, v)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The reveal: name · medium · grammar, after a verdict. */
export function revealLine(run: StripRun, c: StripCard): string {
  if (isControl(c)) return `${c.case} control`;
  const a = approachOf(run, c);
  return a ? `${a.name} · ${a.medium} · ${a.grammar}` : c.approach;
}

/** The marker a control or a replica carries beside its number. */
export function KindChip({ card }: { card: StripCard }) {
  if (isControl(card)) return <span className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>control</span>;
  if (card.replicaOf) return <span className={`${CHIP_CLASS} ${TALLY_TONE.cyan}`}>replica</span>;
  return null;
}

/** Gate pips, the failing gates by name, fix rounds, the Leonardo asset. */
export function CardSignals({ run, card }: { run: StripRun; card: StripCard }) {
  const g = gatePips(card.gates);
  const disc = run.discrimination?.[card.approach];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {card.status === "rendered" && <PipRow states={g.states} label={g.label} />}
      {g.failed.map((k) => (
        <span key={k} className={`${CHIP_CLASS} ${TALLY_TONE.rose}`}>
          {k}
        </span>
      ))}
      <Tally label="fix" value={card.rounds} of={2} tone={card.rounds ? "amber" : "neutral"} />
      {disc !== undefined && !card.replicaOf && <Tally label="disc" value={Math.round(disc * 100) / 100} tone={disc >= 1.5 ? "emerald" : "amber"} />}
      {card.asset && <Provenance vendor={card.asset.provider} cost={card.asset.costUsd !== undefined ? `$${card.asset.costUsd.toFixed(2)}` : undefined} />}
    </div>
  );
}

function StripTile({
  run,
  card,
  verdict,
  focused,
  rovingProps,
  readOnly,
  onFocus,
  onOpen,
  onVerdict,
}: {
  run: StripRun;
  card: StripCard;
  verdict: StripVerdict | undefined;
  focused: boolean;
  rovingProps?: { tabIndex: 0 | -1; "data-roving": number };
  readOnly: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onVerdict: (v: StripVerdictValue | null) => void;
}) {
  const ok = judgeable(card);
  const v = ok ? verdict?.verdict : undefined;
  const webm = cardFileUrl(run.id, card, "webm");
  const mp4 = cardFileUrl(run.id, card, "mp4");
  const poster = cardFileUrl(run.id, card, "poster") ?? "";
  const playable = ok && Boolean(webm || mp4);
  const aspect = card.lane === "edu" ? "aspect-video" : "aspect-[9/16]";
  const num = cardNumber(card);
  const label = `${num}${card.replicaOf ? " replica" : ""}${v ? (v === "keep" ? ", kept" : ", rejected") : ""}${ok ? "" : `, ${CARD_STATUS_WORD[card.status]}`}`;
  const frame = isControl(card) ? "border border-dashed border-amber-300/45 p-1.5" : card.replicaOf ? "border-l-2 border-cyan-300/50 pl-2" : "";
  return (
    <div
      id={`strip-${cssId(card.id)}`}
      {...rovingProps}
      role="group"
      aria-roledescription="strip"
      aria-label={label}
      onClick={onFocus}
      onDoubleClick={() => ok && onOpen()}
      className={`group relative min-w-0 cursor-pointer self-start rounded-xl transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 ${frame} ${
        focused ? "outline-2 outline-offset-4 outline-cyan-300" : ""
      } ${v === "reject" ? "opacity-60 hover:opacity-90" : ""}`}
    >
      <div className={`relative overflow-hidden rounded-xl ${aspect} ${verdictRing(v)}`}>
        {playable ? (
          <Clip
            sources={[...(webm ? [{ src: webm, type: "video/webm" }] : []), ...(mp4 ? [{ src: mp4, type: "video/mp4" }] : [])]}
            poster={poster}
            label={`strip ${num}`}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <Art
            alt={`strip ${num}`}
            state={ok ? (run.status === "committed" && v === "reject" ? "deleted" : "missing") : "failed"}
            absentWord={ok ? undefined : CARD_STATUS_WORD[card.status]}
            className="h-full w-full"
            rounded="rounded-xl"
          >
            {!ok && card.error && <span className="font-jetbrains absolute inset-x-3 bottom-3 line-clamp-4 text-center text-label break-words text-rose-200/85">{card.error}</span>}
          </Art>
        )}
        {v && <VerdictStamp verdict={v} className="absolute top-2 left-2" />}
        {ok && (
          <button
            type="button"
            aria-label={`Open strip ${num}`}
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              onOpen();
            }}
            className={`absolute top-2 right-2 grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-black/55 text-white/80 backdrop-blur-sm transition-opacity hover:text-white ${
              focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <Maximize2 aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
        {ok && !readOnly && (
          <span className={`absolute right-2 bottom-2 transition-opacity duration-150 ${focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
            <VerdictButtons
              size="sm"
              value={v}
              subject={`strip ${num}`}
              onVerdict={(next) => {
                onFocus();
                onVerdict(next);
              }}
            />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1.5 px-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-instrument text-xl text-white">{num}</span>
          <KindChip card={card} />
          {v && <span className="font-jetbrains min-w-0 text-label break-words text-white/60">{revealLine(run, card)}</span>}
        </div>
        <CardSignals run={run} card={card} />
        {!ok && card.lint && card.lint.length > 0 && <Tally label="lint" value={card.lint.length} tone="rose" />}
        {v && verdict?.chips && verdict.chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {verdict.chips.map((c) => (
              <span key={c} className={`${CHIP_CLASS} ${v === "keep" ? TALLY_TONE.emerald : TALLY_TONE.rose}`}>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
