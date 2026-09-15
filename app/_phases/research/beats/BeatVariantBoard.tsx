"use client";

// STEP 1 (Research) for a trailer — or a free project that chose beats. One
// column per part of the spine, candidates in each, pick one per part; the
// composed spine is what Script opens on. Read `./beats.ts` for what this is
// and is not.

import { Eyebrow } from "@/components/ui/Primitives";
import { Hint, PipRow, StaleBadge } from "@/components/ui/signal";
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
  /** What each column is showing — the same expression SlotColumn is handed, so
   *  the pip rail below cannot disagree with the columns above it. A frozen
   *  spine reads off the checkpoint; a live one off the picks. */
  const pickedPerSlot = slots.map((s) =>
    frozen ? (frozen[s.id] ?? null) : (pickedVariant(s, api.picks)?.id ?? null),
  );
  const pickedCount = pickedPerSlot.filter(Boolean).length;

  if (!api.hydrated)
    return <p className="font-jetbrains text-label text-white/35">opening the project’s picks…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        {/* THE HEADER PARAGRAPH IS THE GRID. "{n} parts, in spine order, each
            on the cue section it sits on" counted the columns directly below
            it, which are in spine order and each carry their own cue chip. What
            is NOT visible in the grid survives: the borrowed spine, behind the
            eyebrow's disclosure, and the fixture's provenance as the badge that
            shape was invented for — an unmeasured figure is a limit, so amber,
            never rose. */}
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>{DISCIPLINE_LABEL[discipline]} · beat variants</Eyebrow>
          {discipline === "free" && (
            <Hint label="Where these beats come from">
              no craft template — it borrows the trailer spine
            </Hint>
          )}
          <StaleBadge
            words="fixture · n=0"
            why="the Glass Harbor slots, whatever the logline — pipeline/BEATS-PROMPT.md replaces them"
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot, i) => (
          <SlotColumn
            key={slot.id}
            slot={slot}
            picked={pickedPerSlot[i]}
            cueSection={sectionOf(slot.movement.cueSection)}
            readOnly={!!frozen}
            onPick={(v) => api.pick(slot.id, v)}
          />
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-jetbrains text-label tracking-[0.16em] text-white/55 uppercase">
              {frozen ? "spine composed" : "compose the spine"}
            </p>
            {/* ONE PIP PER PART, filled where a beat is picked. The sentence
                this replaces counted the same slots in words and then listed
                the unpicked ones by name — and the compose button beside it
                already reads "compose spine · N missing" and names them in its
                own `title`. The frozen branch said Step 2 opens on the frozen
                spine and that reopening un-composes it: the eyebrow above says
                "spine composed" and the `reopen` button is the other half.
                `spine-status` stays on the wrapper — the id is a contract. */}
            <span data-testid="spine-status" className="mt-1.5 flex items-center gap-2">
              <PipRow
                states={pickedPerSlot.map((p) => (p ? "filled" : "hollow"))}
                label={`${pickedCount} of ${slots.length} parts picked`}
              />
              <span className="font-jetbrains text-label text-white/40">
                {pickedCount}/{slots.length} picked
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {frozen && (
              <button
                type="button"
                data-testid="reopen-spine"
                onClick={api.reopen}
                className="font-jetbrains rounded-full border border-white/12 px-3.5 py-1.5 text-label text-white/55 transition hover:bg-white/5"
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
              className="font-jetbrains rounded-full border border-cyan-400/40 bg-cyan-400/[0.08] px-4 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {frozen ? "composed" : complete ? "compose spine →" : `compose spine · ${missing.length} missing`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
