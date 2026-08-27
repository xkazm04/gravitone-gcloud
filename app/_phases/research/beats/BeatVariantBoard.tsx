"use client";

// STEP 1 (Research) for a trailer — or a free project that chose beats. One
// column per part of the spine, candidates in each, pick one per part; the
// composed spine is what Script opens on. Read `./beats.ts` for what this is
// and is not.

import { Eyebrow } from "@/components/ui/Primitives";
import { DISCIPLINE_LABEL, type Discipline } from "@/lib/projects";
import { GLASS_HARBOR_CUE } from "@/app/_studio/trailerFixtures";

import { pickedVariant, slotsFor, spineComplete } from "./beats";
import SlotColumn from "./SlotColumn";
import type { BeatPicksApi } from "./useBeatPicks";

export default function BeatVariantBoard({
  api,
  discipline,
}: {
  api: BeatPicksApi;
  discipline: Discipline;
}) {
  const slots = slotsFor(discipline);
  const cue = GLASS_HARBOR_CUE;
  const sectionOf = (id: string | undefined) => cue.sections.find((s) => s.id === id);
  const frozen = api.confirmed;
  const { complete, missing } = spineComplete(api.picks, slots);

  if (!api.hydrated)
    return <p className="font-jetbrains text-[12px] text-white/35">opening the project’s picks…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{DISCIPLINE_LABEL[discipline]} · beat variants</Eyebrow>
          <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
            Pick one beat per part — the spine you compose is what Script opens on. {slots.length} parts,
            in spine order, each on the cue section it sits on.
            {discipline === "free" && (
              <> This project has no craft template; it borrows the trailer spine because it is the only beat vocabulary the studio has.</>
            )}
          </p>
          <p className="font-jetbrains mt-2 text-[11px] text-white/35">
            fixture · n=0 · the Glass Harbor slots, whatever the project&apos;s logline — a model run from
            pipeline/BEATS-PROMPT.md is what replaces them
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => (
          <SlotColumn
            key={slot.id}
            slot={slot}
            picked={frozen ? (frozen[slot.id] ?? null) : (pickedVariant(slot, api.picks)?.id ?? null)}
            cueSection={sectionOf(slot.movement.cueSection)}
            readOnly={!!frozen}
            onPick={(v) => api.pick(slot.id, v)}
          />
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/55 uppercase">
              {frozen ? "spine composed" : "compose the spine"}
            </p>
            <p className="font-hanken mt-1.5 max-w-xl text-sm text-slate-400" data-testid="spine-status">
              {frozen
                ? "Step 2 opens on this frozen spine. Reopen to change a pick; it must be composed again."
                : complete
                  ? `${slots.length} of ${slots.length} parts picked — the spine is whole.`
                  : `${missing.length} of ${slots.length} part${missing.length === 1 ? "" : "s"} unpicked: ${missing.join(", ")}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {frozen && (
              <button
                type="button"
                data-testid="reopen-spine"
                onClick={api.reopen}
                className="font-jetbrains rounded-full border border-white/12 px-3.5 py-1.5 text-[11px] text-white/55 transition hover:bg-white/5"
              >
                reopen
              </button>
            )}
            <button
              type="button"
              data-testid="compose-spine"
              onClick={() => void api.confirm()}
              disabled={!complete || !!frozen}
              title={!complete ? `unpicked: ${missing.join(", ")}` : undefined}
              className="font-jetbrains rounded-full border border-cyan-400/40 bg-cyan-400/[0.08] px-4 py-1.5 text-[11px] text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {frozen ? "composed" : complete ? "compose spine →" : `compose spine · ${missing.length} missing`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
