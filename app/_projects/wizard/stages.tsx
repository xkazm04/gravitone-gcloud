"use client";

// The create wizard's stages: what each deck of cards SAYS, built from the same
// catalogues the expert dialog reads (lib/projects, lib/themes) — the wizard is
// a different face on the same facts, never a second copy of them.

import Link from "next/link";

import type { DeckCardSpec } from "@/components/ui/deck/DeckCard";
import { Field, NumberInput, TextArea, TextInput } from "@/components/ui/Field";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_NOTE,
  templateOf,
  templatesFor,
  type Discipline,
  type TemplateId,
} from "@/lib/projects";
import { approvedProofs, ORIGIN_WORD, type Theme } from "@/lib/themes";

/* ── Tones — distinct per discipline, and per template inside one ─────────── */

// Tailwind gradient classes as DATA (DeckArt's gradient contract): they are
// listed literally here so the JIT emits them, and they are the rendered form
// of the accents tokens.ts declares — no colour literal leaves that file.
const DISCIPLINE_TONE: Record<Discipline, string> = {
  educational: "from-cyan-400/30 via-sky-400/10 to-transparent",
  trailer: "from-violet-400/30 via-fuchsia-400/10 to-transparent",
  free: "from-emerald-400/30 via-teal-300/10 to-transparent",
};

// Exhaustive on TemplateId on purpose — a template appended to the catalogue
// without a tone here is a typecheck failure, not a card with no ground
// (TEMPLATE_FAMILY sets the precedent).
const TEMPLATE_TONE: Record<TemplateId, string> = {
  "short-form-clip": "from-cyan-400/25 via-sky-400/10 to-transparent",
  "short-educational-video": "from-cyan-300/30 via-blue-400/10 to-transparent",
  "mid-educational-video": "from-sky-400/25 via-indigo-400/15 to-transparent",
  teaser: "from-fuchsia-400/25 via-violet-400/10 to-transparent",
  trailer: "from-violet-400/30 via-purple-400/10 to-transparent",
  cinematic: "from-rose-400/25 via-violet-400/15 to-transparent",
  "free-form": "from-emerald-400/25 via-teal-300/10 to-transparent",
};

/* ── Card builders ────────────────────────────────────────────────────────── */

export function disciplineCards(): DeckCardSpec[] {
  return DISCIPLINES.map((d) => ({
    id: d,
    eyebrow: "discipline",
    title: DISCIPLINE_LABEL[d],
    body: DISCIPLINE_NOTE[d],
    chips: [
      {
        label: `${templatesFor(d).length} template${templatesFor(d).length === 1 ? "" : "s"}`,
        tone: "neutral",
      },
    ],
    art: { kind: "gradient", tone: DISCIPLINE_TONE[d], manifestKey: `discipline-${d}` },
  }));
}

export function templateCards(discipline: Discipline): DeckCardSpec[] {
  return templatesFor(discipline).map((t) => ({
    id: t.id,
    eyebrow: DISCIPLINE_LABEL[discipline].toLowerCase(),
    title: t.label,
    body: t.note,
    chips: [
      // Free form's range is what the input ACCEPTS, not a measured craft band
      // (lib/projects.ts says so at the catalogue) — the chip must not claim
      // a measurement the library never made.
      t.id === "free-form"
        ? { label: `${t.range[0]}–${t.range[1]}s accepted`, tone: "neutral" as const }
        : { label: `${t.range[0]}–${t.range[1]}s measured`, tone: "cyan" as const },
      { label: `target ${t.defaultS}s`, tone: "neutral" as const },
    ],
    art: { kind: "gradient", tone: TEMPLATE_TONE[t.id], manifestKey: `template-${t.id}` },
  }));
}

/** Cards for the locked styles that fit — the caller filters (same predicate as
 *  the dialog: lockedOnly + styleFits), this only draws what it is handed. */
export function styleCards(themes: Theme[]): DeckCardSpec[] {
  return themes.map((t) => {
    // The first APPROVED proof is the art: an approved proof is what the user
    // ratified the style by; a rejected one is the record of what the style is
    // NOT (lib/themes.ts) and must not become its face here.
    const proof = approvedProofs(t)[0];
    const hexes = t.block.palette.map((c) => c.hex);
    const approved = approvedProofs(t).length;
    return {
      id: t.id,
      eyebrow: ORIGIN_WORD[t.origin],
      title: t.name,
      body: `${t.block.technique} — ${t.block.finish}`,
      chips: [
        t.discipline
          ? { label: DISCIPLINE_LABEL[t.discipline].toLowerCase(), tone: "violet" as const }
          : { label: "fits every discipline", tone: "neutral" as const },
        { label: `${approved} proof${approved === 1 ? "" : "s"} approved`, tone: "emerald" as const },
      ],
      art: proof
        ? {
            kind: "image" as const,
            src: `data:${proof.mime};base64,${proof.base64}`,
            alt: `an approved proof of ${t.name}`,
            fallback: { hexes },
          }
        : { kind: "gradient" as const, tone: "", hexes },
      footnote: t.lockedAt ? `locked ${new Date(t.lockedAt).toLocaleDateString()}` : undefined,
    };
  });
}

/* ── The empty style deck — honest, and it routes ─────────────────────────── */

export function EmptyStyleDeck({ discipline }: { discipline: Discipline }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-8 text-center">
      <p className="font-instrument text-2xl text-amber-100">
        No locked style fits {DISCIPLINE_LABEL[discipline].toLowerCase()} yet
      </p>
      <p className="font-hanken mt-3 text-sm leading-relaxed text-amber-100/80">
        Every frame a project renders is built on a locked visual identity, and this account has
        none that fits. Styles are commissioned in the library — a style from a brief fits every
        discipline. Your picks here are kept while you go back a stage.
      </p>
      <Link
        href="/library"
        className="font-jetbrains mt-5 inline-block rounded-lg border border-amber-300/40 px-4 py-2 text-[12px] text-amber-100 transition hover:bg-amber-300/10"
      >
        commission one in the library →
      </Link>
    </div>
  );
}

/* ── Stage 4 — not cards: the name, and the runtime ───────────────────────── */

export function NameStage({
  title,
  logline,
  targetS,
  discipline,
  template,
  onTitle,
  onLogline,
  onDuration,
}: {
  title: string;
  logline: string;
  targetS: number;
  discipline: Discipline;
  template: TemplateId;
  onTitle: (v: string) => void;
  onLogline: (v: string) => void;
  /** Fires with the user's number — taking it is taking OWNERSHIP of the
   *  runtime (the `ownDuration` latch lives in the wizard). */
  onDuration: (v: number) => void;
}) {
  const tpl = templateOf(template);
  return (
    <div className="gt-rise mx-auto grid w-full max-w-xl gap-5">
      <Field label="Project name" htmlFor="w-title">
        <TextInput
          id="w-title"
          autoFocus
          value={title}
          placeholder="Glass Harbor"
          maxLength={80}
          onChange={(e) => onTitle(e.target.value)}
        />
      </Field>

      <Field
        label="Logline"
        htmlFor="w-logline"
        hint="Optional — one sentence. It is what the script step argues back against."
      >
        <TextArea
          id="w-logline"
          rows={2}
          value={logline}
          placeholder="A crew that never breaks in — they wait for the one door every city leaves unlocked."
          maxLength={240}
          onChange={(e) => onLogline(e.target.value)}
        />
      </Field>

      <Field
        label="Target runtime"
        htmlFor="w-dur"
        hint={
          // Same honesty rule as the dialog: free form has no measured band —
          // its range is only what the input accepts.
          discipline === "free"
            ? "Nothing was measured for a free-form video. There is no craft band here; the studio only keeps time."
            : `${tpl.label} was measured at ${tpl.range[0]}–${tpl.range[1]}s. Past that band the craft rules stop applying.`
        }
      >
        <NumberInput
          id="w-dur"
          unit="s"
          min={5}
          max={900}
          value={targetS}
          onChange={(e) => onDuration(Number(e.target.value) || 0)}
        />
      </Field>
    </div>
  );
}
