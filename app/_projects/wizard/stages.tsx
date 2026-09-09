"use client";

// The create wizard's stages: what each deck of cards SAYS, built from the same
// catalogues the expert dialog reads (lib/projects, lib/themes) — the wizard is
// a different face on the same facts, never a second copy of them.

import Link from "next/link";

import type { DeckCardSpec } from "@/components/ui/deck/DeckCard";
import { Field, NumberInput, TextArea, TextInput } from "@/components/ui/Field";
import { BandTrack, Hint } from "@/components/ui/signal";
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
    // The manifest key is the whole art declaration now. It used to be
    // accompanied by `artVariant: "emblem"` — a per-card pin that beat a global
    // bake-off switcher — and the switcher was removed on the operator's ruling
    // (2026-09-08). The verdict did not change: `discipline-*` draws its emblem,
    // declared once for the family in components/ui/deck/artVariants.tsx.
    art: { kind: "gradient", tone: DISCIPLINE_TONE[d], manifestKey: `discipline-${d}` },
  }));
}

/** The craft band, said in the unit a person thinks in. Minutes once the top of
 *  the band reaches two of them, seconds below that — so a clip reads "15–60 s"
 *  and a mid-length explainer reads "3–6 min" rather than "180–360 s". A half
 *  survives (`1.5–2.5 min`, the trailer's real 90–150s); a trailing `.0` does
 *  not. */
function bandWords(range: readonly [number, number]): string {
  if (range[1] < 120) return `${range[0]}–${range[1]} s`;
  const min = (s: number) => String(Math.round((s / 60) * 2) / 2).replace(/\.0$/, "");
  return `${min(range[0])}–${min(range[1])} min`;
}

/** HOW LONG THIS FORMAT RUNS, on the card that picks it (operator, 2026-09-09).
 *
 *  This reverses one line of the 2026-09-06 density verdict, and only that one:
 *  the card carried no runtime, so the whole template stage was a choice
 *  between seven names with the single fact that separates them held back until
 *  the stage after next. Everything else the hero pass removed — the pitch, the
 *  chip counting templates, the eyebrow repeating the stage label — stays gone.
 *
 *  It is the BAND, not the default: what the user is choosing here is a format,
 *  and a format is a window. The name stage still draws that window as a rail
 *  with the user's own number on it (RuntimeBand), including the hatch and the
 *  n=0 disclosure for the promotional formats — that claim lives where the
 *  number is actually chosen, and this line does not restate it.
 *
 *  Free form is the one card with nothing to state: its `range` is the input's
 *  own domain rather than a measurement (lib/projects.ts says so at the entry),
 *  and printing it as a band here would be the lie RuntimeBand's free branch is
 *  careful not to tell. */
export function templateBandWords(id: TemplateId): string {
  return id === "free-form" ? "any length" : bandWords(templateOf(id).range);
}

export function templateCards(discipline: Discipline): DeckCardSpec[] {
  return templatesFor(discipline).map((t) => ({
    id: t.id,
    title: t.label,
    density: "hero" as const,
    footnote: templateBandWords(t.id),
    // Same story as the discipline stage above: the key is the declaration, the
    // `template-*` family draws its emblem, and the pin that used to say so is
    // gone with the switcher it existed to override.
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

/** THE ABSENCE, WHERE A CARD WOULD BE.
 *
 *  This was a 40-word amber paragraph in a panel: "Every frame a project
 *  renders is built on a locked visual identity, and this account has none that
 *  fits. Styles are commissioned in the library — a style from a brief fits
 *  every discipline. Your picks here are kept while you go back a stage." Three
 *  sentences, and only the middle one had anything the user could act on.
 *
 *  Sentence one is the rule the whole stage exists to enforce — restating it
 *  inside the stage is the app explaining why it is asking. Sentence three
 *  reassures about a loss that cannot happen: the deck discards nothing going
 *  backward and its rail is showing the two ✓ summaries while this renders.
 *  What survives is the fact (no style fits THIS discipline), the shape (a card
 *  slot with a hollow swatch where a style's face would be), and the route. */
export function EmptyStyleDeck({ discipline }: { discipline: Discipline }) {
  return (
    // +20% on the stage block (operator, 2026-09-09) — max-w-xs → 24rem, the
    // same proportion the name stage takes below, so the two non-deck stages
    // stay one column width rather than drifting apart.
    <div className="mx-auto w-full max-w-[24rem]">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-amber-300/30 bg-amber-300/[0.03] p-6 text-center">
        {/* The hollow twin of a style card's face — same slot, no style in it. */}
        <span
          aria-hidden
          className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-amber-300/25"
        >
          <span className="h-3 w-12 rounded-full border border-dashed border-amber-300/40" />
        </span>
        <p className="font-instrument text-2xl text-amber-100">
          No style fits {DISCIPLINE_LABEL[discipline].toLowerCase()}
        </p>
        <Link
          href="/library"
          className="font-jetbrains rounded-lg border border-amber-300/40 px-4 py-2 text-label text-amber-100 transition hover:bg-amber-300/10"
        >
          commission one in the library →
        </Link>
      </div>
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

/* ── The runtime, as a window rather than a sentence ──────────────────────── */

/** What the number input itself accepts. Named because the free-form rail is
 *  scaled to exactly this and to nothing else — with no measured band, the only
 *  true thing to draw is the range of answers the control will take. */
export const DUR_MIN = 5;
export const DUR_MAX = 900;

/** The craft band, drawn — shared by the wizard's name stage and the expert
 *  dialog, so the two faces of project creation cannot drift into two pictures
 *  of the same fact (they had drifted into two spellings of the same paragraph:
 *  the dialog's version carried two of the three branches and never grew the
 *  trailer's n=0 disclosure).
 *
 *  THE RAIL'S DOMAIN IS NOT THE INPUT'S. At 5–900s a 90–150s window is a 7%
 *  sliver against which no thumb position means anything. The domain is drawn
 *  from the band itself — twice its top, or far enough to hold the user's own
 *  number — so the window occupies the middle of the rail and "outside it" is a
 *  visible distance rather than a rounding error. The printed bounds are the
 *  band's real numbers either way; the scale is how the picture is framed, not
 *  what it claims.
 *
 *  Free form is the one case with no band at all: `range` there is only what
 *  the input accepts, so drawing it as a measured window would be a lie the old
 *  prose was careful not to tell ("Nothing was measured for a free-form
 *  video"). It gets a plain rail over the input's own domain and no window. */
export function RuntimeBand({
  targetS,
  discipline,
  template,
}: {
  targetS: number;
  discipline: Discipline;
  template: TemplateId;
}) {
  const tpl = templateOf(template);
  if (discipline === "free") {
    return (
      <BandTrack
        value={targetS}
        min={DUR_MIN}
        max={DUR_MAX}
        unit="s"
        label={`${tpl.label} — no measured band`}
      />
    );
  }
  // Trailer bands come from the craft library with nothing measured for them in
  // this studio (n=0, uat 2026-09-05 MA-L1-4). `hatchBand` stripes the window
  // so a stand-in never reads as a measurement, and BandTrack says so in its
  // own accessible name; the Hint carries the number that makes the claim
  // checkable, which is the half a hatch pattern cannot draw.
  const sourced = discipline === "trailer";
  return (
    <span className="block">
      <BandTrack
        value={targetS}
        min={0}
        max={Math.max(tpl.range[1] * 2, targetS + 30)}
        // Copied, not passed through: the catalogue's `range` is a readonly
        // tuple (lib/projects.ts) and BandTrack takes a mutable pair — a
        // catalogue entry no consumer can edit is the point of the readonly.
        band={[tpl.range[0], tpl.range[1]]}
        hatchBand={sourced}
        unit="s"
        label={tpl.label}
      />
      {sourced && (
        <span className="font-jetbrains mt-1 inline-flex items-center gap-1 text-label text-white/40">
          sourced
          <Hint variant="warn" tone="amber" label="Why this band is a stand-in">
            from the craft library; nothing measured it here (n=0)
          </Hint>
        </span>
      )}
    </span>
  );
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
  const titleLeft = charsLeft(title, 80);
  const loglineLeft = charsLeft(logline, 240);
  return (
    // +20% (operator, 2026-09-09): max-w-xl is 36rem, and the form was
    // reading as a narrow column under a full-width headline — the fields, the
    // runtime rail and the permanence line all want the extra measure.
    <div className="gt-rise mx-auto grid w-full max-w-[43.2rem] gap-5">
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

      {/* `Optional` MOVED INTO THE LABEL, and the rest of the hint went.
          It read "Optional — one sentence. It is what the script step argues
          back against." One sentence is what the placeholder demonstrates, per
          discipline, in the field itself (LOGLINE_PLACEHOLDER above); what a
          later step does with the answer is a fact about the app's wiring, and
          the script step makes it in front of the user when it gets there.
          Optional-ness is the one bit the field itself cannot show, so it rides
          on the label — where the runtime field already carries its provenance
          the same way, and where it is part of the accessible name. */}
      <Field
        label="Logline · optional"
        htmlFor="w-logline"
        hint={loglineLeft !== null ? <CapLeft n={loglineLeft} /> : undefined}
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

      {/* THE BAND SITS BESIDE THE FIELD, NOT IN ITS `hint`. Field renders its
          hint inside a <p> (components/ui/Field.tsx), and BandTrack's root is a
          <div> — nesting them is invalid HTML and React says so at runtime as a
          hydration error (measured: two dev-overlay issues on this stage). The
          wrapper keeps the two as one item in the form's `gap-5` grid, so the
          rail reads as part of the runtime control rather than a fourth field. */}
      <div className="grid gap-1.5">
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
        // THE BAND IS A PICTURE NOW, NOT THREE BRANCHES OF PROSE. It read, per
        // branch, up to 27 words — "…was measured at 90–150s. Past that band
        // the craft rules stop applying." / "…sourced from the craft library —
        // nothing was measured for it in this studio yet (n=0)." / "Nothing was
        // measured for a free-form video…". The BRANCH was the picture: the
        // whole content of those sentences is where the number sits relative to
        // a window, and whether the window is a measurement at all.
        //
        // BandTrack draws exactly that and keeps every figure: the two bounds
        // are printed under the rail, the thumb turns amber outside them, and
        // `hatchBand` stripes a window nothing measured. Its `role="img"` name
        // says the same in words for a screen reader, so nothing that was
        // spoken stopped being spoken.
        >
          <NumberInput
            id="w-dur"
            unit="s"
            min={DUR_MIN}
            max={DUR_MAX}
            value={targetS}
            onChange={(e) => onDuration(Number(e.target.value) || 0)}
          />
        </Field>
        <RuntimeBand targetS={targetS} discipline={discipline} template={template} />
      </div>

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
