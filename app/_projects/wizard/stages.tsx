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
  templateOf,
  templatesFor,
  type Discipline,
  type TemplateId,
} from "@/lib/projects";
import { thumbSrc, type Preset } from "@/app/library/presets";
import { approvedProofs, type Theme } from "@/lib/themes";

/** Card ids must not collide with theme ids on the one pick surface they
 *  share; the prefix is how the wizard tells a minted-on-create preset from a
 *  locked theme that already exists. */
export const PRESET_CARD_PREFIX = "preset:";
export const presetCardId = (p: Preset) => `${PRESET_CARD_PREFIX}${p.id}`;

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

// HERO CARDS — the illustration and the name, nothing else (operator verdict
// 2026-09-06, DeckCard#density). Every pick stage in this wizard is a choice
// between three to seven whole things, and the card was arguing a case nobody
// asked it to make: an eyebrow repeating the stage's own label, a paragraph of
// pitch, and chips counting things. What each card needs to carry is which
// thing it is; what the stage needs to say, the stage's `sub` says once.
//
// WHERE THE STRIPPED FACTS WENT — none of them were the card's only home:
//  · DISCIPLINE_NOTE / template notes / a style's technique · finish — prose
//    the stage sub-line frames and the studio shows in full afterwards;
//  · the "N templates" count — a number that describes the NEXT stage, which
//    the user is one click from seeing in full;
//  · the runtime band chips, including trailer's honest `sourced · n=0 here`
//    (uat 2026-09-05, MA-L1-4) — restated in full on the name stage's runtime
//    hint (NameStage below), which is where the number is actually chosen and
//    therefore where the claim has to be true. Deleting the chip did NOT
//    delete the disclosure; check NameStage before moving it again.
export function disciplineCards(): DeckCardSpec[] {
  return DISCIPLINES.map((d) => ({
    id: d,
    title: DISCIPLINE_LABEL[d],
    density: "hero" as const,
    art: { kind: "gradient", tone: DISCIPLINE_TONE[d], manifestKey: `discipline-${d}` },
    // The bake-off verdict for this stage (2026-08-30): emblem won for the
    // project-type and duration cards. Pinned here; the style stage keeps its
    // proof images, and other deck surfaces stay in the bake-off.
    artVariant: "emblem",
  }));
}

export function templateCards(discipline: Discipline): DeckCardSpec[] {
  return templatesFor(discipline).map((t) => ({
    id: t.id,
    title: t.label,
    density: "hero" as const,
    art: { kind: "gradient", tone: TEMPLATE_TONE[t.id], manifestKey: `template-${t.id}` },
    // Same verdict as the discipline stage — the template cards ARE the
    // duration selection (the band and target they set are stated where the
    // number is edited, on the name stage's runtime hint).
    artVariant: "emblem",
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
    return {
      id: t.id,
      title: t.name,
      density: "hero" as const,
      art: proof
        ? {
            kind: "image" as const,
            src: `data:${proof.mime};base64,${proof.base64}`,
            alt: `an approved proof of ${t.name}`,
            fallback: { hexes },
          }
        : { kind: "gradient" as const, tone: "", hexes },
    };
  });
}

/** Cards for the presets that fit the discipline — complete four-slot style
 *  blocks off the shelf (app/library/presets.ts), each faced by its own
 *  committed render of the canonical subject. Picking one does not reference
 *  an existing theme: the wizard MINTS a locked theme from it at create, with
 *  that render as the approved proof — the style stage's sub-line says so. */
/* BORROWED, on a hero card. The `borrowed` case — a preset offered to a
 * discipline it was not written for — used to be an amber chip on every card.
 * The chips are gone, and the disclosure is NOT: the stage's own sub-line
 * (CreateWizard#stages, the style stage) already says it in full and only when
 * it is true, naming the discipline and what picking one means. That is the
 * better home for it — it is a fact about the whole hand, not about one card,
 * and it was repeated six times. */
export function presetCards(presets: Preset[]): DeckCardSpec[] {
  return presets.map((p) => ({
    id: presetCardId(p),
    title: p.name,
    density: "hero" as const,
    art: {
      kind: "image" as const,
      src: thumbSrc(p.id),
      alt: `${p.name} rendered on the canonical subject`,
      fallback: { hexes: p.block.palette.map((c) => c.hex) },
    },
  }));
}

/* ── The empty style deck — honest, and it routes ─────────────────────────── */

export function EmptyStyleDeck({ discipline }: { discipline: Discipline }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-8 text-center">
      <p className="font-instrument text-2xl text-amber-100">
        No locked style fits {DISCIPLINE_LABEL[discipline].toLowerCase()} yet
      </p>
      <p className="font-hanken mt-3 text-content leading-relaxed text-amber-100/80">
        Every frame a project renders is built on a locked visual identity, and this account has
        none that fits. Styles are commissioned in the library — a style from a brief fits every
        discipline. Your picks here are kept while you go back a stage.
      </p>
      <Link
        href="/library"
        className="font-jetbrains mt-5 inline-block rounded-lg border border-amber-300/40 px-4 py-2 text-label text-amber-100 transition hover:bg-amber-300/10"
      >
        commission one in the library →
      </Link>
    </div>
  );
}

/* ── Stage 4 — not cards: the name, and the runtime ───────────────────────── */

/** PLACEHOLDERS TEACH THE SHAPE, NOT THE CONTENT (cx 2026-09-08).
 *
 *  Both text fields used to carry the seeded demo's own identity: the title
 *  said `Glass Harbor` and the logline was, character for character, the
 *  `logline` of the `seed-glass-harbor` record in app/_studio/projectSeed.ts.
 *  The shelf now marks those records AS demos (b49e8bd), which left this stage
 *  as the last screen presenting the fixture as the user's exemplar — and it
 *  did so at the one moment the user is inventing their own.
 *
 *  What a placeholder owes the user in this field is the KIND of thing that
 *  goes in it: short, and a claim rather than a topic. The logline's is written
 *  per discipline because a claim is not the same object in each — the
 *  educational contract argues something, the promotional one opens a debt
 *  another artifact pays (lib/projects#DISCIPLINE_NOTE), and free form is
 *  promised nothing at all. */
const LOGLINE_PLACEHOLDER: Record<Discipline, string> = {
  educational: "The claim this one argues — one sentence.",
  trailer: "The debt this cut opens — one sentence.",
  free: "What this one is about — one sentence.",
};

/** How many characters are left, or `null` while the cap is still none of the
 *  user's business.
 *
 *  A COUNTER THAT IS ALWAYS ON IS A QUOTA. `maxLength` truncates in silence —
 *  typing simply stops, with nothing on screen having said a cap existed — but
 *  an 80-character title is a limit ~nobody meets, so a permanent `0/80` would
 *  be noise on every create to disclose something that bites on almost none of
 *  them. It appears with 20 left instead: enough room to finish the word being
 *  typed, or to decide which one to cut, and it reaches 0 saying why the keys
 *  stopped doing anything. */
const CAP_WARN_AT = 20;
const charsLeft = (value: string, max: number): number | null =>
  max - value.length <= CAP_WARN_AT ? max - value.length : null;

/** The counter itself — mono and a shade brighter than the prose it may be
 *  appended to, so it reads as the new thing on a line the user already read.
 *  It states the number in words, so colour is not carrying it alone.
 *
 *  ITS OWN LINE, in both fields, and neither an inline suffix nor a margin.
 *  Both alternatives were captured on 2026-09-08 and both were worse: an `ml-2`
 *  read as a stray indent on the title, where the counter is the whole hint and
 *  has nothing to be indented from; and appending it to the logline's sentence
 *  behind a `·` wrapped, which left the separator alone at the head of the next
 *  line looking like a bullet. A line of its own is the one shape that reads
 *  the same under a field with a hint and under a field without one. */
function CapLeft({ n }: { n: number }) {
  return <span className="font-jetbrains block text-slate-300">{n} characters left</span>;
}

export function NameStage({
  title,
  logline,
  targetS,
  discipline,
  template,
  styleName,
  ownDuration,
  onTitle,
  onLogline,
  onDuration,
}: {
  title: string;
  logline: string;
  targetS: number;
  discipline: Discipline;
  template: TemplateId;
  /** The picked style's name — the permanence line below names it. Optional
   *  only because a locked theme could fail to resolve; the line degrades to
   *  the fact without the name rather than disappearing. */
  styleName?: string;
  /** Whether the runtime number is the user's or still the template's — the
   *  wizard's `ownDuration` latch, shown rather than only obeyed. */
  ownDuration: boolean;
  onTitle: (v: string) => void;
  onLogline: (v: string) => void;
  /** Fires with the user's number — taking it is taking OWNERSHIP of the
   *  runtime (the `ownDuration` latch lives in the wizard). */
  onDuration: (v: number) => void;
}) {
  const tpl = templateOf(template);
  const titleLeft = charsLeft(title, 80);
  const loglineLeft = charsLeft(logline, 240);
  return (
    <div className="gt-rise mx-auto grid w-full max-w-xl gap-5">
      <Field
        label="Project name"
        htmlFor="w-title"
        // No standing hint on this field: the counter IS the hint, and only
        // once it has something to say.
        hint={titleLeft !== null ? <CapLeft n={titleLeft} /> : undefined}
      >
        <TextInput
          id="w-title"
          autoFocus
          value={title}
          placeholder="A short working title"
          maxLength={80}
          onChange={(e) => onTitle(e.target.value)}
        />
      </Field>

      <Field
        label="Logline"
        htmlFor="w-logline"
        hint={
          <>
            Optional — one sentence. It is what the script step argues back against.
            {loglineLeft !== null && <CapLeft n={loglineLeft} />}
          </>
        }
      >
        <TextArea
          id="w-logline"
          rows={2}
          value={logline}
          placeholder={LOGLINE_PLACEHOLDER[discipline]}
          maxLength={240}
          onChange={(e) => onLogline(e.target.value)}
        />
      </Field>

      <Field
        // WHOSE NUMBER THIS IS, said in the label (cx 2026-09-08). The wizard
        // already MODELS the distinction — `ownDuration` decides whether
        // picking a template moves the number — and the screen showed none of
        // it: 30 looked like a value the user had set. It goes in the label
        // rather than the hint because the hint under this field is already
        // carrying the craft band (and, for a trailer, an n=0 disclosure), and
        // a provenance note is not allowed to compete with that. Said this way
        // it is also the accessible name, and it explains the surprise the
        // latch causes: go Back, pick a different template, and the number
        // does not move once it is yours.
        label={ownDuration ? "Target runtime · yours" : "Target runtime · the template's"}
        htmlFor="w-dur"
        hint={
          // Same honesty rule as the dialog: free form has no measured band —
          // its range is only what the input accepts.
          discipline === "free"
            ? "Nothing was measured for a free-form video. There is no craft band here; the studio only keeps time."
            : discipline === "trailer"
              ? `${tpl.label}'s band is ${tpl.range[0]}–${tpl.range[1]}s, sourced from the craft library — nothing was measured for it in this studio yet (n=0).`
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

      {/* WHAT THE BUTTON MAKES PERMANENT — the last thing in the form column,
          so it is the last thing crossed on the way from the name field to
          "Create & open". It cannot go BESIDE that button: the footer's
          forward half is Deck's, and Deck only renders text there while the
          stage is blocked (Deck#blockedHint) — by the time this line matters
          the stage is done and that slot is empty by contract.

          Three decisions arrive at this stage as ✓ chips in the rail and read
          as equally revisable. One is not: the style is immutable on edit
          (ProjectDialog:109, and its EDIT dialog says "Fixed at creation" in
          the same words), while name, logline and runtime are the editable
          fields of the same record. Stated as fact, not warned about — Back is
          still one click away, and this repo has just removed an amber banner
          that alarmed people about a non-problem (b49e8bd). */}
      <p className="font-hanken border-t border-white/8 pt-4 text-content leading-relaxed text-slate-400">
        <span className="text-slate-300">{styleName ?? "The style you picked"}</span> is fixed at
        creation — every frame renders against it. The name, logline and runtime stay editable.
      </p>
    </div>
  );
}
