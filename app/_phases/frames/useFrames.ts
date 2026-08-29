"use client";

// Frames state for one project: derive from the script, author the scene
// prompts, generate plates, bind texts to facts — and SURVIVE A RELOAD.
//
// Persistence is not a nicety here. A plate costs real money and a full cut is
// sixteen of them, so an in-memory step throws away several dollars and an
// evening's judgement on a refresh. Frames go to the same per-project step
// store the research and script steps use.
//
// Size note, stated because it will bite eventually: a plate is held as a data:
// URL, so a fully composed sixteen-frame cut is roughly 5MB in IndexedDB. Fine
// for one project on one machine; the moment frames need to be shared, plates
// belong in a blob store with the record holding a pointer, exactly as
// lib/assets.ts already does.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { accessHeader, generateImage, imgSrc, ImagingRequestError } from "@/lib/imagingClient";
import { getProject, reportPhase, type PhaseState, type Project } from "@/lib/projects";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";
import { projectStyle, STYLE_MISS_WORD, styleRefs, type StyleBlock } from "@/lib/themes";
import { useThemes } from "@/lib/useThemes";
import { useAuth } from "@/lib/useAuth";

import { PRESETS } from "@/app/library/presets";
import {
  readStep,
  reportStorageTrouble,
  saveStep,
  type BeatPicksStepData,
  type StorageTrouble,
  type TrailerCutStepData,
} from "../_shared/stepStore";
import { FACTS } from "../_shared/notebook/facts";
import { RENDERS } from "../script/renders";
import {
  absentTrailerRender,
  authoredClipCount,
  composedCount,
  emptyClip,
  explainerRender,
  framesFor,
  framesLane,
  subjectFor,
  trailerRender,
  withClips,
  type DirectionSpend,
  type Frame,
  type FrameElement,
  type FramesRender,
  type FrameText,
} from "./frames";
import { applySceneSpecs, reviewSceneSpecs, SceneSpecError, SCENE_SCHEMA } from "./sceneSpec";

const PHASE = "frames";
/** Step 1's record — read here for ONE field, `mode`, and only for a `free`
 *  project, which is the single case the project record alone cannot route. */
const PICKS_PHASE = "research-beats";
/** Step 2's trailer half. This step READS it and never writes it: a downstream
 *  step that seeded the upstream step's record would be inventing the artifact
 *  it exists to read. */
const TRAILER_PHASE = "script-trailer";

/** The explainer's candidate chain. Still positional, still `RENDERS[0]`, and
 *  the reason is written on `explainerRender` in ./frames — nothing in this app
 *  records WHICH candidate script a project accepted, so there is nothing in the
 *  record to resolve against yet. What the record now decides is the LANE. */
const FIXTURE = RENDERS[0];

/**
 * What `render` reads as before the project record has been read.
 *
 * It is never drawn. `loaded` is false until the chain resolves and FramesStep
 * renders nothing above that gate; this exists so `render` can be a non-null
 * `FramesRender` for the two surfaces that read `.title` off it, rather than a
 * nullable field every caller has to guard for a value with a one-render
 * lifetime. It carries ZERO beats and names itself, so in the event it ever does
 * reach a surface, the surface says "nothing here yet" instead of drawing
 * somebody else's cut — which is the exact failure this whole change is about.
 */
const UNRESOLVED: FramesRender = {
  id: "unresolved",
  title: "",
  engineLabel: "reading the project record…",
  template: "",
  durationS: 0,
  beats: [],
  origin: "no-spine",
};

/** What one `generatePlate` call ended as. See the doc on `generatePlate`. */
export type PlateOutcome = "ready" | "refused" | "failed";

interface FramesStepData {
  frames: Frame[];
  /** Which script render the frames were derived from. A different render is a
   *  different cut, so the frames are stale rather than merely out of date. */
  renderId: string;
  /** What the art-direction passes cost. Persisted with the step because the
   *  money was spent on the step, not on the session — a reload that forgets it
   *  turns the header's spend line back into an undercount. */
  direction?: DirectionSpend;
  savedAt?: number;
}

export function useFrames(projectId: string) {
  const { user } = useAuth();
  const { themes } = useThemes(user?.uid ?? null);

  /* ── the style THIS project chose ───────────────────────────────────────── */
  // The record is read here for one field, `themeId`. It used to be ignored
  // entirely: the block below was the account's most recently touched lock, so
  // a user picked a style at creation, the app gated on it, and then every
  // plate came back in somebody else's identity. lib/themes.ts#projectStyle is
  // now the ONE resolver; this hook only decides what to draw when it misses.
  const [project, setProject] = useState<Project | null>(null);
  const [projectRead, setProjectRead] = useState(false);

  const chosen = projectStyle(themes ?? [], project?.themeId);
  const fallback = PRESETS[0];
  const block: StyleBlock = chosen.theme?.block ?? fallback.block;
  /** The identity on screen, said out loud. A fallback NAMES ITSELF as one and
   *  says why — the surface renders this in amber when `hasProjectStyle` is
   *  false, and a stand-in the user cannot see is the bug being fixed here. */
  const styleName = chosen.theme
    ? chosen.theme.name
    : `${fallback.name} — a fallback preset, because ${STYLE_MISS_WORD[chosen.miss]}`;
  /** Both reads have to land before the label means anything: mid-load, a
   *  project whose style is perfectly fine looks exactly like one whose style
   *  was deleted. It is folded into `loaded` below rather than flashed. */
  const styleReady = projectRead && themes !== null;
  /** The image half of the style contract. Text without references holds the
   *  nameable attributes and loses everything language cannot pin down — the
   *  playground's own control-arm run measured conditioning at 67% palette
   *  retention vs 33% for the block alone (docs/imaging.md). The production
   *  path was the one caller still generating text-only against a theme whose
   *  approved sheet existed for exactly this. Empty for a fallback preset,
   *  which has no sheet — the block alone is then the honest floor. */
  const references = useMemo(() => styleRefs(chosen.theme), [chosen.theme]);

  /* ── the CHAIN this project is working on ────────────────────────────────
   *
   * This was `const render = RENDERS[0]` — the explainer fixture, for every
   * project, whatever its record said. See the header of ./frames for what that
   * cost. The record decides the lane; a trailer project's chain is read from
   * the spine Step 2 composed, and a trailer project that has not composed one
   * gets an absence that says so rather than a stranger's argument.
   *
   * `null` means NOT RESOLVED YET, and nothing downstream may derive, save or
   * report while it holds — the effects below are all gated on it.
   */
  const [source, setSource] = useState<FramesRender | null>(null);
  const render = source ?? UNRESOLVED;

  const [frames, setFrames] = useState<Frame[]>([]);
  const [stepLoaded, setStepLoaded] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** What the art-direction passes have cost this cut. Null until one has run —
   *  which is absence, and reads as absence, rather than $0.00. */
  const [direction, setDirection] = useState<DirectionSpend | null>(null);

  /* ── load ───────────────────────────────────────────────────────────────── */
  /** The read that did not happen, when one did not.
   *
   *  `loadStep` flattens a FAILED read and a NEVER-WRITTEN key to the same
   *  `undefined` — its own doc says "a caller that needs to tell the two apart
   *  calls `readStep` instead", and this is that caller. The two are opposites
   *  here: a never-written key means derive a fresh cut, and a failed read means
   *  a cut worth several dollars of plates is on disk and out of reach. Taking
   *  the first branch on the second fact re-derived seeded frames over it and
   *  the debounced save below then wrote them to the key 600ms later, which is
   *  the whole cut destroyed by a transient quota error nobody saw. */
  const [loadTrouble, setLoadTrouble] = useState<StorageTrouble | null>(null);

  /* THE RECORD READ, AND WHAT IT DECIDES.
   *
   * One effect rather than two, because the second read DEPENDS on the first:
   * which step store holds this project's chain is a fact about its discipline.
   * `readStep` throughout, not `loadStep` — for the same reason the frames read
   * below uses it. A failed read of the trailer step and a project that never
   * composed a spine flatten to the same `undefined` under `loadStep`, and they
   * mean opposite things: one is "nothing was written", the other is "a composed
   * spine is on disk and out of reach". Drawing the first over the second is how
   * a step tells a creator their work is gone. */
  useEffect(() => {
    let alive = true;
    setSource(null);
    void (async () => {
      const p = await getProject(projectId).catch(() => undefined);
      if (!alive) return;
      setProject(p ?? null);
      setProjectRead(true);

      // The picks record is read ONLY for a `free` project, which is the one
      // case the project record cannot route on its own — the same rule
      // ScriptStep applies, held in ./frames#framesLane so the two steps cannot
      // disagree about which half of the app a project is in.
      let mode: string | undefined;
      if ((p?.discipline ?? "educational") === "free") {
        const picks = await readStep<BeatPicksStepData>(projectId, PICKS_PHASE);
        if (!alive) return;
        if (!picks.ok) {
          setLoadTrouble(picks.trouble);
          setStepLoaded(true);
          return;
        }
        mode = picks.data?.mode;
      }

      if (framesLane(p?.discipline, mode) === "explainer") {
        setSource(explainerRender(FIXTURE));
        return;
      }

      const saved = await readStep<TrailerCutStepData>(projectId, TRAILER_PHASE);
      if (!alive) return;
      if (!saved.ok) {
        setLoadTrouble(saved.trouble);
        setStepLoaded(true);
        return;
      }
      const cut = saved.data?.cut;
      // A cut with no beats is not a cut. It is the same absence as no record at
      // all and it is drawn the same way — an empty shot table would read as
      // "this spine decomposed into nothing", which is the opposite of true.
      setSource(
        cut && cut.beats.length > 0
          ? trailerRender(cut, { template: p?.template ?? "trailer", durationS: p?.targetS ?? 0 })
          : absentTrailerRender({
              title: p?.title ?? "this project",
              template: p?.template ?? "trailer",
              durationS: p?.targetS ?? 0,
            }),
      );
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    void (async () => {
      const read = await readStep<FramesStepData>(projectId, PHASE);
      if (!alive) return;
      if (!read.ok) {
        // Nothing is derived and nothing is armed — see the save effect's gate.
        // The step says it cannot read rather than showing an empty ledger,
        // which would read as "this project has no frames".
        setLoadTrouble(read.trouble);
        setStepLoaded(true);
        return;
      }
      const stored = read.data;
      // A stored cut derived from a DIFFERENT render is not this cut. Re-derive
      // rather than showing frames whose beats no longer exist. This is also
      // what retires the explainer frames a TRAILER project accumulated while
      // this step handed every project `RENDERS[0]`: the chain id changed, so
      // they read as stale, which is exactly what they are.
      const sameCut = Boolean(stored?.frames?.length && stored.renderId === source.id);
      setFrames(
        sameCut && stored
          ? // A cut stored before Frames inherited the clip has no clip on it.
            withClips(stored.frames)
          : framesFor(source, FIXTURE),
      );
      // The spend belongs to the cut it directed. A different render throws the
      // frames away, and carrying its bill onto the new ones would be the same
      // lie as omitting it — a figure that describes work not on screen.
      setDirection(sameCut ? (stored?.direction ?? null) : null);
      setStepLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, source]);

  /* ── save ───────────────────────────────────────────────────────────────── */
  // Debounced, and never before the first load has landed — writing an empty
  // array over a stored cut is the one bug persistence layers reliably ship.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Gated on the STEP's own load, not on the style: the frames are what is
    // being written, and waiting on a theme read to save them would be a new
    // way to lose a cut.
    if (!stepLoaded || !source) return;
    // AND never after a failed read. `frames` is then whatever this hook has in
    // memory — nothing — and writing that to the key would replace a stored cut
    // we could not read with one we invented.
    if (loadTrouble) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveStep<FramesStepData>(projectId, PHASE, {
        frames,
        renderId: source.id,
        ...(direction ? { direction } : {}),
      });
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frames, direction, stepLoaded, loadTrouble, projectId, source]);

  const patch = useCallback((id: string, fn: (f: Frame) => Frame) => {
    setFrames((fs) => fs.map((f) => (f.id === id ? fn(f) : f)));
  }, []);

  /* ── plates ─────────────────────────────────────────────────────────────── */

  /**
   * How one plate call ended, for a caller running SEVERAL of them.
   *
   * The distinction is the whole point and it is not cosmetic: `refused` is a
   * fact about THIS subject — the vendor looked at it and declined — and the
   * next frame is a different subject that may well be fine. `failed` is a fact
   * about the RUN: no quota, no network, no key. A batch that cannot tell them
   * apart keeps firing the whole cut into a wall it already hit once.
   */
  const generatePlate = useCallback(
    async (id: string): Promise<PlateOutcome> => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return "failed";
      const subject = frame.plate.subject?.trim() || subjectFor(frame);

      setBusy((b) => new Set(b).add(id));
      setError(null);
      patch(id, (f) => ({ ...f, plate: { ...f.plate, state: "generating", subject } }));

      try {
        const res = await generateImage({
          prompt: compilePrompt(block, subject),
          negativePrompt: NEGATIVE_PROMPT,
          aspect: "16:9",
          count: 1,
          references: references.length ? references : undefined,
        });
        const img = res.images[0];
        patch(id, (f) => ({
          ...f,
          plate: {
            state: img ? "ready" : "refused",
            src: img ? imgSrc(img) : undefined,
            model: res.provenance.model,
            costUsd: res.provenance.costUsd,
            subject,
          },
        }));
        return img ? "ready" : "refused";
      } catch (e) {
        const refused = e instanceof ImagingRequestError && e.code === "refused";
        patch(id, (f) => ({
          ...f,
          plate: { ...f.plate, state: refused ? "refused" : "empty", subject, note: e instanceof Error ? e.message : undefined },
        }));
        setError(e instanceof Error ? e.message : "The plate could not be generated.");
        return refused ? "refused" : "failed";
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(id);
          return n;
        });
      }
    },
    [frames, block, references, patch],
  );

  /* ── layers ─────────────────────────────────────────────────────────────── */

  const setSubject = useCallback(
    (id: string, subject: string) => patch(id, (f) => ({ ...f, plate: { ...f.plate, subject } })),
    [patch],
  );

  /** Author what the plate DOES. Only ever authoring — nothing in this app can
   *  render a clip, so there is no generate counterpart to this and the surface
   *  says as much rather than offering a button that cannot fire. */
  const setMotion = useCallback(
    (id: string, motion: string) => patch(id, (f) => ({ ...f, clip: { ...(f.clip ?? emptyClip()), motion } })),
    [patch],
  );

  const setText = useCallback(
    (id: string, textId: string, value: string) =>
      patch(id, (f) => ({ ...f, texts: f.texts.map((t) => (t.id === textId ? { ...t, value } : t)) })),
    [patch],
  );

  /** Bind a text layer to the notebook fact it asserts — or unbind it.
   *
   *  This is the integrity gate the whole step exists to hold. A figure on a
   *  frame is a CLAIM being made to a viewer; if it is not traceable to a
   *  sourced, dated fact then nobody checked it, and the canvas marks it. */
  const bindFact = useCallback(
    (id: string, textId: string, factId: string | undefined) =>
      patch(id, (f) => ({ ...f, texts: f.texts.map((t) => (t.id === textId ? { ...t, factId } : t)) })),
    [patch],
  );

  const addText = useCallback(
    (id: string, role: FrameText["role"]) =>
      patch(id, (f) => ({
        ...f,
        texts: [
          ...f.texts,
          { id: `t-${f.id}-${Date.now().toString(36)}`, role, value: role === "figure" ? "0" : "new line", x: 6, y: 44 },
        ],
      })),
    [patch],
  );

  const removeText = useCallback(
    (id: string, textId: string) => patch(id, (f) => ({ ...f, texts: f.texts.filter((t) => t.id !== textId) })),
    [patch],
  );

  /* ── layout ─────────────────────────────────────────────────────────────── */

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  /** Move a layer to an absolute position, in percent of the frame.
   *
   *  Absolute rather than a delta: a drag emits many moves, and accumulating
   *  deltas drifts against the pointer as rounding compounds. The canvas knows
   *  where the pointer is; it should say so. */
  const moveLayer = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }, x: number, y: number) =>
      patch(id, (f) =>
        ref.type === "element"
          ? { ...f, elements: f.elements.map((e) => (e.id === ref.id ? { ...e, x: clamp(x), y: clamp(y) } : e)) }
          : { ...f, texts: f.texts.map((t) => (t.id === ref.id ? { ...t, x: clamp(x), y: clamp(y) } : t)) },
      ),
    [patch],
  );

  /** Resize an element. Texts have no box — they are set in type and size with
   *  their role, so a resize handle on one would be a lie. */
  const resizeElement = useCallback(
    (id: string, elId: string, w: number, h: number) =>
      patch(id, (f) => ({
        ...f,
        elements: f.elements.map((e) =>
          e.id === elId ? { ...e, w: Math.max(2, clamp(w)), h: Math.max(2, clamp(h)) } : e,
        ),
      })),
    [patch],
  );

  /** Reorder within a layer group. Array order IS paint order, so this is the
   *  z-control — and it stays WITHIN elements or WITHIN texts on purpose:
   *  texts always paint above elements, because a caption behind an arrow is
   *  not a look, it is a bug. */
  const reorderLayer = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }, dir: -1 | 1) =>
      patch(id, (f) => {
        const key = ref.type === "element" ? "elements" : "texts";
        const list = [...(f[key] as (FrameElement | FrameText)[])];
        const i = list.findIndex((l) => l.id === ref.id);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= list.length) return f;
        [list[i], list[j]] = [list[j], list[i]];
        return { ...f, [key]: list } as Frame;
      }),
    [patch],
  );

  const toggleHidden = useCallback(
    (id: string, ref: { type: "element" | "text"; id: string }) =>
      patch(id, (f) =>
        ref.type === "element"
          ? { ...f, elements: f.elements.map((e) => (e.id === ref.id ? { ...e, hidden: !e.hidden } : e)) }
          : { ...f, texts: f.texts.map((t) => (t.id === ref.id ? { ...t, hidden: !t.hidden } : t)) },
      ),
    [patch],
  );

  const removeElement = useCallback(
    (id: string, elId: string) => patch(id, (f) => ({ ...f, elements: f.elements.filter((e) => e.id !== elId) })),
    [patch],
  );

  const reset = useCallback(() => {
    // Nothing to reset to until the chain is known — and re-deriving against
    // `UNRESOLVED` would empty the ledger over a cut that is merely still loading.
    if (source) setFrames(framesFor(source, FIXTURE));
  }, [source]);

  /* ── authoring ──────────────────────────────────────────────────────────── */

  const [directing, setDirecting] = useState(false);

  /** What the last pass refused, keyed by the beat it refused, so the ledger can
   *  say it ON that beat's row. A rejection printed as one error line is a
   *  sentence about sixteen frames; printed on a row it is a fix. */
  const [rejections, setRejections] = useState<Record<string, string>>({});
  /** The pass's own summary — partial success, which is neither an error nor
   *  silence and deserves its own voice. */
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Art-direct the whole cut in one pass.
   *
   * One pass over EVERY beat rather than sixteen independent calls, and that is
   * the point rather than an optimisation: the engine can only vary a frame
   * from its neighbours, or carry a motif from the hook into the turn, if it
   * can see them. Per-beat calls would reinvent the lookup table this replaces,
   * just more expensively.
   */
  const direct = useCallback(async () => {
    // A PASS WITH NO BEATS IN IT IS A PAID CALL WITH NOTHING TO SAY.
    //
    // `/api/frames` is the most expensive call in this step and it is billed on
    // the request, not on the usefulness of the answer. Before the chain was
    // resolved from the record every project had sixteen fixture beats and this
    // could not happen; a trailer project now has none — its beats decompose
    // into SHOTS, which this pass does not write — and an empty `beats: []` would
    // have gone to the engine at full price. Refused, with the reason, rather
    // than disabled somewhere the user cannot see why.
    if (frames.length === 0) {
      setNotice(
        render.origin === "explainer-fixture"
          ? "There are no frames to direct."
          : "A trailer's beats decompose into SHOTS, not frames — there is nothing on this ledger for a direction pass to write to, and the pass is billed whether or not it has beats. The shots view carries this cut.",
      );
      return;
    }
    setDirecting(true);
    setError(null);
    setNotice(null);
    setRejections({});
    try {
      const res = await fetch("/api/frames", {
        method: "POST",
        headers: { "content-type": "application/json", ...accessHeader() },
        body: JSON.stringify({
          title: render.title,
          schema: SCENE_SCHEMA,
          style: block,
          // THE FORMAT — the second thing this hook reads the project record for.
          // Until this landed, the direction pass knew the style but not the kind
          // of piece or its length, so a thirty-second clip and a six-minute
          // argument were art-directed against an identical brief. Sent raw and
          // resolved server-side by lib/formatBrief.ts; both are omitted while the
          // record is still loading, and the prompt then says it was not told
          // rather than guessing.
          //
          // A SEAM THIS DOES NOT CLOSE: the beats come from `render`, a fixture,
          // and `ScriptRender` declares a `template` of its own (a loose `string`
          // — app/_phases/script/types.ts:53) which need not agree with the
          // project's. RENDERS[0] says "mid-educational-video" for every project
          // whatever its record says. The record is the right authority — it is
          // what the director chose — but the disagreement is real today, so the
          // prompt's `## The format` §2 tells the model to direct the beats it has
          // and say so, rather than editing them toward a number.
          template: project?.template,
          targetS: project?.targetS,
          facts: FACTS.map((f) => ({ id: f.id, claim: f.claim, confidence: f.confidence, loadBearing: f.loadBearing })),
          beats: frames.map((f) => ({ at: f.at, kind: f.kind, label: f.title, text: f.line, device: f.device })),
        }),
      });
      const json = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error(typeof json.detail === "string" ? json.detail : "The scene direction failed.");

      // The bill, before the parse. `/api/frames` has always returned what this
      // pass cost and how long it took; the client used to destructure `raw`
      // and `detail` and drop `engine` on the floor, which made the header's
      // dollar figure an undercount of the single most expensive call here.
      //
      // Read it before parsing on purpose: a response this app cannot USE was
      // still a response the user PAID for, and a rejected pass that costs
      // nothing on screen is the same lie in a different direction.
      const engine = (json.engine ?? {}) as { costUsd?: unknown; durationMs?: unknown };
      const costUsd = typeof engine.costUsd === "number" && Number.isFinite(engine.costUsd) ? engine.costUsd : undefined;
      const durationMs =
        typeof engine.durationMs === "number" && Number.isFinite(engine.durationMs) ? engine.durationMs : undefined;
      setDirection((d) => ({
        runs: (d?.runs ?? 0) + 1,
        costUsd: (d?.costUsd ?? 0) + (costUsd ?? 0),
        // A pass the engine did not price is COUNTED, not assumed free. It is
        // what turns the total into a floor, and the header says so.
        unpriced: (d?.unpriced ?? 0) + (costUsd === undefined ? 1 : 0),
        lastMs: durationMs,
        lastAt: Date.now(),
      }));

      // The grade travels with the ids. Passing only the id set proved a
      // citation resolved and let a `low` fact be drawn as an exact figure.
      const report = reviewSceneSpecs(
        String(json.raw ?? ""),
        frames,
        new Set(FACTS.map((f) => f.id)),
        new Map(FACTS.map((f) => [f.id, f.confidence])),
      );
      // Apply what survived. Rejected and unmentioned beats keep exactly what
      // they had — applySceneSpecs only touches frames it has a spec for.
      setFrames((fs) => applySceneSpecs(fs, report.specs));

      // Findings go to the rows they belong to. A rejection for a timestamp
      // that is not in this script has no row, so it goes to the summary.
      const inScript = new Set(frames.map((f) => f.at));
      const notes: Record<string, string> = {};
      for (const r of report.rejected) if (inScript.has(r.beatAt)) notes[r.beatAt] = r.reason;
      for (const at of report.missing) notes[at] = "The pass returned no scene for this beat.";
      setRejections(notes);

      const orphans = report.rejected.filter((r) => !inScript.has(r.beatAt));
      if (report.rejected.length || report.missing.length) {
        const parts = [`${report.specs.length} of ${frames.length} beats directed`];
        if (report.rejected.length) parts.push(`${report.rejected.length} rejected`);
        if (report.missing.length) parts.push(`${report.missing.length} with no scene returned`);
        setNotice(
          `${parts.join(" · ")}. ${
            report.specs.length ? "The reasons are on those rows; every other beat was applied." : "Nothing was applied."
          }${orphans.length ? ` The engine also invented ${orphans.map((o) => `"${o.beatAt}"`).join(", ")}.` : ""}`,
        );
      }
    } catch (e) {
      setError(
        e instanceof SceneSpecError
          ? `The engine returned direction this app cannot use: ${e.message} Nothing was changed.`
          : e instanceof Error
            ? e.message
            : "The scene direction failed.",
      );
    } finally {
      setDirecting(false);
    }
  }, [frames, block, render.title, render.origin, project?.template, project?.targetS]);

  /** What the plates cost. Kept apart from the direction pass rather than
   *  merged: one is many small charges the user makes one at a time, the other
   *  is one large charge they make rarely, and a single opaque figure lets
   *  neither be reasoned about. */
  const plateCost = useMemo(() => frames.reduce((t, f) => t + (f.plate.costUsd ?? 0), 0), [frames]);
  /** Everything this step has spent, as far as anyone knows. A floor whenever
   *  `direction.unpriced` is above nought. */
  const totalCost = plateCost + (direction?.costUsd ?? 0);
  /** Figures asserting something nobody sourced. The number that should be zero
   *  before this step is called done. */
  const unboundFigures = useMemo(
    () => frames.reduce((n, f) => n + f.texts.filter((t) => t.role === "figure" && !t.factId).length, 0),
    [frames],
  );
  /** How much of the cut knows what it does. Authored, not rendered — nothing
   *  here can render a clip, and the surfaces reading this say so. */
  const clipsAuthored = useMemo(() => authoredClipCount(frames), [frames]);

  /* ── what this step tells the shelf ─────────────────────────────────────── */

  /**
   * ONE WORD ABOUT THIS STEP, computed from the same numbers the surface draws.
   *
   * Frames is the first surface in the app to report at all, so the shape of
   * this is the precedent: it derives, it never asserts. Every branch below is
   * a fact already on screen a few pixels away.
   *
   *  · `blocked`  a plate came back refused, or the last direction pass left
   *               reasons on rows. Worst news first, the same order
   *               `worseOf`/`projectState` already rank by.
   *  · `review`   every beat is composed AND a figure still asserts a number
   *               nobody sourced. That is precisely "needs a call": the picture
   *               is finished and a human has to decide about the claim on it.
   *  · `working`  something exists that the user paid for or authored.
   *  · null       NOTHING TO SAY. Deriving frames from the script is not work
   *               the user did — every project would light up merely by opening
   *               the step. `reportPhase` cannot write `empty` anyway; this is
   *               the same rule stated from the reporter's side.
   *
   * `done` IS DELIBERATELY UNREACHABLE. `done` reads as "locked" on every
   * surface (PHASE_STATE_WORD), and locking is a sign-off — a human saying this
   * is finished. Frames has no such control, so a reporter that promoted a full
   * plate count to `done` would be inventing the one state the matrix totals in
   * its footer. Until a lock exists, the honest ceiling is `review`.
   */
  const reported = useMemo<Exclude<PhaseState, "empty"> | null>(() => {
    if (!stepLoaded) return null;
    const refused = frames.filter((f) => f.plate.state === "refused").length;
    if (refused > 0 || Object.keys(rejections).length > 0) return "blocked";
    const composed = composedCount(frames);
    if (composed === 0 && clipsAuthored === 0 && !direction) return null;
    if (frames.length > 0 && composed === frames.length && unboundFigures > 0) return "review";
    return "working";
  }, [stepLoaded, frames, rejections, clipsAuthored, direction, unboundFigures]);

  // Written once per CHANGE of that word, not once per render — the ref carries
  // the project id so switching projects cannot suppress the first report of
  // the second one. A failed write stays SILENT IN THIS SURFACE on purpose: the
  // cell simply stays where it was, which claims nothing, and taking the step
  // down over a ledger entry would be the wrong trade.
  //
  // But it no longer vanishes. `.catch(() => undefined)` made a failed write
  // unobservable to anyone, anywhere — including the case that matters, which is
  // a full quota, because plates are the reason this project is near one. It now
  // reaches the same trouble channel every other storage failure reaches, and the
  // bell says so. Silent in the step, visible in the app.
  const lastReport = useRef<string | null>(null);
  useEffect(() => {
    if (!reported) return;
    const stamp = `${projectId}:${reported}`;
    if (lastReport.current === stamp) return;
    lastReport.current = stamp;
    void reportPhase(projectId, PHASE, reported).catch((e: unknown) => {
      reportStorageTrouble("write", projectId, `${PHASE} · progress`, e);
    });
  }, [reported, projectId]);

  return {
    render,
    facts: FACTS,
    frames,
    /** Set when the step's own record could not be READ. The surface refuses to
     *  draw a ledger over it: an empty cut and an unreadable one look identical
     *  and mean opposite things. */
    loadTrouble,
    // The step does not draw until the style is known — see `styleReady` — nor
    // until the CHAIN is known, which is the new one: drawing before `source`
    // lands is drawing a ledger for a cut nobody has identified yet. A read that
    // FAILED is drawable, because the branch above it is the whole point of the
    // trouble message.
    loaded: Boolean(loadTrouble) || (stepLoaded && styleReady && source !== null),
    busy,
    error,
    block,
    references,
    styleName,
    /** Whether the plates are in the project's OWN style. False means the
     *  label above is a fallback, and the surface colours it as a warning. */
    hasLockedStyle: Boolean(chosen.theme),
    plateCost,
    totalCost,
    direction,
    unboundFigures,
    clipsAuthored,
    setFrames,
    directing,
    direct,
    rejections,
    notice,
    generatePlate,
    setSubject,
    setMotion,
    setText,
    bindFact,
    moveLayer,
    resizeElement,
    reorderLayer,
    toggleHidden,
    addText,
    removeText,
    removeElement,
    reset,
  };
}
