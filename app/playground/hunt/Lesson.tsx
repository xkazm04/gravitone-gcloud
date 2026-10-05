"use client";

// WHAT THE HUNT TAUGHT — the winners against the losers, by axis and by
// technique, and the one sentence a person signs: "when X, brief Y, because Z"
// (lib/sound/types.ts#Lesson). The text engine may draft that sentence from
// the evidence; it is never saved without a human pressing confirm, and when
// the engine cannot draft, the evidence is filled from the map and the
// sentence is written by hand (./model.ts#handLesson).

import { useState } from "react";

import { BookCheck, Crown, PenLine, Sparkles } from "lucide-react";

import { CHIP_CLASS, TALLY_TONE, Tally } from "@/components/ui/signal";
import { TECHNIQUES, type Hunt } from "@/lib/sound/types";

import { TechniqueChips } from "../shared/Chips";
import { ErrorLine } from "../shared/shell";
import { BTN, BTN_KEEP, CAPS, FIELD, pill } from "../shared/ui";
import { evidenceOf, handLesson } from "./model";
import type { HuntApi, LessonDraft } from "./useHunt";

export function LessonPanel({ api, hunt }: { api: HuntApi; hunt: Hunt }) {
  const ev = evidenceOf(hunt);
  const saved = hunt.lessonId
    ? (api.lessons.find((l) => l.id === hunt.lessonId) ?? null)
    : null;
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ask = async () => {
    setAsking(true);
    setError(null);
    const res = await api.draftLesson(hunt.id);
    setAsking(false);
    if (res.ok)
      setDraft({
        ...res.data.draft,
        source: "hunt",
        huntId: hunt.id,
        kind: hunt.kind,
      });
    else setError(res.error);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* ── the evidence ── */}
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tally
            value={ev.winners.length}
            of={ev.heard.length}
            label="won"
            tone={ev.winners.length ? "emerald" : "neutral"}
          />
          {ev.axes.map((a) => (
            <span
              key={a.axis}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.05] px-2.5 py-0.5 font-hanken text-label text-emerald-100/90"
            >
              <Crown className="h-3.5 w-3.5" aria-hidden />
              {a.axis}
              {a.n > 1 && (
                <span className="font-jetbrains text-emerald-200/60">
                  ×{a.n}
                </span>
              )}
            </span>
          ))}
        </div>
        {ev.techniques.length > 0 ? (
          <table className="w-full max-w-md">
            <caption className="sr-only">
              Techniques on winning leaves, against the leaves that lost
            </caption>
            <thead>
              <tr className={CAPS}>
                <th className="pb-1 text-left font-normal">technique</th>
                <th className="pb-1 text-right font-normal">won</th>
                <th className="pb-1 text-right font-normal">lost</th>
              </tr>
            </thead>
            <tbody>
              {ev.techniques.map((t) => (
                <tr key={t.technique} className="border-t border-white/6">
                  <td className="py-1 font-jetbrains text-label text-violet-100/85">
                    {t.technique}
                  </td>
                  <td className="py-1 text-right font-jetbrains text-label tabular-nums text-emerald-200">
                    {t.won}
                  </td>
                  <td className="py-1 text-right font-jetbrains text-label tabular-nums text-white/45">
                    {t.lost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="font-jetbrains text-label text-white/30">
            no winner yet
          </span>
        )}
      </div>

      {/* ── the sentence ── */}
      <div className="grid content-start gap-3">
        {saved ? (
          <div className="grid gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-4">
            <span className="inline-flex items-center gap-2 font-jetbrains text-label text-emerald-200/85">
              <BookCheck className="h-4 w-4" aria-hidden />
              lesson · {new Date(saved.confirmedAt).toLocaleDateString()}
            </span>
            <p className="font-instrument text-xl leading-snug text-white">
              {saved.claim}
            </p>
            <TechniqueChips technique={saved.technique} empty={null} />
            <Evidence lesson={saved} />
          </div>
        ) : hunt.lessonId ? (
          <span className="font-jetbrains text-label text-white/45">
            lesson {hunt.lessonId}
          </span>
        ) : draft ? (
          <DraftEditor
            hunt={hunt}
            draft={draft}
            onChange={setDraft}
            saving={saving}
            onCancel={() => setDraft(null)}
            onSave={async () => {
              setSaving(true);
              const ok = await api.saveLesson(hunt.id, draft);
              setSaving(false);
              if (ok) setDraft(null);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void ask()}
              disabled={asking || !ev.winners.length}
              className={`${BTN} ${asking ? "animate-pulse" : ""}`}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {asking ? "drafting…" : "draft lesson"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(handLesson(hunt))}
              disabled={!ev.winners.length}
              className={BTN}
            >
              <PenLine className="h-4 w-4" aria-hidden />
              write by hand
            </button>
          </div>
        )}
        <ErrorLine text={error} />
      </div>
    </div>
  );
}

function DraftEditor({
  hunt,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  hunt: Hunt;
  draft: LessonDraft;
  onChange: (d: LessonDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const known = TECHNIQUES[hunt.kind];
  const all = [...new Set([...draft.technique, ...known])];
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <label className="grid gap-1.5">
        <span className={CAPS}>claim</span>
        <textarea
          value={draft.claim}
          rows={3}
          placeholder="when …, brief …, because …"
          onChange={(e) => onChange({ ...draft, claim: e.target.value })}
          className={`${FIELD} resize-y font-instrument text-xl leading-snug text-white`}
        />
      </label>
      <div
        role="group"
        aria-label="Techniques the lesson is about"
        className="flex flex-wrap gap-1.5"
      >
        {all.map((t) => {
          const on = draft.technique.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...draft,
                  technique: on
                    ? draft.technique.filter((x) => x !== t)
                    : [...draft.technique, t],
                })
              }
              className={pill(on)}
            >
              {t}
            </button>
          );
        })}
      </div>
      <Evidence lesson={draft} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.claim.trim()}
          className={`${BTN_KEEP} ${saving ? "animate-pulse" : ""}`}
        >
          <BookCheck className="h-4 w-4" aria-hidden />
          confirm lesson
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          discard
        </button>
      </div>
    </div>
  );
}

function Evidence({
  lesson,
}: {
  lesson: Pick<LessonDraft, "evidence" | "provider">;
}) {
  const e = lesson.evidence;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tally value={e.n} label="n" tone="neutral" />
      {e.keepRate != null && (
        <span className={`${CHIP_CLASS} ${TALLY_TONE.emerald}`}>
          <span className="uppercase opacity-55">kept</span>
          {Math.round(e.keepRate * 100)}%
        </span>
      )}
      {e.meanScore != null && (
        <Tally
          value={Math.round(e.meanScore * 10) / 10}
          label="mean"
          tone="cyan"
        />
      )}
      <Tally value={e.takeIds.length} label="takes" tone="neutral" />
      {lesson.provider && (
        <span className="font-jetbrains text-label text-white/45">
          {lesson.provider}
        </span>
      )}
    </div>
  );
}
