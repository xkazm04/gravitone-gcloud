"use client";

// ATELIER — the library as a studio wall, now wired to real tooling.
//
// Three panes: styles begin on the left (a brief, or a preset off the shelf),
// the selected style is worked in the middle (its proof sheet and the
// playground that fills it), and the dossier on the right is where it earns
// its lock.
//
// Every image on this screen is real. The presets are committed renders, the
// proofs come back from /api/imaging/generate and live in IndexedDB, and the
// lock gate reads the sheet rather than a mocked status field.

import { useEffect, useMemo, useState } from "react";

import { ArrowLeft, RotateCw } from "lucide-react";

import { Panel } from "@/components/ui/Primitives";
import { Ghost } from "@/components/ui/signal";
import { Segmented } from "@/components/ui/Field";
import { promotedFrom } from "@/lib/assets";
import { DISCIPLINES, DISCIPLINE_LABEL, listProjects } from "@/lib/projects";
import { useAssets } from "@/lib/useAssets";
import { useAuth } from "@/lib/useAuth";
import { useThemes } from "@/lib/useThemes";
import { lockedOnly, statusOf, styleFits, type DisciplineFilter, type Proof, type Theme } from "@/lib/themes";
import type { GenerateResult } from "@/lib/imagingClient";

import {
  ConfirmDeleteStyle,
  GateChip,
  PaletteDots,
  StyleSheet,
  StyleStepper,
  type Dependents,
} from "./parts";
import PresetRail from "./PresetRail";
import SpecEditor from "./SpecEditor";
import { type Preset } from "./presets";

/** The four slots a style is written in, in SpecEditor's order. Named here only
 *  to draw their outlines before a style exists to fill them. */
const SLOT_NAMES = ["technique", "subject", "palette", "finish"] as const;

/** What a "from a brief" style starts as — deliberately generic, and every
 *  slot obviously in need of the user's hand. */
const BLANK = {
  technique: "flat vector illustration, even line weight",
  subject: "objects drawn plainly, one idea per frame",
  palette: [
    { name: "ink", hex: "#101418", role: "ground" as const },
    { name: "bone", hex: "#EFEAE0", role: "objects" as const },
    { name: "signal", hex: "#5BC8F5", role: "accent" as const },
  ],
  finish: "matte, generous empty space",
};

export default function LibraryAtelier({
  initialSelectedId = null,
  onCounts,
}: {
  /** A style to open on arrival — set when the Assets tab forked one off a
   *  plate and switched here. An INITIAL value, not a controlled prop: this
   *  component is unmounted while the other module is showing, so the handoff
   *  lands on mount and the user's own clicks own the selection from then on. */
  initialSelectedId?: string | null;
  /** What the tab rail shows instead of a blurb. Reported from here because
   *  this is where the live arrays are — including `assets`, which changes on
   *  THIS tab whenever a proof is kept on the shelf. */
  onCounts?: (c: { styles: number; locked: number; assets: number }) => void;
} = {}) {
  const { user } = useAuth();
  const { themes, error, loading, reload, create, update, addProof, judgeProof, lock, remove } =
    useThemes(user?.uid ?? null);

  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  /** Which kind of video the wall is being read for. "all" shows everything;
   *  a discipline shows its own styles plus the untagged ones. The rail and
   *  the pills filter with the same predicate. */
  const [discipline, setDiscipline] = useState<DisciplineFilter>("all");
  const [busy, setBusy] = useState(false);
  /** The style the user has asked to delete, and how many projects it would
   *  cost. Counted on demand rather than held for every style — the answer is
   *  only needed at the moment it is being weighed. */
  const [doomed, setDoomed] = useState<Theme | null>(null);
  const [dependents, setDependents] = useState<Dependents>("counting");
  /** The shelf, read (never seeded) from here so an approved proof can be put
   *  ON it from where the user is already looking, and so a plate that is
   *  already there says so instead of offering to go twice. */
  const { assets, promote, removeFromTheme } = useAssets(user?.uid ?? null, { seed: false });
  const [shelfNote, setShelfNote] = useState<string | null>(null);
  /** Which shelf entries exist, by id. The sheet asks it per plate. */
  const shelved = useMemo(() => new Set((assets ?? []).map((a) => a.id)), [assets]);

  const rows = useMemo(() => themes ?? [], [themes]);
  const shown = useMemo(() => rows.filter((t) => styleFits(t, discipline)), [rows, discipline]);
  // The selection is kept even when the filter hides its pill: the filter is
  // for FINDING a style, and yanking the sheet out from under the user would
  // make it a destructive control.
  const selected = rows.find((t) => t.id === selectedId) ?? shown[0] ?? null;
  /** A locked style is finished: its sheet is the reference set, and nothing —
   *  a rename, a verdict, a new proof — may move under the projects built on it. */
  const isLocked = selected ? statusOf(selected) === "locked" : false;

  // Follow the newest style in rather than leaving the user on a stale one.
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  useEffect(() => {
    if (themes === null) return; // still reading — an unknown count is not 0
    onCounts?.({ styles: rows.length, locked: lockedOnly(rows).length, assets: (assets ?? []).length });
  }, [onCounts, themes, rows, assets]);

  const startFrom = async (p: Preset) => {
    setBusy(true);
    const made = await create({
      name: p.name,
      origin: "preset",
      presetId: p.id,
      // A style started from a preset inherits the preset's discipline.
      discipline: p.discipline,
      block: p.block,
      elements: p.elements,
    });
    if (made) setSelectedId(made.id);
    setBusy(false);
  };

  const startBlank = async () => {
    setBusy(true);
    const made = await create({ name: "Untitled style", origin: "scratch", block: BLANK, elements: [] });
    if (made) setSelectedId(made.id);
    setBusy(false);
  };

  const keepAsProof = async (t: Theme, r: GenerateResult, subject: string) => {
    const img = r.images[0];
    if (!img) return;
    const proof: Proof = {
      id: `pr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      // The subject is the label: a sheet you cannot read back is a sheet you
      // cannot judge, and "proof 4" tells you nothing about what it proved.
      label: subject.split(/[.,]/)[0].slice(0, 42).toLowerCase(),
      base64: img.base64,
      mime: img.mime,
      state: "pending",
      model: r.provenance.model,
      // The vendor, kept from here on: a plate promoted to the shelf carries
      // its lineage, and "which vendor made this" is not re-derivable later.
      provider: r.provenance.provider,
      costUsd: r.provenance.costUsd,
      createdAt: Date.now(),
    };
    await addProof(t.id, proof);
  };

  const askDelete = async (t: Theme) => {
    setDoomed(t);
    setDependents("counting");
    if (!user) return;
    try {
      const projects = await listProjects(user.uid);
      setDependents(projects.filter((p) => p.themeId === t.id).length);
    } catch {
      // Unknown stays unknown. Reporting "no projects" because the read failed
      // is how a user deletes the style three productions are built on.
      setDependents("unknown");
    }
  };

  /** An approved proof, filed on the shelf. The asset is a POINTER at the proof
   *  — nothing is copied — so this costs a row, not a second megabyte. */
  const keepOnShelf = async (t: Theme, p: Proof) => {
    const made = await promote(t, p);
    setShelfNote(
      made
        ? `“${p.label}” is on the shelf — Assets › ${made.path.join(" › ")}`
        : `“${p.label}” could not be put on the shelf.`,
    );
  };

  const confirmDelete = async () => {
    const gone = doomed;
    setDoomed(null);
    if (!gone) return;
    // The promoted plates first: they point INTO this theme, so they have to go
    // with it rather than be left addressing bytes that no longer exist.
    await removeFromTheme(gone.id);
    await remove(gone.id);
    // Fall back to whatever is left rather than holding a dead selection.
    setSelectedId((cur) => (cur === gone.id ? null : cur));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr_300px]">
      <PresetRail onPick={startFrom} onScratch={startBlank} busy={busy} discipline={discipline} />

      <section className="space-y-4">
        {/* THE COUNT IS ON THE OPTION. A filter that can empty the wall used to
            do it silently and then print a paragraph underneath — "No style on
            the wall is tagged for this discipline. Untagged styles fit every
            discipline, and a preset stamps its own." The zero was always
            derivable and never shown; shown, the paragraph has nothing left to
            say. `note` went for the same reason: "every style on the wall" is
            the option's own label, restated. */}
        <Segmented
          label="Discipline"
          value={discipline}
          options={[
            { id: "all" as const, label: `All ${rows.length}` },
            ...DISCIPLINES.map((d) => ({
              id: d,
              label: `${DISCIPLINE_LABEL[d]} ${rows.filter((t) => styleFits(t, d)).length}`,
            })),
          ]}
          onChange={setDiscipline}
        />

        {/* The machine's own words, and a retry. The clause that used to follow
            them explained where styles are stored — the app's mechanism, on the
            line where the user wants the error and a way to try again. */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3"
          >
            <p className="min-w-0 flex-1 text-content text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              aria-label="Read the wall again"
              className="shrink-0 cursor-pointer rounded-full border border-rose-400/30 p-1.5 text-rose-200/80 transition hover:bg-rose-400/10 hover:text-rose-100"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {loading ? (
          <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
            reading the wall…
          </p>
        ) : !rows.length ? (
          <EmptyWall />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {shown.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`font-jetbrains flex items-center gap-2 rounded-full border px-3 py-1.5 text-label transition ${
                    t.id === selected?.id
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 text-white/50 hover:text-white/80"
                  }`}
                >
                  {t.name}
                  <PaletteDots palette={t.block.palette} />
                </button>
              ))}
            </div>

            {selected && (
              <StyleSheet
                theme={selected}
                locked={isLocked}
                shelved={shelved}
                note={shelfNote}
                onRename={(name) => void update(selected.id, { name })}
                onJudge={(proofId, state) => void judgeProof(selected.id, proofId, state)}
                onPromote={(p) => void keepOnShelf(selected, p)}
                onKeepTrial={(r, subject) => keepAsProof(selected, r, subject)}
              />
            )}
          </>
        )}
      </section>

      <aside className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-jetbrains text-content tracking-[0.18em] text-white/40 uppercase">dossier</p>
          <GateChip themes={rows} />
        </div>
        {selected ? (
          <>
            <Panel className="p-4">
              <SpecEditor
                theme={selected}
                onChange={(block) => void update(selected.id, { block })}
                onLock={() => void lock(selected.id)}
              />
            </Panel>
            {/* The way OUT of the wall. A style used to be un-deletable — the
                hook exported `remove()` and nothing called it — so a wall of
                abandoned drafts could only ever grow. */}
            <button
              onClick={() => void askDelete(selected)}
              className="font-jetbrains w-full cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-label text-white/45 transition hover:border-rose-400/40 hover:text-rose-300"
            >
              delete this style
            </button>
          </>
        ) : (
          // The shape of what is coming, rather than a sentence about it.
          // "Pick a preset on the left and its four slots appear here" is a
          // stage direction; four labelled outlines in the place the slots will
          // occupy are the same instruction, and they point left by sitting to
          // the right of the rail that fills them.
          <Panel className="p-4">
            <p className="sr-only">
              No style selected. Its technique, subject, palette and finish slots appear here.
            </p>
            <div className="space-y-2">
              {SLOT_NAMES.map((n) => (
                <Ghost key={n} shape="slot" label="">
                  <span className="font-jetbrains flex h-full items-center px-3 text-label tracking-[0.14em] text-white/45 uppercase">
                    {n}
                  </span>
                </Ghost>
              ))}
            </div>
          </Panel>
        )}
        <StyleStepper theme={selected} />
      </aside>

      <ConfirmDeleteStyle
        theme={doomed}
        dependents={dependents}
        promoted={doomed ? promotedFrom(assets ?? [], doomed.id).length : 0}
        onClose={() => setDoomed(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

/**
 * The empty wall, as the shape of a wall.
 *
 * Two paragraphs went. The first was the tour — four slots, a playground, a
 * proof sheet — which the dossier's own slot outlines and the stepper beside
 * them now draw. The second said every preset thumbnail is a render of one
 * canonical subject "so the grid varies by style alone": six identical subjects
 * in six styles is a claim the pictures make on sight, and could not be made
 * more convincingly in words.
 */
function EmptyWall() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12">
      <p className="font-instrument mb-5 text-center text-2xl text-white">The wall is empty</p>
      <div className="mx-auto flex max-w-sm items-center gap-4">
        <ArrowLeft className="h-6 w-6 shrink-0 animate-pulse text-cyan-300/60" aria-hidden />
        <Ghost
          shape="card"
          count={1}
          label="No styles yet. Start one from the preset rail on the left."
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
