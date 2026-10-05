"use client";

// ONE CUE'S TAKES — the rows the sound store holds for it, the one it uses,
// a note on one section, and a lab take adopted onto it.
//
// Its own file because ScoreSpotting.tsx is ~1,100 lines and repo law keeps a
// step's new parts step-local. Every decision is ./takes.ts's (pure, probed);
// this file draws them and hands the spot back through `onSpot`.
//
// Drawn, not narrated: the active take is a filled radio and the only player;
// a pointer the store no longer answers is a <StaleBadge>; a revision sits
// indented under its parent; the adopt list is labels, not a paragraph about
// what adopting means.

import { useRef, useState } from "react";

import { Check, CornerDownRight, Library, Loader2, X } from "lucide-react";

import { CHIP_CLASS, Ghost, StaleBadge, TALLY_TONE, Tally } from "@/components/ui/signal";
import { useAnnounce } from "@/lib/announcer";
import { takeFileUrl } from "@/lib/sound/client";
import type { SoundTake, Verdict } from "@/lib/sound/types";

import type { ScoreSpot } from "./spots";
import { activateTake, adoptTake, adoptable, bindTake, cueTakes, revisionRequest, sectionsOf } from "./takes";
import type { CueTakeStore } from "./useCueTakes";

const ROW = "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5";

function VerdictKeys({ take, onJudge }: { take: SoundTake; onJudge: (v: Verdict) => void }) {
  const set = (v: Verdict) => onJudge(take.verdict === v ? "unjudged" : v);
  return (
    <span className="ml-auto inline-flex gap-1">
      <button
        type="button"
        aria-pressed={take.verdict === "kept"}
        aria-label={`keep ${take.title}`}
        onClick={() => set("kept")}
        className={`rounded border p-1 transition ${take.verdict === "kept" ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-white/40 hover:text-white/80"}`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-pressed={take.verdict === "rejected"}
        aria-label={`reject ${take.title}`}
        onClick={() => set("rejected")}
        className={`rounded border p-1 transition ${take.verdict === "rejected" ? "border-rose-400/50 bg-rose-400/15 text-rose-200" : "border-white/10 text-white/40 hover:text-white/80"}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

export default function CueTakes({
  projectId,
  spot,
  store,
  sectionEdit,
  onSpot,
}: {
  projectId: string;
  spot: ScoreSpot;
  store: CueTakeStore;
  /** The stored-song inpainting a section revision needs. */
  sectionEdit: boolean;
  onSpot: (next: (s: ScoreSpot) => ScoreSpot) => void;
}) {
  const [section, setSection] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [label, setLabel] = useState("");
  const announce = useAnnounce();
  /** Each failure is its own event; the announcer never repeats a key. */
  const events = useRef(0);

  if (store.trouble)
    return (
      <p className="font-jetbrains mt-3 text-content leading-snug text-amber-200/80">
        {store.trouble}
      </p>
    );
  if (store.shelf === null) return <Ghost shape="row" className="mt-3" label="reading this cue’s takes" />;

  const rows = cueTakes(spot, store.shelf, projectId);
  const active = rows.find((r) => r.id === spot.activeTakeId)?.take ?? null;
  const sections = active && sectionEdit ? sectionsOf(active) : [];
  const parents = new Set(rows.map((r) => r.id));
  const pickable = adoptable(store.shelf, label).filter((t) => !parents.has(t.id));

  // Failures reach a screen reader through the one announcer (lib/announcer.tsx
  // rule 2), keyed by the event, not by a live region of this file's own.
  function fail(key: string, error: string | null) {
    setFailed(error);
    if (error) announce({ key: `cue-takes:${key}:${++events.current}`, text: error });
  }

  async function revise() {
    if (!active || section === null || !note.trim()) return;
    setBusy(true);
    setFailed(null);
    const r = await store.generate(`rev-${active.id}`, revisionRequest(active, section, note, { projectId, cueId: spot.id }));
    setBusy(false);
    if (!r.ok) return fail(`rev-${active.id}`, r.error);
    onSpot((s) => bindTake(s, r.take.id));
    setSection(null);
    setNote("");
  }

  async function judge(id: string, v: Verdict) {
    fail(`judge-${id}-${v}`, await store.judge(id, v));
  }

  return (
    <div data-testid="cue-takes" className="mt-3 space-y-1.5">
      {rows.length > 0 && <Tally label="takes" value={rows.length} tone="cyan" />}
      {rows.map(({ id, take }, i) => {
        const on = id === spot.activeTakeId;
        const child = take?.parentId && parents.has(take.parentId);
        return (
          <div key={id} className={child ? "pl-5" : ""}>
            <div className={`${ROW} ${on ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/8 bg-white/[0.02]"}`}>
              {child && <CornerDownRight className="h-3.5 w-3.5 text-white/30" aria-hidden />}
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`use take ${i + 1}`}
                disabled={!take}
                // A take the store filed for this cue but the record never
                // pointed at is bound on pick, not merely activated.
                onClick={() => onSpot((s) => (s.takeIds?.includes(id) ? activateTake(s, id) : adoptTake(s, id)))}
                className={`h-3.5 w-3.5 rounded-full border transition ${on ? "border-cyan-300 bg-cyan-300" : "border-white/30 hover:border-white/60"} disabled:opacity-30`}
              />
              <span className="font-jetbrains text-label text-white/70">take {i + 1}</span>
              {take ? (
                <>
                  <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{take.op === "section-edit" ? "revision" : take.origin === "score" ? "cue" : (take.label ?? take.origin)}</span>
                  {take.op === "section-edit" && take.prompt && (
                    <span className="font-jetbrains truncate text-label text-white/45">{take.prompt}</span>
                  )}
                  <VerdictKeys take={take} onJudge={(v) => void judge(id, v)} />
                </>
              ) : (
                <StaleBadge words="gone" glyph="history" why="Not in this machine’s sound store." />
              )}
            </div>
            {on && take?.file && <audio controls src={takeFileUrl(id)} className="mt-1.5 h-9 w-full" />}
          </div>
        );
      })}

      {/* A NOTE ON ONE SECTION — the stored plan's sections at their own
          widths; pick one, type the note, Enter. The rest is kept by
          reference, so only the noted section is re-rendered. */}
      {sections.length > 1 && (
        <div className="mt-2">
          <div role="radiogroup" aria-label="section to revise" className="flex h-7 overflow-hidden rounded-md border border-white/10">
            {sections.map((s) => (
              <button
                key={s.index}
                type="button"
                role="radio"
                aria-checked={section === s.index}
                onClick={() => setSection(section === s.index ? null : s.index)}
                style={{ width: `${((s.endMs - s.startMs) / sections[sections.length - 1].endMs) * 100}%` }}
                className={`font-jetbrains truncate border-r border-white/10 px-1.5 text-label last:border-r-0 ${section === s.index ? "bg-amber-300/15 text-amber-100" : "text-white/45 hover:bg-white/[0.04]"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {section !== null && (
            <form
              className="mt-1.5 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void revise();
              }}
            >
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label={`note on ${sections[section]?.name ?? "this section"}`}
                maxLength={300}
                className="font-jetbrains min-w-0 flex-1 rounded-md border border-amber-300/30 bg-transparent px-2 py-1 text-label text-white/85 outline-none focus:border-amber-300/60"
              />
              {busy && <Loader2 className="h-4 w-4 animate-spin text-amber-200/70" aria-label="revising" />}
            </form>
          )}
        </div>
      )}

      {failed && (
        <p className="font-jetbrains text-content leading-snug text-amber-200/80">
          {failed}
        </p>
      )}

      <div className="pt-1">
        <button
          type="button"
          aria-expanded={adopting}
          onClick={() => setAdopting((a) => !a)}
          className={`${CHIP_CLASS} ${TALLY_TONE.neutral} gap-1 hover:text-white/90`}
        >
          <Library className="h-3.5 w-3.5" aria-hidden />
          adopt
        </button>
        {adopting && (
          <div className="mt-1.5 space-y-1">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="finalized take label"
              className="font-jetbrains w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-label text-white/85 outline-none focus:border-cyan-300/50"
            />
            {pickable.length === 0 ? (
              <Ghost shape="row" label="no finalized take matches" />
            ) : (
              pickable.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSpot((s) => adoptTake(s, t.id));
                    setAdopting(false);
                  }}
                  className={`${ROW} w-full border-white/8 text-left hover:border-cyan-400/30`}
                >
                  <span className="font-jetbrains text-label text-cyan-200/90">{t.label}</span>
                  <span className="truncate text-label text-white/50">{t.title}</span>
                  {t.measured?.durationS != null && (
                    <span className="font-jetbrains ml-auto text-label text-white/35">{Math.round(t.measured.durationS)}s</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
